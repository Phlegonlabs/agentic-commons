#!/usr/bin/env node
import { readFile, readdir, mkdir, writeFile, stat, open, chmod } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir, hostname, platform, arch, cpus, totalmem, release } from 'node:os'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'

// ── Paths ──────────────────────────────────────────────────────────────
const home = homedir()
const claudeStatsPath = join(home, '.claude', 'stats-cache.json')
const claudeLedgerPath = join(home, '.agentic-commons', 'claude-ledger.json')
const codexSessionsDir = join(home, '.codex', 'sessions')
const codexLedgerPath = join(home, '.agentic-commons', 'codex-ledger.json')
const acDir = join(home, '.agentic-commons')
const acConfigPath = join(acDir, 'config.json')
const acApiTokenPath = join(acDir, 'api-token.secret')
const acDeviceSecretPath = join(acDir, 'device-secret.key')
const acUploadTrackerPath = join(acDir, 'upload-tracker.json')
const acExternalUsageDir = join(acDir, 'external-usage')
const openCodeDir = platform() === 'win32'
  ? join(home, 'AppData', 'Roaming', 'opencode')
  : join(home, '.opencode')
const openCodeDbPath = join(home, '.local', 'share', 'opencode', 'opencode.db')
const geminiTmpDir = join(home, '.gemini', 'tmp')

const log = (msg) => console.error(`[acommons] ${msg}`)

// ── Helpers ────────────────────────────────────────────────────────────
const tryReadJson = async (p) => {
  try { return JSON.parse(await readFile(p, 'utf8')) }
  catch { return null }
}

const clamp0 = (n) => Math.max(0, n || 0)

const makeRow = (date, source, provider, model, inp, out, cr, cw) => ({
  date, source, provider, model,
  input_uncached: clamp0(inp), output: clamp0(out),
  cached_read: clamp0(cr), cached_write: clamp0(cw),
  total_io: clamp0(inp) + clamp0(out),
})

const rowKey = (r) => `${r.date}|${r.source}|${r.provider}|${r.model}`

// ── Stage 1: DETECT ────────────────────────────────────────────────────
const detect = () => {
  const tools = {
    claude: existsSync(join(home, '.claude')),
    codex: existsSync(join(home, '.codex')),
    opencode: existsSync(openCodeDir) || existsSync(openCodeDbPath),
    gemini: existsSync(join(home, '.gemini')),
    external: existsSync(acExternalUsageDir),
  }
  const found = Object.entries(tools).filter(([, v]) => v).map(([k]) => k)
  log(`Detected: ${found.length ? found.join(', ') : 'none'}`)
  return tools
}

// ── Stage 2: READ ──────────────────────────────────────────────────────

// Claude
const readClaude = async () => {
  const ledger = await tryReadJson(claudeLedgerPath)
  if (ledger?.dailyByModel) return readClaudeLedger(ledger)
  return readClaudeStatsCache()
}

const readClaudeLedger = (ledger) => {
  const rows = []
  for (const [date, models] of Object.entries(ledger.dailyByModel)) {
    for (const [model, t] of Object.entries(models)) {
      rows.push(makeRow(date, 'claude', 'anthropic', model,
        t.inputUncached, t.output, t.cachedRead, t.cachedWrite))
    }
  }
  return { rows, source: 'ledger' }
}

const readClaudeStatsCache = async () => {
  const data = await tryReadJson(claudeStatsPath)
  if (!data?.dailyModelTokens) return { rows: [], source: 'stats-cache' }
  const rows = []
  for (const day of data.dailyModelTokens) {
    for (const [model, total] of Object.entries(day.tokensByModel || {})) {
      rows.push(makeRow(day.date, 'claude', 'anthropic', model, total, 0, 0, 0))
    }
  }
  return { rows, source: 'stats-cache' }
}

// Codex
const readCodex = async () => {
  const ledger = await tryReadJson(codexLedgerPath)
  if (ledger?.dailyByModel) return readCodexLedger(ledger)
  return readCodexSessions()
}

const readCodexLedger = (ledger) => {
  const rows = []
  for (const [date, entries] of Object.entries(ledger.dailyByModel)) {
    for (const [jsonKey, t] of Object.entries(entries)) {
      const [provider, model] = safeParse(jsonKey) || ['openai', 'gpt-5']
      rows.push(makeRow(date, 'codex', provider || 'openai', model || 'gpt-5',
        t.inputUncached, t.output, t.cachedRead, t.cachedWrite))
    }
  }
  return { rows, sessions: rows.length, source: 'ledger' }
}

