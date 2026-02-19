import { readClaudeStats } from '../sources/claude.js'
import { readCodexSessions } from '../sources/codex.js'
import { readStore, writeStore } from '../sources/store.js'
import { printHeader } from '../format.js'
import { fromCodexUsage, emptyBreakdown, addBreakdown } from '../token-metrics.js'
import { readConfig } from '../sources/config.js'
import { linkDevice, readApiBase } from './link-shared.js'
import { maybeAutoUpdate } from './auto-update.js'

type CloudUsagePayload = {
  date: string
  source: 'claude' | 'codex'
  model: string
  input_uncached: number
  output: number
  cached_read: number
  cached_write: number
  total_io: number
}

function buildCloudPayloads(
  claude: Awaited<ReturnType<typeof readClaudeStats>>,
  codexSessions: Awaited<ReturnType<typeof readCodexSessions>>,
): CloudUsagePayload[] {
  const payloads: CloudUsagePayload[] = []

  for (const daily of claude?.dailyModelTokens ?? []) {
    for (const [model, total] of Object.entries(daily.tokensByModel)) {
      payloads.push({
        date: daily.date,
        source: 'claude',
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

  const codexByDay = new Map<string, ReturnType<typeof emptyBreakdown>>()
  for (const session of codexSessions) {
    const current = codexByDay.get(session.date) ?? emptyBreakdown()
    codexByDay.set(session.date, addBreakdown(current, fromCodexUsage(session.totalTokens)))
  }

  for (const [date, total] of codexByDay.entries()) {
    payloads.push({
      date,
      source: 'codex',
      model: 'gpt-5',
      input_uncached: total.inputUncached,
      output: total.output,
      cached_read: total.cachedRead,
      cached_write: 0,
      total_io: total.totalIO,
    })
  }

  return payloads
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

  if (config.apiToken) {
    return {
      apiBase,
      token: config.apiToken,
      devUserId: null,
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

async function uploadCloudPayloads(payloads: CloudUsagePayload[]): Promise<number> {
  const auth = await resolveCloudAuth()
  if (!auth.apiBase) {
    return 0
  }

  if (!auth.token && !auth.devUserId) {
    return 0
  }

  let uploaded = 0

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
      body: JSON.stringify(payload),
    })

    if (response.ok) {
      uploaded++
    }
  }

  return uploaded
}

export async function syncCommand(): Promise<void> {
  printHeader('Syncing data...')
  await maybeAutoUpdate()

  const [claude, codexSessions] = await Promise.all([
    readClaudeStats(),
    readCodexSessions(),
  ])

  const store = await readStore()
  store.claude.stats = claude
  store.codex.sessions = codexSessions
  await writeStore(store)

  const cloudPayloads = buildCloudPayloads(claude, codexSessions)
  const uploadedCount = await uploadCloudPayloads(cloudPayloads)

  const claudeDays = claude?.dailyActivity.length ?? 0
  console.log(`  Claude: ${claudeDays} days of activity`)
  console.log(`  Codex: ${codexSessions.length} sessions`)
  console.log(`  Saved to ~/.agentic-commons/usage.json`)
  if (uploadedCount > 0) {
    console.log(`  Cloud sync: uploaded ${uploadedCount}/${cloudPayloads.length} daily aggregates`)
  } else {
    console.log('  Cloud sync: skipped (link your CLI with `acommons link` to upload)')
  }
  console.log()
}
