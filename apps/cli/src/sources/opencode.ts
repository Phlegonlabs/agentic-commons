import { existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { openCodeDbPath } from './paths.js'
import type { TokenBreakdown } from '../token-metrics.js'
import type { UsageDaily } from '@agentic-commons/shared'

type OpenCodeDailyRow = {
  date: string
  sessions: number
  messages: number
  inputUncached: number
  output: number
  cachedRead: number
  cachedWrite: number
  reasoning: number
}

type OpenCodeModelRow = {
  model: string
  provider: string
  tokens: TokenBreakdown
}

type OpenCodeStats = {
  daily: OpenCodeDailyRow[]
  models: OpenCodeModelRow[]
  totalSessions: number
}

function openDb(): DatabaseSync | null {
  if (!existsSync(openCodeDbPath)) return null
  try {
    return new DatabaseSync(openCodeDbPath, { readOnly: true })
  } catch {
    return null
  }
}

const DAILY_SQL = `
  SELECT
    date(time_created / 1000, 'unixepoch', 'localtime') as date,
    COUNT(DISTINCT session_id) as sessions,
    COUNT(*) as messages,
    COALESCE(SUM(json_extract(data, '$.tokens.input')), 0) as inputUncached,
    COALESCE(SUM(json_extract(data, '$.tokens.output')), 0) as output,
    COALESCE(SUM(json_extract(data, '$.tokens.cache.read')), 0) as cachedRead,
    COALESCE(SUM(json_extract(data, '$.tokens.cache.write')), 0) as cachedWrite,
    COALESCE(SUM(json_extract(data, '$.tokens.reasoning')), 0) as reasoning
  FROM message
  WHERE json_extract(data, '$.role') = 'assistant'
    AND json_extract(data, '$.tokens') IS NOT NULL
  GROUP BY date
  ORDER BY date DESC
`

const MODELS_SQL = `
  SELECT
    json_extract(data, '$.providerID') as provider,
    json_extract(data, '$.modelID') as model,
    COALESCE(SUM(json_extract(data, '$.tokens.input')), 0) as inputUncached,
    COALESCE(SUM(json_extract(data, '$.tokens.output')), 0) as output,
    COALESCE(SUM(json_extract(data, '$.tokens.cache.read')), 0) as cachedRead,
    COALESCE(SUM(json_extract(data, '$.tokens.cache.write')), 0) as cachedWrite,
    COALESCE(SUM(json_extract(data, '$.tokens.reasoning')), 0) as reasoning
  FROM message
  WHERE json_extract(data, '$.role') = 'assistant'
    AND json_extract(data, '$.tokens') IS NOT NULL
  GROUP BY provider, model
`

const SESSIONS_SQL = `SELECT COUNT(*) as cnt FROM session`

export function readOpenCodeStats(): OpenCodeStats | null {
  const db = openDb()
  if (!db) return null

  try {
    const dailyRows = db.prepare(DAILY_SQL).all() as OpenCodeDailyRow[]
    const modelRows = db.prepare(MODELS_SQL).all() as {
      provider: string; model: string
      inputUncached: number; output: number
      cachedRead: number; cachedWrite: number; reasoning: number
    }[]
    const { cnt } = db.prepare(SESSIONS_SQL).get() as { cnt: number }

    const models: OpenCodeModelRow[] = modelRows.map(r => ({
      model: r.model ?? 'unknown',
      provider: r.provider ?? 'unknown',
      tokens: {
        inputUncached: r.inputUncached,
        output: r.output,
        cachedRead: r.cachedRead,
        cachedWrite: r.cachedWrite,
        reasoning: r.reasoning,
        totalIO: r.inputUncached + r.output,
        totalGross: r.inputUncached + r.output + r.cachedRead + r.cachedWrite,
      },
    }))

    return { daily: dailyRows, models, totalSessions: cnt }
  } catch {
    return null
  } finally {
    db.close()
  }
}

const DAILY_MODEL_SQL = `
  SELECT
    date(time_created / 1000, 'unixepoch', 'localtime') as date,
    json_extract(data, '$.providerID') as provider,
    json_extract(data, '$.modelID') as model,
    COALESCE(SUM(json_extract(data, '$.tokens.input')), 0) as inputUncached,
    COALESCE(SUM(json_extract(data, '$.tokens.output')), 0) as output,
    COALESCE(SUM(json_extract(data, '$.tokens.cache.read')), 0) as cachedRead,
    COALESCE(SUM(json_extract(data, '$.tokens.cache.write')), 0) as cachedWrite
  FROM message
  WHERE json_extract(data, '$.role') = 'assistant'
    AND json_extract(data, '$.tokens') IS NOT NULL
  GROUP BY date, provider, model
`

type DailyModelRow = {
  date: string
  provider: string | null
  model: string | null
  inputUncached: number
  output: number
  cachedRead: number
  cachedWrite: number
}

export function readOpenCodeDailyPayloads(): UsageDaily[] {
  const db = openDb()
  if (!db) return []

  try {
    const rows = db.prepare(DAILY_MODEL_SQL).all() as DailyModelRow[]
    return rows.map(r => ({
      date: r.date,
      source: 'opencode' as const,
      provider: r.provider ?? 'unknown',
      model: r.model ?? 'unknown',
      input_uncached: r.inputUncached,
      output: r.output,
      cached_read: r.cachedRead,
      cached_write: r.cachedWrite,
      total_io: r.inputUncached + r.output,
    }))
  } catch {
    return []
  } finally {
    db.close()
  }
}

export type { OpenCodeDailyRow, OpenCodeModelRow, OpenCodeStats }
