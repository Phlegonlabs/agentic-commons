import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { acClaudeLedgerPath, acDir } from './paths.js'
import type { TranscriptUsageRow } from './claude-transcript.js'

type LedgerUsageTotals = {
  inputUncached: number
  output: number
  cachedRead: number
  cachedWrite: number
  totalIO: number
}

type LedgerCursor = {
  transcriptPath: string
  processedLines: number
  sessionId: string | null
  updatedAt: string
}

type ClaudeRealtimeLedger = {
  version: 1
  dailyByModel: Record<string, Record<string, LedgerUsageTotals>>
  cursors: Record<string, LedgerCursor>
}

const EMPTY_TOTALS: LedgerUsageTotals = {
  inputUncached: 0,
  output: 0,
  cachedRead: 0,
  cachedWrite: 0,
  totalIO: 0,
}

const EMPTY_LEDGER: ClaudeRealtimeLedger = {
  version: 1,
  dailyByModel: {},
  cursors: {},
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
  const totalIO = inputUncached + output

  return {
    inputUncached,
    output,
    cachedRead,
    cachedWrite,
    totalIO,
  }
}

async function readClaudeLedger(): Promise<ClaudeRealtimeLedger> {
  try {
    const raw = await readFile(acClaudeLedgerPath, 'utf-8')
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

    const cursors: Record<string, LedgerCursor> = {}
    if (isRecord(parsed.cursors)) {
      for (const [key, cursorRaw] of Object.entries(parsed.cursors)) {
        if (!isRecord(cursorRaw)) {
          continue
        }

        if (typeof cursorRaw.transcriptPath !== 'string') {
          continue
        }

        cursors[key] = {
          transcriptPath: cursorRaw.transcriptPath,
          processedLines: toNonNegativeInt(cursorRaw.processedLines),
          sessionId: typeof cursorRaw.sessionId === 'string' ? cursorRaw.sessionId : null,
          updatedAt: typeof cursorRaw.updatedAt === 'string' ? cursorRaw.updatedAt : '',
        }
      }
    }

    return {
      version: 1,
      dailyByModel,
      cursors,
    }
  } catch {
    return { ...EMPTY_LEDGER }
  }
}

async function writeClaudeLedger(ledger: ClaudeRealtimeLedger): Promise<void> {
  await mkdir(acDir, { recursive: true })
  await writeFile(acClaudeLedgerPath, JSON.stringify(ledger, null, 2), 'utf-8')
}

function cursorKey(sessionId: string | null, transcriptPath: string): string {
  if (sessionId) {
    return `session:${sessionId}`
  }
  return `path:${transcriptPath}`
}

function getCursor(ledger: ClaudeRealtimeLedger, sessionId: string | null, transcriptPath: string): LedgerCursor | null {
  if (sessionId) {
    const bySession = ledger.cursors[`session:${sessionId}`]
    if (bySession) {
      return bySession
    }
  }

  const byPath = ledger.cursors[`path:${transcriptPath}`]
  return byPath ?? null
}

function setCursor(
  ledger: ClaudeRealtimeLedger,
  sessionId: string | null,
  transcriptPath: string,
  processedLines: number,
): void {
  const value: LedgerCursor = {
    transcriptPath,
    processedLines,
    sessionId,
    updatedAt: new Date().toISOString(),
  }

  ledger.cursors[cursorKey(sessionId, transcriptPath)] = value
  ledger.cursors[`path:${transcriptPath}`] = value
}

function addRowsToLedger(
  ledger: ClaudeRealtimeLedger,
  rows: TranscriptUsageRow[],
): string[] {
  const touched = new Set<string>()

  for (const row of rows) {
    const byDate = ledger.dailyByModel[row.date] ?? {}
    ledger.dailyByModel[row.date] = byDate
    const totals = byDate[row.model] ?? cloneEmptyTotals()
    byDate[row.model] = totals

    totals.inputUncached += row.usage.inputUncached
    totals.output += row.usage.output
    totals.cachedRead += row.usage.cachedRead
    totals.cachedWrite += row.usage.cachedWrite
    totals.totalIO = totals.inputUncached + totals.output
    touched.add(`${row.date}|${row.model}`)
  }

  return [...touched.values()]
}

function listDailyPayloadsFromLedger(
  ledger: ClaudeRealtimeLedger,
  keys: string[],
): Array<{
  date: string
  model: string
  input_uncached: number
  output: number
  cached_read: number
  cached_write: number
  total_io: number
}> {
  const payloads: Array<{
    date: string
    model: string
    input_uncached: number
    output: number
    cached_read: number
    cached_write: number
    total_io: number
  }> = []

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

function listAllClaudePayloadsFromLedger(
  ledger: ClaudeRealtimeLedger,
): Array<{
  date: string
  source: 'claude'
  model: string
  input_uncached: number
  output: number
  cached_read: number
  cached_write: number
  total_io: number
}> {
  const payloads: Array<{
    date: string
    source: 'claude'
    model: string
    input_uncached: number
    output: number
    cached_read: number
    cached_write: number
    total_io: number
  }> = []

  for (const [date, byModel] of Object.entries(ledger.dailyByModel)) {
    for (const [model, totals] of Object.entries(byModel)) {
      payloads.push({
        date,
        source: 'claude',
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

export {
  addRowsToLedger,
  getCursor,
  listAllClaudePayloadsFromLedger,
  listDailyPayloadsFromLedger,
  readClaudeLedger,
  setCursor,
  writeClaudeLedger,
}
