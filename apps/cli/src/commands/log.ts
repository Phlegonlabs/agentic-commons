import { readClaudeStats } from '../sources/claude.js'
import { readStore, writeStore } from '../sources/store.js'
import { fmtNum } from '../format.js'
import { readConfig, writeConfig } from '../sources/config.js'
import { readStoredApiToken, writeStoredApiToken } from '../sources/api-token.js'
import { readDeviceIdentityPayload } from '../sources/device-identity.js'
import { readApiBase } from './link-shared.js'
import {
  addRowsToLedger,
  getCursor,
  listDailyPayloadsFromLedger,
  readClaudeLedger,
  setCursor,
  writeClaudeLedger,
} from '../sources/claude-ledger.js'
import {
  readHookInput,
  readIncrementalTranscriptUsage,
  sessionIdFromHook,
  transcriptPathFromHook,
} from '../sources/claude-transcript.js'
import type { UsageDaily } from '@agentic-commons/shared'

type ClaudePayload = UsageDaily & { source: 'claude' }

type UploadResult = {
  uploaded: number
  total: number
  skippedReason: string | null
  hasFailures: boolean
}

type RealtimeAggregation = {
  payloads: ClaudePayload[]
  newRows: number
  usedTranscript: boolean
}

async function resolveCloudAuthNonInteractive(): Promise<{ apiBase: string | null; token: string | null; devUserId: string | null }> {
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

  const devHeaderAllowed = process.env['ACOMMONS_ALLOW_DEV_HEADER_AUTH'] === 'true'
  const devUserId = devHeaderAllowed ? process.env['ACOMMONS_USER_ID']?.trim() ?? null : null
  return {
    apiBase,
    token: null,
    devUserId,
  }
}

async function uploadClaudePayloads(payloads: ClaudePayload[]): Promise<UploadResult> {
  const filteredPayloads = payloads
    .filter(payload => Number.isFinite(payload.total_io) && payload.total_io > 0)

  if (filteredPayloads.length === 0) {
    return { uploaded: 0, total: 0, skippedReason: 'no_today_tokens', hasFailures: false }
  }

  const auth = await resolveCloudAuthNonInteractive()
  if (!auth.apiBase) {
    return { uploaded: 0, total: filteredPayloads.length, skippedReason: 'missing_api_base', hasFailures: false }
  }

  if (!auth.token && !auth.devUserId) {
    return { uploaded: 0, total: filteredPayloads.length, skippedReason: 'not_linked', hasFailures: false }
  }

  let uploaded = 0
  const deviceIdentity = await readDeviceIdentityPayload().catch(() => null)

  for (const payload of filteredPayloads) {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    }
    if (auth.token) {
      headers['authorization'] = `Bearer ${auth.token}`
    } else if (auth.devUserId) {
      headers['x-user-id'] = auth.devUserId
    }

    const response = await fetch(`${auth.apiBase}/v1/usage/daily`, {
      method: 'POST',
      headers,
      body: JSON.stringify(deviceIdentity ? { ...payload, ...deviceIdentity } : payload),
      signal: AbortSignal.timeout(5000),
    }).catch(() => null)

    if (response?.ok) {
      uploaded++
    }
  }

  return { uploaded, total: filteredPayloads.length, skippedReason: null, hasFailures: uploaded < filteredPayloads.length }
}

function payloadsFromStatsCache(today: string, tokensByModel: Record<string, number>): ClaudePayload[] {
  return Object.entries(tokensByModel)
    .filter((entry) => Number.isFinite(entry[1]) && entry[1] > 0)
    .map(([model, total]) => ({
      date: today,
      source: 'claude',
      model,
      input_uncached: total,
      output: 0,
      cached_read: 0,
      cached_write: 0,
      total_io: total,
    }))
}

async function collectRealtimePayloadsFromHook(): Promise<RealtimeAggregation> {
  const hookInput = await readHookInput()
  const transcriptPath = transcriptPathFromHook(hookInput)
  if (!transcriptPath) {
    return {
      payloads: [],
      newRows: 0,
      usedTranscript: false,
    }
  }

  const hookSessionId = sessionIdFromHook(hookInput)
  const ledger = await readClaudeLedger()
  const cursor = getCursor(ledger, hookSessionId, transcriptPath)
  const incremental = await readIncrementalTranscriptUsage(
    transcriptPath,
    cursor?.processedLines ?? 0,
  )
  if (!incremental) {
    return {
      payloads: [],
      newRows: 0,
      usedTranscript: true,
    }
  }

  const sessionId = hookSessionId ?? incremental.sessionId
  setCursor(ledger, sessionId, transcriptPath, incremental.totalLines)
  const touchedKeys = addRowsToLedger(ledger, incremental.newRows)
  await writeClaudeLedger(ledger)

  return {
    payloads: listDailyPayloadsFromLedger(ledger, touchedKeys).map(payload => ({
      ...payload,
      source: 'claude',
    })),
    newRows: incremental.newRows.length,
    usedTranscript: true,
  }
}

export async function logCommand(): Promise<void> {
  const claude = await readClaudeStats()
  if (!claude) {
    console.log('  No Claude stats found.')
    return
  }

  const store = await readStore()
  store.claude.stats = claude
  await writeStore(store)

  const today = new Date().toISOString().slice(0, 10)
  const daily = claude.dailyActivity.find(d => d.date === today)
  const tokens = claude.dailyModelTokens.find(d => d.date === today)
  const totalTokens = tokens
    ? Object.values(tokens.tokensByModel).reduce((a, b) => a + b, 0)
    : 0

  const realtime = await collectRealtimePayloadsFromHook()
  const fallbackPayloads = payloadsFromStatsCache(today, tokens?.tokensByModel ?? {})
  const payloads = realtime.payloads.length > 0 ? realtime.payloads : fallbackPayloads
  const upload = await uploadClaudePayloads(payloads)
  const uploadText = upload.skippedReason
    ? `upload: skipped (${upload.skippedReason})`
    : `upload: ${upload.uploaded}/${upload.total}`
  const sourceText = realtime.usedTranscript
    ? `source: realtime(${realtime.newRows} rows)`
    : 'source: daily-cache'

  console.log(
    `  [acommons] ${today} | ${fmtNum(daily?.messageCount ?? 0)} msgs | ${fmtNum(totalTokens)} tokens | ${sourceText} | ${uploadText}`,
  )
  if (upload.skippedReason === 'not_linked') {
    console.log('  [acommons] cloud upload skipped: run `acommons link` once on this device')
  } else if (upload.hasFailures) {
    console.log('  [acommons] partial upload failure: run `acommons sync` to retry')
  }
}

