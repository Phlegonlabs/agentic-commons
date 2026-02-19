import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { acExternalUsageDir, openCodeDir } from './paths.js'
import type { UsageDaily } from '@agentic-commons/shared'

type ParsedUsage = {
  input_uncached: number
  output: number
  cached_read: number
  cached_write: number
  total_io: number
}

type SourceDefaults = {
  source: string
  provider: string
}

type ExternalUsageDiagnostics = {
  externalDirExists: boolean
  externalCandidateFiles: number
  openCodeDirExists: boolean
  openCodeJsonlFiles: number
  parsedPayloadRows: number
}

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
const SOURCE_REGEX = /^[a-z0-9][a-z0-9_-]{0,63}$/
const PROVIDER_REGEX = /^[a-z0-9][a-z0-9._-]{0,63}$/
const MAX_FILE_BYTES = 10 * 1024 * 1024
const UNKNOWN_PROVIDER = 'unknown'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toNonNegativeInt(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0
  }
  if (value <= 0) {
    return 0
  }
  return Math.trunc(value)
}

function readNestedNumber(value: unknown, key: string, nestedKey: string): number {
  if (!isRecord(value)) {
    return 0
  }
  const nested = value[key]
  if (!isRecord(nested)) {
    return 0
  }
  return toNonNegativeInt(nested[nestedKey])
}

function sanitizeSource(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback
  }
  const normalized = value.trim().toLowerCase()
  if (!SOURCE_REGEX.test(normalized)) {
    return fallback
  }
  return normalized
}

function sanitizeProvider(value: unknown, fallback = UNKNOWN_PROVIDER): string {
  if (typeof value !== 'string') {
    return fallback
  }
  const normalized = value.trim().toLowerCase()
  if (!PROVIDER_REGEX.test(normalized)) {
    return fallback
  }
  return normalized
}

function sanitizeModel(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.length > 128) {
    return null
  }
  return normalized
}

function inferProviderFromModel(model: string): string | null {
  const lower = model.toLowerCase()
  if (lower.startsWith('gpt-') || lower.startsWith('o1-') || lower.startsWith('o3-') || lower.startsWith('o4-')) return 'openai'
  if (lower.startsWith('claude-')) return 'anthropic'
  if (lower.startsWith('gemini-')) return 'google'
  return null
}

function toIsoDate(value: unknown): string | null {
  if (typeof value === 'string') {
    if (ISO_DATE_REGEX.test(value)) {
      return value
    }
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10)
    }
    return null
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const asMs = value > 10_000_000_000 ? value : value * 1000
    const parsed = new Date(asMs)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10)
    }
  }
  return null
}

function readEventDate(record: Record<string, unknown>): string | null {
  return toIsoDate(record.date)
    ?? toIsoDate(record.timestamp)
    ?? toIsoDate(record.created_at)
    ?? toIsoDate(record.created)
    ?? null
}

function normalizeUsage(record: Record<string, unknown>): ParsedUsage | null {
  const directInput = toNonNegativeInt(record.input_uncached)
  const directOutput = toNonNegativeInt(record.output)
  const directCachedRead = toNonNegativeInt(record.cached_read)
  const directCachedWrite = toNonNegativeInt(record.cached_write)

  if (directInput > 0 || directOutput > 0 || directCachedRead > 0 || directCachedWrite > 0) {
    return {
      input_uncached: directInput,
      output: directOutput,
      cached_read: directCachedRead,
      cached_write: directCachedWrite,
      total_io: directInput + directOutput,
    }
  }

  const usage = isRecord(record.usage)
    ? record.usage
    : isRecord(record.usageMetadata)
      ? record.usageMetadata
      : null

  if (!usage) {
    return null
  }

  const anthropicInput = toNonNegativeInt(usage.input_tokens)
  const anthropicOutput = toNonNegativeInt(usage.output_tokens)
  const anthropicCachedRead = toNonNegativeInt(usage.cache_read_input_tokens)
  const anthropicCachedWrite = toNonNegativeInt(usage.cache_creation_input_tokens)
  if (anthropicInput > 0 || anthropicOutput > 0 || anthropicCachedRead > 0 || anthropicCachedWrite > 0) {
    return {
      input_uncached: anthropicInput,
      output: anthropicOutput,
      cached_read: anthropicCachedRead,
      cached_write: anthropicCachedWrite,
      total_io: anthropicInput + anthropicOutput,
    }
  }

  const promptTokens = toNonNegativeInt(usage.prompt_tokens) || toNonNegativeInt(usage.promptTokenCount)
  const completionTokens = toNonNegativeInt(usage.completion_tokens)
    || toNonNegativeInt(usage.candidatesTokenCount)
  const cachedFromDetails = readNestedNumber(usage, 'prompt_tokens_details', 'cached_tokens')
  const cachedRead = cachedFromDetails
    || toNonNegativeInt(usage.cached_input_tokens)
    || toNonNegativeInt(usage.cachedContentTokenCount)

  if (promptTokens === 0 && completionTokens === 0 && cachedRead === 0) {
    return null
  }

  const inputUncached = Math.max(0, promptTokens - cachedRead)
  return {
    input_uncached: inputUncached,
    output: completionTokens,
    cached_read: cachedRead,
    cached_write: 0,
    total_io: inputUncached + completionTokens,
  }
}

