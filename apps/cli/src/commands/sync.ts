import { readClaudeStats } from '../sources/claude.js'
import { readCodexSessions } from '../sources/codex.js'
import { readStore, writeStore } from '../sources/store.js'
import { printHeader } from '../format.js'
import { fromCodexUsage, emptyBreakdown, addBreakdown } from '../token-metrics.js'
import { readConfig, writeConfig } from '../sources/config.js'
import { readStoredApiToken, writeStoredApiToken } from '../sources/api-token.js'
import { readDeviceIdentityPayload } from '../sources/device-identity.js'
import { readExternalUsagePayloads } from '../sources/external-usage.js'
import { linkDevice, readApiBase } from './link-shared.js'
import { maybeAutoUpdate } from './auto-update.js'
import { listAllClaudePayloadsFromLedger, readClaudeLedger } from '../sources/claude-ledger.js'
import {
  applyCodexSessionsToLedger,
  listAllCodexPayloadsFromLedger,
  markCodexKeysUploaded,
  readCodexLedger,
  writeCodexLedger,
  type CodexRealtimeLedger,
} from '../sources/codex-ledger.js'
import type { CodexSessionData } from '../types.js'
import type { UsageDaily } from '@agentic-commons/shared'

const CLAUDE_PROVIDER = 'anthropic'
const CODEX_DEFAULT_PROVIDER = 'openai'

type PayloadIdentity = {
  date: string
  source: string
  provider: string
  model: string
}

type UploadResult = {
  uploaded: PayloadIdentity[]
  total: number
  skippedReason: string | null
}

function buildClaudePayloads(
  claude: Awaited<ReturnType<typeof readClaudeStats>>,
  claudeRealtimePayloads: (UsageDaily & { source: 'claude'; provider: string })[],
): UsageDaily[] {
  if (claudeRealtimePayloads.length > 0) {
    return [...claudeRealtimePayloads]
  }

  const payloads: UsageDaily[] = []
  for (const daily of claude?.dailyModelTokens ?? []) {
    for (const [model, total] of Object.entries(daily.tokensByModel)) {
      payloads.push({
        date: daily.date,
        source: 'claude',
        provider: CLAUDE_PROVIDER,
        model,
        // Claude daily cache file does not expose daily input/output split.
        input_uncached: total,
        output: 0,
        cached_read: 0,
        cached_write: 0,
        total_io: total,
      })
    }
  }
  return payloads
}

function buildCodexFallbackPayloads(codexSessions: CodexSessionData[]): UsageDaily[] {
  const codexByDayModel = new Map<string, ReturnType<typeof emptyBreakdown>>()
  for (const session of codexSessions) {
    const provider = session.provider?.trim().toLowerCase() || CODEX_DEFAULT_PROVIDER
    const model = session.model?.trim() || 'gpt-5'
    const key = `${session.date}|${provider}|${model}`
    const current = codexByDayModel.get(key) ?? emptyBreakdown()
    codexByDayModel.set(key, addBreakdown(current, fromCodexUsage(session.totalTokens)))
  }

  const payloads: UsageDaily[] = []
  for (const [key, total] of codexByDayModel.entries()) {
    const separator = key.indexOf('|')
    if (separator <= 0 || separator >= key.length - 1) {
      continue
    }
    const date = key.slice(0, separator)
    const rest = key.slice(separator + 1)
    const providerSeparator = rest.indexOf('|')
    if (providerSeparator <= 0 || providerSeparator >= rest.length - 1) {
      continue
    }
    const provider = rest.slice(0, providerSeparator)
    const model = rest.slice(providerSeparator + 1)
    payloads.push({
      date,
      source: 'codex',
      provider,
      model,
      input_uncached: total.inputUncached,
      output: total.output,
      cached_read: total.cachedRead,
      cached_write: 0,
      total_io: total.totalIO,
    })
  }

  return payloads
}

function hasPayloadForSource(payloads: UsageDaily[], source: string): boolean {
  return payloads.some(payload => payload.source === source)
}

async function readClaudeRealtimePayloads(): Promise<(UsageDaily & { source: 'claude'; provider: string })[]> {
  const ledger = await readClaudeLedger()
  return listAllClaudePayloadsFromLedger(ledger)
}

async function collectCodexRealtimePayloads(codexSessions: CodexSessionData[]): Promise<{
  payloads: (UsageDaily & { source: 'codex'; provider: string })[]
  ledger: CodexRealtimeLedger
}> {
  const ledger = await readCodexLedger()
  applyCodexSessionsToLedger(ledger, codexSessions)
  const payloads = listAllCodexPayloadsFromLedger(ledger)
  await writeCodexLedger(ledger)

  return { payloads, ledger }
}

function payloadKey(payload: PayloadIdentity): string {
  return `${payload.date}|${payload.provider}|${payload.model}`
}

function deduplicatePayloads(payloads: UsageDaily[]): UsageDaily[] {
  const groups = new Map<string, UsageDaily[]>()
  for (const p of payloads) {
    const key = `${p.date}|${p.source}|${p.model}`
    const group = groups.get(key) ?? []
    group.push(p)
    groups.set(key, group)
  }

  const result: UsageDaily[] = []
  for (const group of groups.values()) {
    const known = group.filter(p => p.provider !== 'unknown')
    result.push(...(known.length > 0 ? known : group))
  }
  return result
}

