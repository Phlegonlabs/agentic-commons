#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir, hostname, platform, arch, cpus, totalmem, release } from 'node:os'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'

// ── Paths ──────────────────────────────────────────────────────────────
const home = homedir()
const claudeStatsPath = join(home, '.claude', 'stats-cache.json')
const acDir = join(home, '.agentic-commons')
const acClaudeLedgerPath = join(acDir, 'claude-ledger.json')
const acConfigPath = join(acDir, 'config.json')
const acApiTokenPath = join(acDir, 'api-token.secret')
const acDeviceSecretPath = join(acDir, 'device-secret.key')

// ── Helpers ────────────────────────────────────────────────────────────
const tryReadJson = async (p) => {
  try { return JSON.parse(await readFile(p, 'utf8')) } catch { return null }
}

const toFiniteInt = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0 }
const today = () => new Date().toISOString().slice(0, 10)
const fmt = (n) => n.toLocaleString('en-US')

const isoDateFromTimestamp = (ts) => {
  if (!ts) return today()
  if (typeof ts === 'number') return new Date(ts > 1e12 ? ts : ts * 1000).toISOString().slice(0, 10)
  return String(ts).slice(0, 10)
}

// ── Step 1: Read stdin ─────────────────────────────────────────────────
const readStdin = () => new Promise((resolve) => {
  if (process.stdin.isTTY) return resolve({})
  let buf = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => { buf += chunk })
  process.stdin.on('end', () => {
    try { resolve(JSON.parse(buf)) } catch { resolve({}) }
  })
  process.stdin.on('error', () => resolve({}))
  setTimeout(() => resolve({}), 3000)
})

// ── Step 2: Read Claude stats cache ────────────────────────────────────
const readStatsCache = async () => {
  const data = await tryReadJson(claudeStatsPath)
  if (!data) return null
  const todayStr = today()
  const activity = data.dailyActivity?.find((d) => d.date === todayStr)
  const tokens = data.dailyModelTokens?.find((d) => d.date === todayStr)
  if (!activity && !tokens) return null
  return { messageCount: activity?.messageCount ?? 0, tokensByModel: tokens?.tokensByModel ?? {} }
}

// ── Step 3: Transcript parsing ─────────────────────────────────────────
const eventIdFromEntry = (entry, lineNumber) => {
  const msg = entry.message
  if (msg && typeof msg.id === 'string') return `msg:${msg.id}`
  if (typeof entry.requestId === 'string') return `req:${entry.requestId}`
  if (typeof entry.uuid === 'string') return `uuid:${entry.uuid}`
  return `line:${lineNumber}`
}

const extractUsageRow = (entry, lineNumber) => {
  if (entry.type !== 'assistant') return null
  const message = (typeof entry.message === 'object' && entry.message) ? entry.message : null
  if (!message || message.role !== 'assistant') return null
  const usage = message.usage
  if (!usage) return null
  const inputUncached = toFiniteInt(usage.input_tokens ?? usage.inputTokens)
  const output = toFiniteInt(usage.output_tokens ?? usage.outputTokens)
  const cachedRead = toFiniteInt(usage.cache_read_input_tokens ?? usage.cacheReadInputTokens)
  const cachedWrite = toFiniteInt(usage.cache_creation_input_tokens ?? usage.cacheCreationInputTokens)
  const totalIO = inputUncached + output
  if (totalIO + cachedRead + cachedWrite <= 0) return null
  const model = typeof message.model === 'string' && message.model.trim() ? message.model.trim() : null
  if (!model) return null
  const sessionId = typeof entry.sessionId === 'string' ? entry.sessionId : null
  const eventId = eventIdFromEntry(entry, lineNumber)
  const date = isoDateFromTimestamp(entry.timestamp)
  return { eventId, sessionId, date, model, usage: { inputUncached, output, cachedRead, cachedWrite, totalIO } }
}

// ── Step 3b: Cursor management ─────────────────────────────────────────
const getCursor = (ledger, sessionId, transcriptPath) => {
  if (sessionId) {
    const bySession = ledger.cursors[`session:${sessionId}`]
    if (bySession) return bySession
  }
  return ledger.cursors[`path:${transcriptPath}`] ?? null
}