function parseEventLine(line: string, defaults: SourceDefaults): UsageDaily | null {
  if (!line.trim()) {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return null
  }

  if (!isRecord(parsed)) {
    return null
  }

  const date = readEventDate(parsed)
  if (!date) {
    return null
  }

  const model = sanitizeModel(parsed.model)
  if (!model) {
    return null
  }

  const usage = normalizeUsage(parsed)
  if (!usage || usage.total_io <= 0) {
    return null
  }

  return {
    date,
    source: sanitizeSource(parsed.source, defaults.source),
    provider: sanitizeProvider(parsed.provider, inferProviderFromModel(model) ?? defaults.provider),
    model,
    input_uncached: usage.input_uncached,
    output: usage.output,
    cached_read: usage.cached_read,
    cached_write: usage.cached_write,
    total_io: usage.total_io,
  }
}

async function listFilesRecursively(dir: string, depth: number): Promise<string[]> {
  if (depth < 0) {
    return []
  }

  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await listFilesRecursively(fullPath, depth - 1))
      continue
    }
    if (entry.isFile()) {
      files.push(fullPath)
    }
  }

  return files
}

async function parseJsonlFile(filePath: string, defaults: SourceDefaults): Promise<UsageDaily[]> {
  const info = await stat(filePath).catch(() => null)
  if (!info || !info.isFile() || info.size <= 0 || info.size > MAX_FILE_BYTES) {
    return []
  }

  const text = await readFile(filePath, 'utf-8').catch(() => '')
  if (!text) {
    return []
  }

  const rows: UsageDaily[] = []
  for (const line of text.split('\n')) {
    const parsed = parseEventLine(line, defaults)
    if (parsed) {
      rows.push(parsed)
    }
  }
  return rows
}

function mergeUsageRows(rows: UsageDaily[]): UsageDaily[] {
  const merged = new Map<string, UsageDaily>()

  for (const row of rows) {
    const key = `${row.date}|${row.source}|${row.provider}|${row.model}`
    const current = merged.get(key)
    if (!current) {
      merged.set(key, { ...row })
      continue
    }

    current.input_uncached += row.input_uncached
    current.output += row.output
    current.cached_read += row.cached_read
    current.cached_write += row.cached_write
    current.total_io = current.input_uncached + current.output
    merged.set(key, current)
  }

  return [...merged.values()]
    .filter(row => row.total_io > 0)
    .sort((left, right) => left.date.localeCompare(right.date))
}

async function readManagedExternalUsageRows(): Promise<{ rows: UsageDaily[]; fileCount: number }> {
  const files = await listFilesRecursively(acExternalUsageDir, 2)
  const candidateFiles = files.filter(filePath => {
    const ext = extname(filePath).toLowerCase()
    return ext === '.jsonl' || ext === '.ndjson'
  })

  const rows: UsageDaily[] = []
  for (const filePath of candidateFiles) {
    const defaultSource = sanitizeSource(basename(filePath, extname(filePath)), 'external')
    const parsed = await parseJsonlFile(filePath, {
      source: defaultSource,
      provider: UNKNOWN_PROVIDER,
    })
    rows.push(...parsed)
  }

  return {
    rows,
    fileCount: candidateFiles.length,
  }
}

function isOpenCodeCandidateFile(filePath: string): boolean {
  const lower = basename(filePath).toLowerCase()
  if (!lower.endsWith('.jsonl') && !lower.endsWith('.ndjson')) {
    return false
  }
  return lower.includes('session')
    || lower.includes('history')
    || lower.includes('conversation')
    || lower.includes('chat')
    || lower.includes('log')
}

async function readOpenCodeUsageRows(): Promise<{ rows: UsageDaily[]; fileCount: number }> {
  const files = await listFilesRecursively(openCodeDir, 5)
  const candidates = files.filter(isOpenCodeCandidateFile)
  const rows: UsageDaily[] = []

  for (const filePath of candidates) {
    const parsed = await parseJsonlFile(filePath, {
      source: 'opencode',
      provider: UNKNOWN_PROVIDER,
    })
    rows.push(...parsed)
  }

  return {
    rows,
    fileCount: candidates.length,
  }
}

export async function readExternalUsagePayloads(): Promise<{ payloads: UsageDaily[]; diagnostics: ExternalUsageDiagnostics }> {
  const [managed, opencode] = await Promise.all([
    readManagedExternalUsageRows(),
    readOpenCodeUsageRows(),
  ])

  const payloads = mergeUsageRows([...managed.rows, ...opencode.rows])

  return {
    payloads,
    diagnostics: {
      externalDirExists: await stat(acExternalUsageDir).then(info => info.isDirectory()).catch(() => false),
      externalCandidateFiles: managed.fileCount,
      openCodeDirExists: await stat(openCodeDir).then(info => info.isDirectory()).catch(() => false),
      openCodeJsonlFiles: opencode.fileCount,
      parsedPayloadRows: payloads.length,
    },
  }
}

export async function readExternalUsageDiagnostics(): Promise<ExternalUsageDiagnostics> {
  const [managedRows, openCodeRows, externalExists, openCodeExists] = await Promise.all([
    readManagedExternalUsageRows(),
    readOpenCodeUsageRows(),
    stat(acExternalUsageDir).then(info => info.isDirectory()).catch(() => false),
    stat(openCodeDir).then(info => info.isDirectory()).catch(() => false),
  ])

  const payloads = mergeUsageRows([...managedRows.rows, ...openCodeRows.rows])
  return {
    externalDirExists: externalExists,
    externalCandidateFiles: managedRows.fileCount,
    openCodeDirExists: openCodeExists,
    openCodeJsonlFiles: openCodeRows.fileCount,
    parsedPayloadRows: payloads.length,
  }
}

export type {
  ExternalUsageDiagnostics,
}
