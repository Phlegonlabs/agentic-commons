#!/usr/bin/env node
/**
 * Multi-CLI usage writer template.
 *
 * Goal:
 * - Normalize provider usage fields
 * - Append daily events to ~/.agentic-commons/external-usage/<source>.jsonl
 *
 * Usage (example):
 *   node multi-cli-usage-writer-template.mjs
 */

import { mkdir, appendFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const EXTERNAL_USAGE_DIR = join(homedir(), '.agentic-commons', 'external-usage')

function toNonNegativeInt(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0
  }
  return Math.trunc(value)
}

function sanitizeSource(value) {
  const fallback = 'external'
  if (typeof value !== 'string') {
    return fallback
  }
  const normalized = value.trim().toLowerCase()
  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(normalized) ? normalized : fallback
}

function sanitizeProvider(value) {
  const fallback = 'unknown'
  if (typeof value !== 'string') {
    return fallback
  }
  const normalized = value.trim().toLowerCase()
  return /^[a-z0-9][a-z0-9._-]{0,63}$/.test(normalized) ? normalized : fallback
}

function sanitizeModel(value) {
  if (typeof value !== 'string') {
    return null
  }
  const model = value.trim()
  if (!model || model.length > 128) {
    return null
  }
  return model
}

function normalizeOpenAIUsage(usage) {
  const promptTokens = toNonNegativeInt(usage?.prompt_tokens)
  const completionTokens = toNonNegativeInt(usage?.completion_tokens)
  const cachedTokens = toNonNegativeInt(usage?.prompt_tokens_details?.cached_tokens)
  const inputUncached = Math.max(0, promptTokens - cachedTokens)
  return {
    input_uncached: inputUncached,
    output: completionTokens,
    cached_read: cachedTokens,
    cached_write: 0,
    total_io: inputUncached + completionTokens,
  }
}

function normalizeAnthropicUsage(usage) {
  const input = toNonNegativeInt(usage?.input_tokens)
  const output = toNonNegativeInt(usage?.output_tokens)
  const cachedRead = toNonNegativeInt(usage?.cache_read_input_tokens)
  const cachedWrite = toNonNegativeInt(usage?.cache_creation_input_tokens)
  return {
    input_uncached: input,
    output,
    cached_read: cachedRead,
    cached_write: cachedWrite,
    total_io: input + output,
  }
}

function buildUsageEvent({ source, provider, model, usage, timestamp }) {
  const safeSource = sanitizeSource(source)
  const safeProvider = sanitizeProvider(provider)
  const safeModel = sanitizeModel(model)
  if (!safeModel) {
    throw new Error('invalid_model')
  }

  const normalized = safeProvider === 'anthropic'
    ? normalizeAnthropicUsage(usage)
    : normalizeOpenAIUsage(usage)

  if (normalized.total_io <= 0) {
    return null
  }

  return {
    timestamp: timestamp ?? new Date().toISOString(),
    source: safeSource,
    provider: safeProvider,
    model: safeModel,
    usage: {
      input_uncached: normalized.input_uncached,
      output: normalized.output,
      cached_read: normalized.cached_read,
      cached_write: normalized.cached_write,
    },
  }
}

async function appendUsageEvent(event) {
  const file = join(EXTERNAL_USAGE_DIR, `${event.source}.jsonl`)
  await mkdir(EXTERNAL_USAGE_DIR, { recursive: true })
  await appendFile(file, `${JSON.stringify(event)}\n`, 'utf8')
  return file
}

// --- Example integration ---
// Replace this with your tool SDK response handlers.
async function main() {
  const openAICompatibleEvent = buildUsageEvent({
    source: 'opencode',
    provider: 'kimi',
    model: 'moonshot-v1-8k',
    usage: {
      prompt_tokens: 1200,
      completion_tokens: 320,
    },
  })

  const anthropicEvent = buildUsageEvent({
    source: 'myclaudewrapper',
    provider: 'anthropic',
    model: 'claude-opus-4-6',
    usage: {
      input_tokens: 900,
      output_tokens: 210,
      cache_read_input_tokens: 120,
      cache_creation_input_tokens: 10,
    },
  })

  const pending = [openAICompatibleEvent, anthropicEvent].filter(Boolean)
  for (const event of pending) {
    const file = await appendUsageEvent(event)
    console.log(`wrote usage event -> ${file}`)
  }

  console.log('next step: run `acommons sync`')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