const setCursor = (ledger, sessionId, transcriptPath, processedLines) => {
  const value = { transcriptPath, processedLines, sessionId, updatedAt: new Date().toISOString() }
  if (sessionId) ledger.cursors[`session:${sessionId}`] = value
  ledger.cursors[`path:${transcriptPath}`] = value
}

// ── Step 3c: Process transcript ────────────────────────────────────────
const processTranscript = (transcriptPath, sessionId, ledger) => {
  const text = readFileSync(transcriptPath, 'utf8')
  const lines = text.split('\n')
  const cursor = getCursor(ledger, sessionId, transcriptPath)
  const startLine = cursor?.processedLines ?? 0
  const seenIds = new Set()
  const rows = []
  for (let i = startLine; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    let entry
    try { entry = JSON.parse(lines[i]) } catch { continue }
    const row = extractUsageRow(entry, i)
    if (!row) continue
    if (seenIds.has(row.eventId)) continue
    seenIds.add(row.eventId)
    rows.push(row)
  }
  setCursor(ledger, sessionId, transcriptPath, lines.length)
  return rows
}

// ── Step 4: Update ledger ──────────────────────────────────────────────
const updateLedger = (ledger, rows) => {
  const touchedKeys = new Set()
  for (const row of rows) {
    if (!ledger.dailyByModel[row.date]) ledger.dailyByModel[row.date] = {}
    const dayBucket = ledger.dailyByModel[row.date]
    if (!dayBucket[row.model]) dayBucket[row.model] = { inputUncached: 0, output: 0, cachedRead: 0, cachedWrite: 0, totalIO: 0 }
    const m = dayBucket[row.model]
    m.inputUncached += row.usage.inputUncached
    m.output += row.usage.output
    m.cachedRead += row.usage.cachedRead
    m.cachedWrite += row.usage.cachedWrite
    m.totalIO += row.usage.totalIO
    touchedKeys.add(`${row.date}|${row.model}`)
  }
  return touchedKeys
}

// ── Step 5: Build payloads ─────────────────────────────────────────────
const buildPayloads = (ledger, touchedKeys) => {
  const payloads = []
  for (const key of touchedKeys) {
    const [date, model] = key.split('|')
    const t = ledger.dailyByModel[date]?.[model]
    if (!t || t.totalIO <= 0) continue
    payloads.push({
      date, source: 'claude', provider: 'anthropic', model,
      input_uncached: t.inputUncached, output: t.output,
      cached_read: t.cachedRead, cached_write: t.cachedWrite,
      total_io: t.totalIO,
    })
  }
  return payloads
}

const buildStatsCacheFallback = (statsCache) => {
  if (!statsCache?.tokensByModel) return []
  const date = today()
  return Object.entries(statsCache.tokensByModel)
    .filter(([, total]) => total > 0)
    .map(([model, total]) => ({
      date, source: 'claude', provider: 'anthropic', model,
      input_uncached: total, output: 0, cached_read: 0, cached_write: 0, total_io: total,
    }))
}

// ── Step 6: Auth + Upload ──────────────────────────────────────────────
const runPowerShell = (script) => new Promise((resolve, reject) => {
  const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = '', stderr = ''
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  child.on('error', reject)
  child.on('close', (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.trim())))
  setTimeout(() => { child.kill(); reject(new Error('powershell timeout')) }, 5000)
})

const readApiToken = async () => {
  const envToken = process.env.ACOMMONS_API_TOKEN?.trim()
  if (envToken) return envToken
  try {
    const raw = (await readFile(acApiTokenPath, 'utf-8')).trim()
    if (!raw) return null
    if (platform() === 'win32') {
      const script = `$s = ConvertTo-SecureString -String '${raw.replace(/'/g, "''")}'; $p = [System.Net.NetworkCredential]::new('', $s).Password; Write-Output $p`
      return await runPowerShell(script)
    }
    return raw
  } catch { return null }
}