const safeParse = (s) => { try { return JSON.parse(s) } catch { return null } }

const readCodexSessions = async () => {
  const files = await walkDir(codexSessionsDir, 5, (f) => f.endsWith('.jsonl'))
  const byKey = new Map()
  let sessions = 0
  for (const f of files) {
    const parsed = await parseCodexSession(f)
    if (!parsed) continue
    sessions++
    const k = `${parsed.date}|${parsed.provider}|${parsed.model}`
    const prev = byKey.get(k) || { inp: 0, out: 0, cr: 0, cw: 0 }
    byKey.set(k, {
      inp: prev.inp + parsed.inp, out: prev.out + parsed.out,
      cr: prev.cr + parsed.cr, cw: prev.cw + parsed.cw,
      date: parsed.date, provider: parsed.provider, model: parsed.model,
    })
  }
  const rows = [...byKey.values()].map((v) =>
    makeRow(v.date, 'codex', v.provider, v.model, v.inp, v.out, v.cr, v.cw))
  return { rows, sessions, source: 'sessions' }
}

const parseCodexSession = async (filePath) => {
  try {
    const fh = await open(filePath, 'r')
    const fstat = await fh.stat()
    const size = fstat.size
    if (size === 0) { await fh.close(); return null }

    // Read head for session_meta
    const headBuf = Buffer.alloc(Math.min(16384, size))
    await fh.read(headBuf, 0, headBuf.length, 0)
    const headStr = headBuf.toString('utf8')
    const firstLine = headStr.split('\n')[0]
    const meta = safeParse(firstLine)
    const metaDate = meta?.payload?.id?.slice(0, 10)
    let provider = meta?.payload?.model_provider || 'openai'

    // Read tail for tokens + model
    let tailStr = await readTailStr(fh, size, 8192)
    let tokens = extractTokens(tailStr)
    if (!tokens) {
      tailStr = await readTailStr(fh, size, 65536)
      tokens = extractTokens(tailStr)
    }
    const model = extractCodexModel(tailStr) || 'gpt-5'
    await fh.close()
    if (!tokens) return null

    const date = metaDate || new Date().toISOString().slice(0, 10)
    return {
      date, provider, model,
      inp: clamp0(tokens.input_tokens - (tokens.cached_input_tokens || 0)),
      out: clamp0(tokens.output_tokens),
      cr: clamp0(tokens.cached_input_tokens), cw: 0,
    }
  } catch { return null }
}

const readTailStr = async (fh, size, bytes) => {
  const len = Math.min(bytes, size)
  const buf = Buffer.alloc(len)
  await fh.read(buf, 0, len, size - len)
  return buf.toString('utf8')
}

const extractTokens = (tail) => {
  const lines = tail.split('\n').reverse()
  for (const line of lines) {
    const obj = safeParse(line)
    if (obj?.type === 'event_msg' && obj?.payload?.type === 'token_count')
      return obj.payload.info?.total_token_usage || null
  }
  return null
}

const extractCodexModel = (tail) => {
  const lines = tail.split('\n').reverse()
  for (const line of lines) {
    const obj = safeParse(line)
    if (obj?.type === 'turn_context')
      return obj.payload?.model || obj.payload?.settings?.model || null
  }
  return null
}

// OpenCode
const readOpenCode = async () => {
  if (!existsSync(openCodeDbPath)) return { rows: [], source: 'sqlite' }
  try {
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(openCodeDbPath, { readOnly: true })
    const sql = `
      SELECT date(time_created/1000,'unixepoch','localtime') as date,
        json_extract(data,'$.providerID') as provider,
        json_extract(data,'$.modelID') as model,
        COALESCE(SUM(json_extract(data,'$.tokens.input')),0) as inputUncached,
        COALESCE(SUM(json_extract(data,'$.tokens.output')),0) as output,
        COALESCE(SUM(json_extract(data,'$.tokens.cache.read')),0) as cachedRead,
        COALESCE(SUM(json_extract(data,'$.tokens.cache.write')),0) as cachedWrite
      FROM message
      WHERE json_extract(data,'$.role')='assistant'
        AND json_extract(data,'$.tokens') IS NOT NULL
      GROUP BY date, provider, model`
    const stmt = db.prepare(sql)
    const dbRows = stmt.all()
    db.close()
    const rows = dbRows.map((r) =>
      makeRow(r.date, 'opencode', r.provider || 'unknown', r.model || 'unknown',
        r.inputUncached, r.output, r.cachedRead, r.cachedWrite))
    return { rows, source: 'sqlite' }
  } catch (err) { log(`OpenCode DB error: ${err.message}`); return { rows: [], source: 'sqlite' } }
}

