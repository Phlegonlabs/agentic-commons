import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fromCodexUsage } from '../token-metrics.js'
import type { CodexSessionData } from '../types.js'
import { acCodexLedgerPath, acDir } from './paths.js'
import type { UsageDaily } from '@agentic-commons/shared'

type LedgerUsageTotals = {
  inputUncached: number
  output: number
  cachedRead: number
  cachedWrite: number
  totalIO: number
}

type CodexSessionCursor = {
  date: string
  model: string
  timestamp: string
  inputUncached: number
  output: number
  cachedRead: number
  cachedWrite: number
  totalIO: number
  updatedAt: string
}

type CodexRealtimeLedger = {
  version: 1
  dailyByModel: Record<string, Record<string, LedgerUsageTotals>>
  sessions: Record<string, CodexSessionCursor>
  pendingKeys: string[]
}

const EMPTY_TOTALS: LedgerUsageTotals = {
  inputUncached: 0,
  output: 0,
  cachedRead: 0,
  cachedWrite: 0,
  totalIO: 0,
}

const EMPTY_LEDGER: CodexRealtimeLedger = {
  version: 1,
  dailyByModel: {},
  sessions: {},
  pendingKeys: [],
}

function cloneEmptyTotals(): LedgerUsageTotals {
  return { ...EMPTY_TOTALS }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toNonNegativeInt(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0
  }
  if (value < 0) {
    return 0
  }
  return Math.trunc(value)
}

function normalizeTotals(value: unknown): LedgerUsageTotals {
  if (!isRecord(value)) {
    return cloneEmptyTotals()
  }

  const inputUncached = toNonNegativeInt(value.inputUncached)
  const output = toNonNegativeInt(value.output)
  const cachedRead = toNonNegativeInt(value.cachedRead)
  const cachedWrite = toNonNegativeInt(value.cachedWrite)

  return {
    inputUncached,
    output,
    cachedRead,
    cachedWrite,
    totalIO: inputUncached + output,
  }
}

function keyFor(date: string, model: string): string {
  return `${date}|${model}`
}

function addPendingKey(ledger: CodexRealtimeLedger, key: string): void {
  if (!ledger.pendingKeys.includes(key)) {
    ledger.pendingKeys.push(key)
  }
}

function normalizeSessionCursor(value: unknown): CodexSessionCursor | null {
  if (!isRecord(value)) {
    return null
  }

  if (typeof value.date !== 'string' || typeof value.model !== 'string' || typeof value.timestamp !== 'string') {
    return null
  }

  return {
    date: value.date,
    model: value.model,
    timestamp: value.timestamp,
    inputUncached: toNonNegativeInt(value.inputUncached),
    output: toNonNegativeInt(value.output),
    cachedRead: toNonNegativeInt(value.cachedRead),
    cachedWrite: toNonNegativeInt(value.cachedWrite),
    totalIO: toNonNegativeInt(value.totalIO),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
  }
}

async function readCodexLedger(): Promise<CodexRealtimeLedger> {
  try {
    const raw = await readFile(acCodexLedgerPath, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed)) {
      return { ...EMPTY_LEDGER }
    }

    const dailyByModel: Record<string, Record<string, LedgerUsageTotals>> = {}
    if (isRecord(parsed.dailyByModel)) {
      for (const [date, modelsRaw] of Object.entries(parsed.dailyByModel)) {
        if (!isRecord(modelsRaw)) {
          continue
        }

        dailyByModel[date] = {}
        for (const [model, totalsRaw] of Object.entries(modelsRaw)) {
          dailyByModel[date][model] = normalizeTotals(totalsRaw)
        }
      }
    }

    const sessions: Record<string, CodexSessionCursor> = {}
    if (isRecord(parsed.sessions)) {
      for (const [sessionId, cursorRaw] of Object.entries(parsed.sessions)) {
        const normalized = normalizeSessionCursor(cursorRaw)
        if (!normalized) {
          continue
        }
        sessions[sessionId] = normalized
      }
    }

    const pendingKeys = Array.isArray(parsed.pendingKeys)
      ? parsed.pendingKeys.filter((entry): entry is string => typeof entry === 'string')
      : []

    return {
      version: 1,
      dailyByModel,
      sessions,
      pendingKeys,
    }
  } catch {
    return { ...EMPTY_LEDGER }
  }
}

async function writeCodexLedger(ledger: CodexRealtimeLedger): Promise<void> {
  await mkdir(acDir, { recursive: true })
  await writeFile(acCodexLedgerPath, JSON.stringify(ledger, null, 2), 'utf-8')
}

