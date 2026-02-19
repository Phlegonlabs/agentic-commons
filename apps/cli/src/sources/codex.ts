import { open, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { codexSessionsDir } from './paths.js'
import type { CodexSessionData, CodexSessionMeta, CodexTokenEvent } from '../types.js'

const TAIL_CHUNK = 8 * 1024
const TAIL_FALLBACK = 64 * 1024
const HEAD_CHUNK = 16 * 1024

async function readTail(filePath: string, bytes: number): Promise<string> {
  const fh = await open(filePath, 'r')
  try {
    const { size } = await fh.stat()
    const start = Math.max(0, size - bytes)
    const buf = Buffer.alloc(Math.min(bytes, size))
    await fh.read(buf, 0, buf.length, start)
    return buf.toString('utf-8')
  } finally {
    await fh.close()
  }
}

async function readHead(filePath: string, bytes: number): Promise<string> {
  const fh = await open(filePath, 'r')
  try {
    const { size } = await fh.stat()
    const buf = Buffer.alloc(Math.min(bytes, size))
    await fh.read(buf, 0, buf.length, 0)
    return buf.toString('utf-8')
  } finally {
    await fh.close()
  }
}

function findLastTokenEvent(text: string): CodexTokenEvent | null {
  const lines = text.split('\n').filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const obj = JSON.parse(lines[i])
      if (obj.type === 'event_msg' && obj.payload?.type === 'token_count' && obj.payload.info) {
        return obj as CodexTokenEvent
      }
    } catch { /* skip malformed lines */ }
  }
  return null
}

function parseSessionMeta(text: string): CodexSessionMeta | null {
  const nl = text.indexOf('\n')
  const firstLine = nl > 0 ? text.slice(0, nl) : text
  try {
    const obj = JSON.parse(firstLine)
    if (obj.type === 'session_meta') {
      return obj.payload as CodexSessionMeta
    }
  } catch { /* skip */ }
  return null
}

function readTurnContextModel(line: string): string | null {
  try {
    const parsed = JSON.parse(line) as {
      type?: string
      payload?: {
        model?: unknown
        settings?: {
          model?: unknown
        }
      }
    }
    if (parsed.type !== 'turn_context') {
      return null
    }

    const directModel = parsed.payload?.model
    if (typeof directModel === 'string') {
      const normalizedDirect = directModel.trim()
      if (normalizedDirect.length > 0) {
        return normalizedDirect
      }
    }

    const model = parsed.payload?.settings?.model
    if (typeof model !== 'string') {
      return null
    }

    const normalized = model.trim()
    return normalized.length > 0 ? normalized : null
  } catch {
    return null
  }
}

function findLastTurnContextModel(text: string): string | null {
  const lines = text.split('\n').filter(Boolean)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const model = readTurnContextModel(lines[index])
    if (model) {
      return model
    }
  }
  return null
}

async function parseSessionFile(filePath: string): Promise<CodexSessionData | null> {
  let tail = await readTail(filePath, TAIL_CHUNK)
  let tokenEvent = findLastTokenEvent(tail)
  let model = findLastTurnContextModel(tail)

  if (!tokenEvent || !model) {
    tail = await readTail(filePath, TAIL_FALLBACK)
    if (!tokenEvent) {
      tokenEvent = findLastTokenEvent(tail)
    }
    if (!model) {
      model = findLastTurnContextModel(tail)
    }
  }
  if (!tokenEvent) return null

  const head = await readHead(filePath, HEAD_CHUNK)
  const meta = parseSessionMeta(head)

  return {
    sessionId: meta?.id ?? filePath,
    date: tokenEvent.timestamp.slice(0, 10),
    timestamp: tokenEvent.timestamp,
    model: model ?? 'gpt-5',
    totalTokens: tokenEvent.payload.info.total_token_usage,
    rateLimits: tokenEvent.payload.rate_limits,
  }
}

async function walkDir(dir: string): Promise<string[]> {
  const results: string[] = []
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        results.push(...await walkDir(full))
      } else if (entry.name.endsWith('.jsonl')) {
        results.push(full)
      }
    }
  } catch { /* dir doesn't exist */ }
  return results
}

export async function readCodexSessions(): Promise<CodexSessionData[]> {
  const files = await walkDir(codexSessionsDir)
  const results = await Promise.all(files.map(parseSessionFile))
  return results.filter((r): r is CodexSessionData => r !== null)
}

export async function readCodexRateLimits(): Promise<CodexTokenEvent['payload']['rate_limits'] | null> {
  const files = await walkDir(codexSessionsDir)
  if (files.length === 0) return null

  // Sort by name descending to get most recent file
  files.sort((a, b) => b.localeCompare(a))
  const latest = files[0]

  const tail = await readTail(latest, TAIL_CHUNK)
  const event = findLastTokenEvent(tail)
  return event?.payload.rate_limits ?? null
}