const resolveAuth = async () => {
  const token = await readApiToken()
  if (token) return { authorization: `Bearer ${token}` }
  if (process.env.ACOMMONS_ALLOW_DEV_HEADER_AUTH === 'true' && process.env.ACOMMONS_USER_ID)
    return { 'x-user-id': process.env.ACOMMONS_USER_ID }
  return null
}

const resolveApiBase = async () => {
  if (process.env.ACOMMONS_API_URL) return process.env.ACOMMONS_API_URL
  const cfg = await tryReadJson(acConfigPath)
  if (cfg?.apiBase) return cfg.apiBase
  if (process.env.ACOMMONS_LOCAL_API === 'true') return 'http://127.0.0.1:8787'
  return 'https://api.agenticcommons.xyz'
}

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
      hostname: hostname(), platform: platform(), arch: arch(), osVersion: release(),
      cpuBucket: cpuCount <= 2 ? '1-2' : cpuCount <= 4 ? '3-4' : cpuCount <= 8 ? '5-8' : cpuCount <= 16 ? '9-16' : '17+',
      memoryBucket: memGB < 4 ? '<4gb' : memGB < 8 ? '4-8gb' : memGB < 16 ? '8-16gb' : memGB < 32 ? '16-32gb' : '32gb+',
    },
  }
}

const uploadPayloads = async (payloads) => {
  const authHeaders = await resolveAuth()
  if (!authHeaders) return null
  const apiBase = await resolveApiBase()
  const device = await getDeviceIdentity()
  let ok = 0
  for (const p of payloads) {
    try {
      const res = await fetch(`${apiBase}/v1/usage/daily`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders },
        body: JSON.stringify({ ...p, ...device }),
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) ok++
    } catch { /* network error, skip */ }
  }
  return { ok, total: payloads.length }
}

// ── Step 7: Summary ────────────────────────────────────────────────────
const logSummary = (date, stats, rowCount, source, uploadResult) => {
  const msgs = stats?.messageCount ?? '?'
  const totalTokens = stats?.tokensByModel ? Object.values(stats.tokensByModel).reduce((a, b) => a + b, 0) : 0
  const tokensStr = totalTokens > 0 ? fmt(totalTokens) : '?'
  const uploadStr = uploadResult ? `${uploadResult.ok}/${uploadResult.total}` : 'skipped'
  if (!uploadResult) {
    console.log(`[acommons] cloud upload skipped: run 'acommons link' once on this device`)
    return
  }
  console.log(`[acommons] ${date} | ${msgs} msgs | ${tokensStr} tokens | source: ${source} | upload: ${uploadStr}`)
}

// ── Main ───────────────────────────────────────────────────────────────
const main = async () => {
  const stdin = await readStdin()
  const { transcript_path: transcriptPath, session_id: sessionId } = stdin
  const statsCache = await readStatsCache()
  const date = today()

  // Load or init ledger
  await mkdir(acDir, { recursive: true })
  const ledger = (await tryReadJson(acClaudeLedgerPath)) || { version: 1, dailyByModel: {}, cursors: {} }
  if (!ledger.dailyByModel) ledger.dailyByModel = {}
  if (!ledger.cursors) ledger.cursors = {}

  // Process transcript if available
  let rows = []
  if (transcriptPath && existsSync(transcriptPath)) {
    rows = processTranscript(transcriptPath, sessionId, ledger)
  }

  const touchedKeys = updateLedger(ledger, rows)

  // Build payloads from realtime or fall back to stats-cache
  let payloads = buildPayloads(ledger, touchedKeys)
  let source = `realtime(${rows.length} rows)`
  if (payloads.length === 0) {
    payloads = buildStatsCacheFallback(statsCache)
    source = `stats-cache(${payloads.length} rows)`
  }
  payloads = payloads.filter((p) => p.total_io > 0)

  // Save ledger
  await writeFile(acClaudeLedgerPath, JSON.stringify(ledger, null, 2))

  // Upload
  const uploadResult = payloads.length > 0 ? await uploadPayloads(payloads) : null
  logSummary(date, statsCache, rows.length, source, uploadResult)
}

main().catch((err) => { console.error('[acommons] hook error:', err.message); process.exit(1) })