// Gemini
const readGemini = async () => {
  const pattern = join(geminiTmpDir, '*', 'chats', 'session-*.json')
  const files = await findGeminiSessions()
  let sessions = 0
  const byKey = new Map()
  for (const f of files) {
    const parsed = await parseGeminiSession(f)
    if (!parsed.length) continue
    sessions++
    for (const entry of parsed) mergeIntoMap(byKey, entry)
  }
  const rows = [...byKey.values()].map((v) =>
    makeRow(v.date, 'gemini', 'google', v.model, v.inp, v.out, v.cr, v.cw))
  return { rows, sessions }
}

const findGeminiSessions = async () => {
  if (!existsSync(geminiTmpDir)) return []
  const results = []
  try {
    const dirs = await readdir(geminiTmpDir)
    for (const d of dirs) {
      const chatsDir = join(geminiTmpDir, d, 'chats')
      if (!existsSync(chatsDir)) continue
      const files = await readdir(chatsDir)
      for (const f of files) {
        if (f.startsWith('session-') && f.endsWith('.json'))
          results.push(join(chatsDir, f))
      }
    }
  } catch { /* empty dir */ }
  return results
}

const parseGeminiSession = async (filePath) => {
  const data = await tryReadJson(filePath)
  if (!data?.messages) return []
  const date = data.startTime?.slice(0, 10) || new Date().toISOString().slice(0, 10)
  const entries = []
  for (const msg of data.messages) {
    if (msg.type !== 'gemini' || !msg.tokens) continue
    const t = msg.tokens
    const model = msg.model || 'gemini'
    entries.push({
      date, model,
      inp: clamp0((t.input || 0) - (t.cached || 0)),
      out: clamp0(t.output), cr: clamp0(t.cached), cw: 0,
    })
  }
  return entries
}

const mergeIntoMap = (map, entry) => {
  const k = `${entry.date}|${entry.model}`
  const prev = map.get(k) || { date: entry.date, model: entry.model, inp: 0, out: 0, cr: 0, cw: 0 }
  prev.inp += entry.inp; prev.out += entry.out
  prev.cr += entry.cr; prev.cw += entry.cw
  map.set(k, prev)
}

// External Usage
const readExternal = async (hasOpenCodeDb) => {
  const rows = []
  if (existsSync(acExternalUsageDir))
    rows.push(...await readJsonlDir(acExternalUsageDir, 2, null))
  if (existsSync(openCodeDir)) {
    const sessionPattern = /session|history|conversation|chat|log/i
    rows.push(...await readJsonlDir(openCodeDir, 5, sessionPattern))
  }
  const merged = mergeExternalRows(rows)
  if (hasOpenCodeDb) return merged.filter((r) => r.source !== 'opencode')
  return merged
}

const readJsonlDir = async (dir, maxDepth, nameFilter) => {
  const files = await walkDir(dir, maxDepth, (f) =>
    (f.endsWith('.jsonl') || f.endsWith('.ndjson')) &&
    (!nameFilter || nameFilter.test(f)))
  const rows = []
  for (const f of files) rows.push(...await parseJsonlFile(f))
  return rows
}

const parseJsonlFile = async (filePath) => {
  try {
    const text = await readFile(filePath, 'utf8')
    const basename = filePath.split(/[/\\]/).pop().replace(/\.(jsonl|ndjson)$/, '')
    const rows = []
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      const obj = safeParse(line)
      if (!obj) continue
      const row = parseExternalLine(obj, basename)
      if (row) rows.push(row)
    }
    return rows
  } catch { return [] }
}

const parseExternalLine = (obj, defaultSource) => {
  const date = extractDate(obj)
  const model = (obj.model || '').slice(0, 128)
  if (!model || !date) return null
  const tokens = normalizeTokens(obj)
  const total = tokens.inp + tokens.out + tokens.cr + tokens.cw
  if (total <= 0) return null
  const provider = obj.provider || inferProvider(model)
  const source = obj.source || defaultSource
  return { date, source, provider, model, ...tokens }
}

