import { readFile } from 'node:fs/promises'
import type { TokenBreakdown } from '../token-metrics.js'

type HookInput = {
  transcript_path?: unknown
  session_id?: unknown
  hook_event_name?: unknown
}

type TranscriptUsageRow = {
  eventId: string
  sessionId: string | null
  date: string
  model: string
  usage: TokenBreakdown
}

type IncrementalTranscriptUsage = {
  sessionId: string | null
  totalLines: number
  newRows: TranscriptUsageRow[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toFiniteInt(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0
  }
  if (value < 0) {
    return 0
  }
  return Math.trunc(value)
}

function isoDateFromTimestamp(timestamp: unknown): string {
  if (typeof timestamp === 'string' && /^\d{4}-\d{2}-\d{2}/.test(timestamp)) {
    return timestamp.slice(0, 10)
  }

  return new Date().toISOString().slice(0, 10)
}

function usageFromUnknown(value: unknown): TokenBreakdown | null {
  if (!isRecord(value)) {
    return null
  }

  const inputUncached = toFiniteInt(value['input_tokens'] ?? value['inputTokens'])
  const output = toFiniteInt(value['output_tokens'] ?? value['outputTokens'])
  const cachedRead = toFiniteInt(value['cache_read_input_tokens'] ?? value['cacheReadInputTokens'])
  const cachedWrite = toFiniteInt(value['cache_creation_input_tokens'] ?? value['cacheCreationInputTokens'])
  const totalIO = inputUncached + output
  const totalGross = totalIO + cachedRead + cachedWrite

  if (totalGross <= 0) {
    return null
  }

  return {
    inputUncached,
    cachedRead,
    cachedWrite,
    output,
    reasoning: 0,
    totalIO,
    totalGross,
  }
}

function eventIdFromEntry(entry: Record<string, unknown>, lineNumber: number): string {
  const message = isRecord(entry.message) ? entry.message : null
  const messageId = typeof message?.id === 'string' ? message.id : null
  if (messageId) {
    return `msg:${messageId}`
  }

  const requestId = typeof entry.requestId === 'string' ? entry.requestId : null
  if (requestId) {
    return `req:${requestId}`
  }

  const uuid = typeof entry.uuid === 'string' ? entry.uuid : null
  if (uuid) {
    return `uuid:${uuid}`
  }

  return `line:${lineNumber}`
}

function extractUsageRow(entry: Record<string, unknown>, lineNumber: number): TranscriptUsageRow | null {
  if (entry.type !== 'assistant') {
    return null
  }

  const message = isRecord(entry.message) ? entry.message : null
  if (!message || message.role !== 'assistant') {
    return null
  }

  const usage = usageFromUnknown(message.usage)
  if (!usage) {
    return null
  }

  const model = typeof message.model === 'string' && message.model.trim()
    ? message.model.trim()
    : null
  if (!model) {
    return null
  }

  const sessionId = typeof entry.sessionId === 'string' ? entry.sessionId : null
  return {
    eventId: eventIdFromEntry(entry, lineNumber),
    sessionId,
    date: isoDateFromTimestamp(entry.timestamp),
    model,
    usage,
  }
}

async function readHookInput(): Promise<HookInput | null> {
  if (process.stdin.isTTY) {
    return null
  }

  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk))
    } else {
      chunks.push(chunk)
    }
  }

  const raw = Buffer.concat(chunks).toString('utf-8').trim()
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function transcriptPathFromHook(hookInput: HookInput | null): string | null {
  if (!hookInput) {
    return null
  }

  if (typeof hookInput.transcript_path === 'string' && hookInput.transcript_path.trim()) {
    return hookInput.transcript_path
  }

  return null
}

function sessionIdFromHook(hookInput: HookInput | null): string | null {
  if (!hookInput) {
    return null
  }

  if (typeof hookInput.session_id === 'string' && hookInput.session_id.trim()) {
    return hookInput.session_id
  }

  return null
}

async function readIncrementalTranscriptUsage(
  transcriptPath: string,
  processedLines: number,
): Promise<IncrementalTranscriptUsage | null> {
  let raw: string
  try {
    raw = await readFile(transcriptPath, 'utf-8')
  } catch {
    return null
  }

  const lines = raw.split(/\r?\n/)
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }

  const totalLines = lines.length
  const start = Math.max(0, Math.min(processedLines, totalLines))
  const dedupedByEvent = new Map<string, TranscriptUsageRow>()
  let sessionId: string | null = null

  for (let index = start; index < totalLines; index++) {
    const line = lines[index]?.trim()
    if (!line) {
      continue
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }

    if (!isRecord(parsed)) {
      continue
    }

    const row = extractUsageRow(parsed, index + 1)
    if (!row) {
      continue
    }

    if (!sessionId && row.sessionId) {
      sessionId = row.sessionId
    }
    dedupedByEvent.set(row.eventId, row)
  }

  return {
    sessionId,
    totalLines,
    newRows: [...dedupedByEvent.values()],
  }
}

export {
  readHookInput,
  readIncrementalTranscriptUsage,
  sessionIdFromHook,
  transcriptPathFromHook,
}
export type {
  HookInput,
  TranscriptUsageRow,
}