async function resolveCloudAuth(): Promise<{ apiBase: string | null; token: string | null; devUserId: string | null }> {
  const config = await readConfig()
  const apiBase = readApiBase(config.apiBase)

  const envToken = process.env['ACOMMONS_API_TOKEN']?.trim() ?? null
  if (envToken) {
    return {
      apiBase,
      token: envToken,
      devUserId: null,
    }
  }

  const storedToken = await readStoredApiToken()
  if (storedToken) {
    return {
      apiBase,
      token: storedToken,
      devUserId: null,
    }
  }

  if (config.apiToken) {
    const legacyToken = config.apiToken.trim()
    if (legacyToken) {
      await writeStoredApiToken(legacyToken)
      const { apiToken: _legacyApiToken, ...rest } = config
      await writeConfig(rest)
      return {
        apiBase,
        token: legacyToken,
        devUserId: null,
      }
    }
  }

  if (process.stdout.isTTY && process.stdin.isTTY) {
    try {
      const linked = await linkDevice({ force: true, openBrowser: true })
      if (linked.apiToken) {
        return {
          apiBase,
          token: linked.apiToken,
          devUserId: null,
        }
      }
    } catch {
      // fall through to dev header mode check
    }
  }

  const devHeaderAllowed = process.env['ACOMMONS_ALLOW_DEV_HEADER_AUTH'] === 'true'
  const devUserId = devHeaderAllowed ? process.env['ACOMMONS_USER_ID']?.trim() ?? null : null

  return {
    apiBase,
    token: null,
    devUserId,
  }
}

async function uploadCloudPayloads(payloads: UsageDaily[]): Promise<UploadResult> {
  const auth = await resolveCloudAuth()
  if (!auth.apiBase) {
    return {
      uploaded: [],
      total: payloads.length,
      skippedReason: 'missing_api_base',
    }
  }

  if (!auth.token && !auth.devUserId) {
    return {
      uploaded: [],
      total: payloads.length,
      skippedReason: 'not_linked',
    }
  }

  const uploaded: PayloadIdentity[] = []
  const deviceIdentity = await readDeviceIdentityPayload().catch(() => null)

  for (const payload of payloads) {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    }
    if (auth.token) {
      headers['authorization'] = `Bearer ${auth.token}`
    }
    if (!auth.token && auth.devUserId) {
      headers['x-user-id'] = auth.devUserId
    }

    const response = await fetch(`${auth.apiBase}/v1/usage/daily`, {
      method: 'POST',
      headers,
      body: JSON.stringify(deviceIdentity ? { ...payload, ...deviceIdentity } : payload),
    }).catch(() => null)

    if (response?.ok) {
      uploaded.push({
        date: payload.date,
        source: payload.source,
        provider: payload.provider,
        model: payload.model,
      })
    }
  }

  return {
    uploaded,
    total: payloads.length,
    skippedReason: null,
  }
}

export async function syncCommand(): Promise<void> {
  printHeader('Syncing data...')
  await maybeAutoUpdate()

  const [claude, codexSessions, claudeRealtimePayloads, externalUsage] = await Promise.all([
    readClaudeStats(),
    readCodexSessions(),
    readClaudeRealtimePayloads(),
    readExternalUsagePayloads(),
  ])

  const codexRealtime = await collectCodexRealtimePayloads(codexSessions)
  const codexPayloads = codexRealtime.payloads.length > 0
    ? codexRealtime.payloads
    : buildCodexFallbackPayloads(codexSessions)

  const store = await readStore()
  store.claude.stats = claude
  store.codex.sessions = codexSessions
  await writeStore(store)

  const claudePayloads = buildClaudePayloads(claude, claudeRealtimePayloads)
  const cloudPayloads = deduplicatePayloads([...claudePayloads, ...codexPayloads, ...externalUsage.payloads])
  const upload = await uploadCloudPayloads(cloudPayloads)

  const uploadedCodexKeys = upload.uploaded
    .filter(entry => entry.source === 'codex')
    .map(payloadKey)
  if (uploadedCodexKeys.length > 0) {
    markCodexKeysUploaded(codexRealtime.ledger, uploadedCodexKeys)
    await writeCodexLedger(codexRealtime.ledger)
  }

  const claudeDays = claude?.dailyActivity.length ?? 0
  console.log(`  Claude: ${claudeDays} days of activity`)
  console.log(`  Codex: ${codexSessions.length} sessions`)
  console.log(`  External rows: ${externalUsage.payloads.length}`)
  console.log(`  Saved to ~/.agentic-commons/usage.json`)

  if (upload.skippedReason) {
    console.log(`  Cloud sync: skipped (${upload.skippedReason})`)
  } else {
    console.log(`  Cloud sync: uploaded ${upload.uploaded.length}/${upload.total} daily aggregates`)
  }

  if (hasPayloadForSource(claudePayloads, 'claude') && claudeRealtimePayloads.length > 0) {
    console.log(`  Claude upload source: realtime ledger (${claudeRealtimePayloads.length} rows)`)
  }
  if (hasPayloadForSource(codexPayloads, 'codex') && codexRealtime.payloads.length > 0) {
    console.log(`  Codex upload source: realtime ledger (${codexRealtime.payloads.length} rows)`)
  }
  if (externalUsage.diagnostics.openCodeDirExists) {
    console.log(`  OpenCode scan: jsonl files=${externalUsage.diagnostics.openCodeJsonlFiles} parsed rows=${externalUsage.payloads.filter(row => row.source === 'opencode').length}`)
  }
  console.log()
}