const extractDate = (obj) => {
  const raw = obj.date || obj.timestamp || obj.created_at || obj.created
  if (!raw) return null
  if (typeof raw === 'number')
    return new Date(raw > 1e12 ? raw : raw * 1000).toISOString().slice(0, 10)
  return String(raw).slice(0, 10)
}

const normalizeTokens = (obj) => {
  if (obj.input_uncached != null)
    return { inp: clamp0(obj.input_uncached), out: clamp0(obj.output),
             cr: clamp0(obj.cached_read), cw: clamp0(obj.cached_write) }
  const u = obj.usage || obj.usageMetadata || {}
  if (u.input_tokens != null)
    return { inp: clamp0(u.input_tokens), out: clamp0(u.output_tokens),
             cr: clamp0(u.cache_read_input_tokens), cw: clamp0(u.cache_creation_input_tokens) }
  const prompt = clamp0(u.prompt_tokens ?? u.promptTokenCount)
  const compl = clamp0(u.completion_tokens ?? u.candidatesTokenCount)
  const cached = clamp0(u.prompt_tokens_details?.cached_tokens ?? u.cachedContentTokenCount)
  return { inp: clamp0(prompt - cached), out: compl, cr: cached, cw: 0 }
}

const PROVIDER_PATTERNS = [
  [/^(gpt-|o1-|o3-|o4-)/, 'openai'],
  [/^claude-/, 'anthropic'],
  [/^gemini-/, 'google'],
]

const inferProvider = (model) => {
  for (const [re, p] of PROVIDER_PATTERNS) if (re.test(model)) return p
  return 'unknown'
}

const mergeExternalRows = (rows) => {
  const map = new Map()
  for (const r of rows) {
    const k = `${r.date}|${r.source}|${r.provider}|${r.model}`
    const prev = map.get(k)
    if (!prev) { map.set(k, { ...r }); continue }
    prev.inp += r.inp; prev.out += r.out; prev.cr += r.cr; prev.cw += r.cw
  }
  return [...map.values()].map((v) =>
    makeRow(v.date, v.source, v.provider, v.model, v.inp, v.out, v.cr, v.cw))
}

// ── Walk directory helper ──────────────────────────────────────────────
const walkDir = async (dir, maxDepth, filter, depth = 0) => {
  if (!existsSync(dir) || depth > maxDepth) return []
  const results = []
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isDirectory()) results.push(...await walkDir(full, maxDepth, filter, depth + 1))
      else if (filter(e.name)) results.push(full)
    }
  } catch { /* permission denied */ }
  return results
}

// ── Stage 3: NORMALIZE + DEDUPLICATE ───────────────────────────────────
const dedup = (allRows) => {
  const map = new Map()
  for (const r of allRows) {
    const k = `${r.date}|${r.source}|${r.model}`
    const prev = map.get(k)
    if (!prev || (prev.provider === 'unknown' && r.provider !== 'unknown'))
      map.set(k, r)
  }
  return [...map.values()].filter((r) => r.total_io >= 1000)
}

// ── Stage 4: UPLOAD ────────────────────────────────────────────────────
const resolveApiBase = async () => {
  if (process.env.ACOMMONS_API_URL) return process.env.ACOMMONS_API_URL
  const cfg = await tryReadJson(acConfigPath)
  if (cfg?.apiBase) return cfg.apiBase
  if (process.env.ACOMMONS_LOCAL_API === 'true') return 'http://127.0.0.1:8787'
  return 'https://api.agenticcommons.xyz'
}

const resolveAuth = async () => {
  if (process.env.ACOMMONS_API_TOKEN)
    return { headers: { authorization: `Bearer ${process.env.ACOMMONS_API_TOKEN}` } }
  if (existsSync(acApiTokenPath)) {
    const token = platform() === 'win32'
      ? await decryptWindowsToken()
      : (await readFile(acApiTokenPath, 'utf8')).trim()
    if (token) return { headers: { authorization: `Bearer ${token}` } }
  }
  if (process.env.ACOMMONS_ALLOW_DEV_HEADER_AUTH === 'true' && process.env.ACOMMONS_USER_ID)
    return { headers: { 'x-user-id': process.env.ACOMMONS_USER_ID } }
  return null
}

const decryptWindowsToken = () => new Promise((resolve) => {
  const cmd = `$s = Get-Content '${acApiTokenPath.replace(/'/g, "''")}'; $ss = ConvertTo-SecureString $s; $p = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($ss)); Write-Output $p`
  const ps = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', cmd])
  let out = ''
  ps.stdout.on('data', (d) => { out += d })
  ps.on('close', (code) => resolve(code === 0 ? out.trim() : null))
  ps.on('error', () => resolve(null))
  setTimeout(() => { ps.kill(); resolve(null) }, 5000)
})

