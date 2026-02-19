import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { geminiTmpDir } from './paths.js'
import type { TokenBreakdown } from '../token-metrics.js'

type GeminiTokens = {
  input: number   // total prompt tokens (includes cached)
  output: number  // candidates tokens
  cached: number
  thoughts: number
  tool: number
  total: number
}

type GeminiMessage = {
  type: string
  model?: string
  tokens?: GeminiTokens
  timestamp?: string
}

type GeminiSession = {
  sessionId: string
  startTime: string
  lastUpdated: string
  messages: GeminiMessage[]
}

type GeminiDailyRow = {
  date: string
  sessions: number
  messages: number
  inputUncached: number
  output: number
  cachedRead: number
}

type GeminiModelRow = {
  model: string
  tokens: TokenBreakdown
}

type GeminiStats = {
  daily: GeminiDailyRow[]
  models: GeminiModelRow[]
  totalSessions: number
}

function isRealDir(p: string): boolean {
  try { return lstatSync(p).isDirectory() } catch { return false }
}

function findSessionFiles(): string[] {
  if (!isRealDir(geminiTmpDir)) return []
  const files: string[] = []
  try {
    for (const entry of readdirSync(geminiTmpDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue
      const chatsDir = join(geminiTmpDir, entry.name, 'chats')
      if (!isRealDir(chatsDir)) continue
      for (const file of readdirSync(chatsDir)) {
        if (file.startsWith('session-') && file.endsWith('.json')) {
          files.push(join(chatsDir, file))
        }
      }
    }
  } catch {
    // ignore read errors
  }
  return files
}

function parseSession(path: string): GeminiSession | null {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as GeminiSession
  } catch {
    return null
  }
}

function toBreakdown(t: GeminiTokens): TokenBreakdown {
  const inputUncached = Math.max(0, t.input - t.cached)
  return {
    inputUncached,
    output: t.output,
    cachedRead: t.cached,
    cachedWrite: 0,
    reasoning: t.thoughts,
    totalIO: inputUncached + t.output,
    totalGross: t.total,
  }
}

export function readGeminiStats(): GeminiStats | null {
  const files = findSessionFiles()
  if (files.length === 0) return null

  const dailyMap = new Map<string, GeminiDailyRow>()
  const modelMap = new Map<string, TokenBreakdown>()

  for (const file of files) {
    const session = parseSession(file)
    if (!session) continue

    const date = session.startTime.slice(0, 10)
    const row = dailyMap.get(date) ?? {
      date, sessions: 0, messages: 0,
      inputUncached: 0, output: 0, cachedRead: 0,
    }
    row.sessions++

    for (const msg of session.messages) {
      if (msg.type !== 'gemini' || !msg.tokens) continue
      row.messages++
      const uncached = Math.max(0, msg.tokens.input - msg.tokens.cached)
      row.inputUncached += uncached
      row.output += msg.tokens.output
      row.cachedRead += msg.tokens.cached

      const model = msg.model ?? 'gemini'
      const bd = toBreakdown(msg.tokens)
      const cur = modelMap.get(model)
      if (cur) {
        cur.inputUncached += bd.inputUncached
        cur.output += bd.output
        cur.cachedRead += bd.cachedRead
        cur.reasoning += bd.reasoning
        cur.totalIO += bd.totalIO
        cur.totalGross += bd.totalGross
      } else {
        modelMap.set(model, { ...bd })
      }
    }

    dailyMap.set(date, row)
  }

  const daily = [...dailyMap.values()].sort((a, b) => b.date.localeCompare(a.date))
  const models = [...modelMap.entries()].map(([model, tokens]) => ({ model, tokens }))

  return { daily, models, totalSessions: files.length }
}

export type { GeminiDailyRow, GeminiModelRow, GeminiStats }