function applyCodexSessionsToLedger(
  ledger: CodexRealtimeLedger,
  sessions: CodexSessionData[],
  modelOverride?: string,
): string[] {
  const touched = new Set<string>()
  const sorted = [...sessions].sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  for (const session of sorted) {
    const model = modelOverride ?? session.model ?? 'gpt-5'
    const current = fromCodexUsage(session.totalTokens)
    const previous = ledger.sessions[session.sessionId]

    const deltaInput = previous ? Math.max(0, current.inputUncached - previous.inputUncached) : current.inputUncached
    const deltaOutput = previous ? Math.max(0, current.output - previous.output) : current.output
    const deltaCachedRead = previous ? Math.max(0, current.cachedRead - previous.cachedRead) : current.cachedRead
    const deltaCachedWrite = previous ? Math.max(0, current.cachedWrite - previous.cachedWrite) : current.cachedWrite
    const deltaTotalIO = deltaInput + deltaOutput

    if (deltaTotalIO > 0 || deltaCachedRead > 0 || deltaCachedWrite > 0) {
      const byDate = ledger.dailyByModel[session.date] ?? {}
      ledger.dailyByModel[session.date] = byDate
      const totals = byDate[model] ?? cloneEmptyTotals()
      byDate[model] = totals

      totals.inputUncached += deltaInput
      totals.output += deltaOutput
      totals.cachedRead += deltaCachedRead
      totals.cachedWrite += deltaCachedWrite
      totals.totalIO = totals.inputUncached + totals.output

      const key = keyFor(session.date, model)
      touched.add(key)
      addPendingKey(ledger, key)
    }

    ledger.sessions[session.sessionId] = {
      date: session.date,
      model,
      timestamp: session.timestamp,
      inputUncached: current.inputUncached,
      output: current.output,
      cachedRead: current.cachedRead,
      cachedWrite: current.cachedWrite,
      totalIO: current.totalIO,
      updatedAt: new Date().toISOString(),
    }
  }

  return [...touched.values()]
}

function listDailyPayloadsFromCodexLedger(
  ledger: CodexRealtimeLedger,
  keys: string[],
): (UsageDaily & { source: 'codex' })[] {
  const payloads: (UsageDaily & { source: 'codex' })[] = []

  for (const key of keys) {
    const [date, model] = key.split('|')
    if (!date || !model) {
      continue
    }

    const totals = ledger.dailyByModel[date]?.[model]
    if (!totals) {
      continue
    }

    payloads.push({
      date,
      source: 'codex',
      model,
      input_uncached: totals.inputUncached,
      output: totals.output,
      cached_read: totals.cachedRead,
      cached_write: totals.cachedWrite,
      total_io: totals.totalIO,
    })
  }

  return payloads
}

function listAllCodexPayloadsFromLedger(
  ledger: CodexRealtimeLedger,
): (UsageDaily & { source: 'codex' })[] {
  const payloads: (UsageDaily & { source: 'codex' })[] = []

  for (const [date, byModel] of Object.entries(ledger.dailyByModel)) {
    for (const [model, totals] of Object.entries(byModel)) {
      payloads.push({
        date,
        source: 'codex',
        model,
        input_uncached: totals.inputUncached,
        output: totals.output,
        cached_read: totals.cachedRead,
        cached_write: totals.cachedWrite,
        total_io: totals.totalIO,
      })
    }
  }

  return payloads
}

function listPendingCodexPayloadsFromLedger(
  ledger: CodexRealtimeLedger,
): Array<{ key: string; payload: UsageDaily & { source: 'codex' } }> {
  const payloads = listDailyPayloadsFromCodexLedger(ledger, ledger.pendingKeys)
  return payloads.map(payload => ({
    key: keyFor(payload.date, payload.model),
    payload,
  }))
}

function markCodexKeysUploaded(ledger: CodexRealtimeLedger, keys: string[]): void {
  if (keys.length === 0) {
    return
  }

  const uploaded = new Set(keys)
  ledger.pendingKeys = ledger.pendingKeys.filter(key => !uploaded.has(key))
}

export {
  applyCodexSessionsToLedger,
  listAllCodexPayloadsFromLedger,
  listDailyPayloadsFromCodexLedger,
  listPendingCodexPayloadsFromLedger,
  markCodexKeysUploaded,
  readCodexLedger,
  writeCodexLedger,
}
export type {
  CodexRealtimeLedger,
}