const getDeviceIdentity = async () => {
  let secret
  if (existsSync(acDeviceSecretPath)) {
    secret = (await readFile(acDeviceSecretPath, 'utf8')).trim()
  } else {
    secret = randomBytes(32).toString('hex')
    await mkdir(acDir, { recursive: true })
    await writeFile(acDeviceSecretPath, secret, { mode: 0o600 })
  }
  const cpuCount = cpus().length
  const memGB = totalmem() / (1024 ** 3)
  return {
    device_secret: secret,
    device_label: hostname().slice(0, 128),
    device_profile: {
      hostname: hostname(), platform: platform(), arch: arch(),
      osVersion: release(),
      cpuBucket: cpuCount <= 2 ? '1-2' : cpuCount <= 4 ? '3-4' : cpuCount <= 8 ? '5-8' : cpuCount <= 16 ? '9-16' : '17+',
      memoryBucket: memGB < 4 ? '<4gb' : memGB < 8 ? '4-8gb' : memGB < 16 ? '8-16gb' : memGB < 32 ? '16-32gb' : '32gb+',
      signals: detectSignals(),
    },
  }
}

const detectSignals = () => {
  const s = []
  if (process.env.CI) s.push('ci')
  if (existsSync('/.dockerenv')) s.push('docker')
  if (process.env.KUBERNETES_SERVICE_HOST) s.push('kubernetes')
  if (process.env.CONTAINER) s.push('container')
  return s
}

const upload = async (payloads) => {
  const tracker = (await tryReadJson(acUploadTrackerPath)) || {}
  const changed = payloads.filter((p) => tracker[rowKey(p)] !== p.total_io)
  if (!changed.length) return { uploaded: 0, total: payloads.length, unchanged: payloads.length }

  const auth = await resolveAuth()
  if (!auth) { log('No auth configured, skipping upload'); return { uploaded: 0, total: payloads.length, unchanged: 0, noAuth: true } }

  const apiBase = await resolveApiBase()
  const device = await getDeviceIdentity()
  let uploaded = 0

  for (const p of changed) {
    try {
      const res = await fetch(`${apiBase}/v1/usage/daily`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...auth.headers },
        body: JSON.stringify({ ...p, ...device }),
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) { tracker[rowKey(p)] = p.total_io; uploaded++ }
      else log(`Upload failed (${res.status}): ${p.date} ${p.source} ${p.model}`)
    } catch (err) { log(`Upload error: ${err.message}`) }
  }

  await mkdir(acDir, { recursive: true })
  await writeFile(acUploadTrackerPath, JSON.stringify(tracker, null, 2))
  return { uploaded, total: payloads.length, unchanged: payloads.length - changed.length }
}

// ── Main ───────────────────────────────────────────────────────────────
const main = async () => {
  log('Starting collect...')
  const tools = detect()

  const claude = tools.claude ? await readClaude() : { rows: [], source: 'n/a' }
  const codex = tools.codex ? await readCodex() : { rows: [], sessions: 0, source: 'n/a' }
  const opencode = tools.opencode ? await readOpenCode() : { rows: [], source: 'sqlite' }
  const gemini = tools.gemini ? await readGemini() : { rows: [], sessions: 0 }
  const external = tools.external || existsSync(openCodeDir)
    ? await readExternal(opencode.rows.length > 0)
    : []

  const all = [...claude.rows, ...codex.rows, ...opencode.rows, ...gemini.rows, ...external]
  const final = dedup(all)
  log(`Normalized: ${final.length} rows from ${all.length} raw`)

  const result = await upload(final)

  log('Collect complete')
  log(`  Claude: ${claude.rows.length} days of activity (source: ${claude.source})`)
  log(`  Codex: ${codex.sessions ?? codex.rows.length} sessions (source: ${codex.source})`)
  log(`  OpenCode: ${opencode.rows.length} rows (source: ${opencode.source})`)
  log(`  Gemini: ${gemini.sessions ?? 0} sessions`)
  log(`  External: ${external.length} rows`)
  log(`  Upload: ${result.uploaded}/${final.length} (${result.unchanged} unchanged, skipped)`)
}

main().catch((err) => { console.error('[acommons] Fatal:', err.message); process.exit(1) })
