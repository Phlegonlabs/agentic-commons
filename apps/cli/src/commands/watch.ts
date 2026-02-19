import { existsSync, watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import chalk from 'chalk'
import { printHeader } from '../format.js'
import { readCodexSessions } from '../sources/codex.js'
import {
  applyCodexSessionsToLedger,
  listPendingCodexPayloadsFromLedger,
  markCodexKeysUploaded,
  readCodexLedger,
  writeCodexLedger,
} from '../sources/codex-ledger.js'
import { codexSessionsDir } from '../sources/paths.js'
import { readConfig, writeConfig } from '../sources/config.js'
import { readStoredApiToken, writeStoredApiToken } from '../sources/api-token.js'
import { readDeviceIdentityPayload } from '../sources/device-identity.js'
import { readApiBase } from './link-shared.js'
import type { UsageDaily } from '@agentic-commons/shared'

const WATCH_DEBOUNCE_MS = 10_000

type CodexPayload = UsageDaily & { source: 'codex'; provider: string }

type PendingUpload = {
  key: string
  payload: CodexPayload
}

type UploadResult = {
  uploadedKeys: string[]
  skippedReason: string | null
}

function isOneshot(): boolean {
  return process.argv.includes('--once')
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

async function uploadPending(entries: PendingUpload[]): Promise<UploadResult> {
  if (entries.length === 0) {
    return {
      uploadedKeys: [],
      skippedReason: 'no_pending_updates',
    }
  }

  const auth = await resolveCloudAuthNonInteractive()
  if (!auth.apiBase) {
    return { uploadedKeys: [], skippedReason: 'missing_api_base' }
  }

  if (!auth.token && !auth.devUserId) {
    return { uploadedKeys: [], skippedReason: 'not_linked' }
  }

  const uploaded = new Set<string>()
  const deviceIdentity = await readDeviceIdentityPayload().catch(() => null)
  for (const entry of entries) {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    }
    if (auth.token) {
      headers.authorization = `Bearer ${auth.token}`
    } else if (auth.devUserId) {
      headers['x-user-id'] = auth.devUserId
    }

    const response = await fetch(`${auth.apiBase}/v1/usage/daily`, {
      method: 'POST',
      headers,
      body: JSON.stringify(deviceIdentity ? { ...entry.payload, ...deviceIdentity } : entry.payload),
      signal: AbortSignal.timeout(5000),
    }).catch(() => null)

    if (response?.ok) {
      uploaded.add(entry.key)
    }
  }

  return {
    uploadedKeys: [...uploaded.values()],
    skippedReason: null,
  }
}

async function codexWatchCycle(verbose: boolean): Promise<void> {
  const [sessions, ledger] = await Promise.all([
    readCodexSessions(),
    readCodexLedger(),
  ])

  const touchedKeys = applyCodexSessionsToLedger(ledger, sessions)
  const pending = listPendingCodexPayloadsFromLedger(ledger)
  const upload = await uploadPending(pending)
  markCodexKeysUploaded(ledger, upload.uploadedKeys)
  await writeCodexLedger(ledger)

  if (!verbose && touchedKeys.length === 0 && upload.uploadedKeys.length === 0) {
    return
  }

  const skipped = upload.skippedReason ? ` | upload: skipped (${upload.skippedReason})` : ''
  console.log(
    `  [watch] codex sessions=${sessions.length} touched=${touchedKeys.length} pending=${ledger.pendingKeys.length} uploaded=${upload.uploadedKeys.length}${skipped}`,
  )

  if (upload.skippedReason === 'not_linked') {
    console.log(`  ${chalk.yellow('!')} Link this device with 'acommons link' to enable cloud upload.`)
  }
}

function startPollingFallback(onChange: () => void): NodeJS.Timeout {
  return setInterval(onChange, WATCH_DEBOUNCE_MS)
}

export async function watchCommand(): Promise<void> {
  printHeader('Codex Realtime Watch')

  if (!existsSync(codexSessionsDir)) {
    console.log(`  ${chalk.yellow('!')} Codex sessions directory not found: ${codexSessionsDir}`)
    return
  }

  await codexWatchCycle(true)

  if (isOneshot()) {
    console.log(`  ${chalk.dim('Oneshot mode complete.')}`)
    console.log()
    return
  }

  let timer: NodeJS.Timeout | null = null
  let watcher: FSWatcher | null = null
  let fallbackTimer: NodeJS.Timeout | null = null
  let running = false
  let rerun = false
  let stopped = false

  const scheduleCycle = (): void => {
    if (stopped) {
      return
    }
    if (timer) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      void runCycle()
    }, WATCH_DEBOUNCE_MS)
  }

  const runCycle = async (): Promise<void> => {
    if (running) {
      rerun = true
      return
    }

    running = true
    try {
      do {
        rerun = false
        await codexWatchCycle(false)
      } while (rerun)
    } finally {
      running = false
    }
  }

  try {
    watcher = watch(codexSessionsDir, { recursive: true }, () => {
      scheduleCycle()
    })
    console.log(`  ${chalk.green('+')} Watching ${codexSessionsDir}`)
  } catch {
    fallbackTimer = startPollingFallback(scheduleCycle)
    console.log(`  ${chalk.yellow('!')} Native recursive watch unavailable, using polling fallback`)
  }

  console.log(`  ${chalk.dim(`Batch window: ${WATCH_DEBOUNCE_MS / 1000}s`)}`)
  console.log(`  ${chalk.dim('Press Ctrl+C to stop.')}`)
  console.log()

  await new Promise<void>((resolve) => {
    const shutdown = (): void => {
      if (stopped) {
        return
      }
      stopped = true
      if (timer) {
        clearTimeout(timer)
      }
      if (fallbackTimer) {
        clearInterval(fallbackTimer)
      }
      watcher?.close()
      resolve()
    }

    process.once('SIGINT', shutdown)
    process.once('SIGTERM', shutdown)
  })
}
