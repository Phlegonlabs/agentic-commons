import type { ClaudeModelUsage, CodexTokenUsage } from './types.js'

type TokenBreakdown = {
  inputUncached: number
  cachedRead: number
  cachedWrite: number
  output: number
  reasoning: number
  totalIO: number
  totalGross: number
}

function clampNonNegative(value: number): number {
  return value < 0 ? 0 : value
}

function toFiniteNumber(value: number): number {
  return Number.isFinite(value) ? value : 0
}

export function fromClaudeUsage(usage: ClaudeModelUsage): TokenBreakdown {
  const inputUncached = toFiniteNumber(usage.inputTokens)
  const output = toFiniteNumber(usage.outputTokens)
  const cachedRead = toFiniteNumber(usage.cacheReadInputTokens)
  const cachedWrite = toFiniteNumber(usage.cacheCreationInputTokens)
  const totalIO = inputUncached + output

  return {
    inputUncached,
    cachedRead,
    cachedWrite,
    output,
    reasoning: 0,
    totalIO,
    totalGross: totalIO + cachedRead + cachedWrite,
  }
}

export function fromCodexUsage(usage: CodexTokenUsage): TokenBreakdown {
  const inputTotal = toFiniteNumber(usage.input_tokens)
  const cachedRead = toFiniteNumber(usage.cached_input_tokens)
  const inputUncached = clampNonNegative(inputTotal - cachedRead)
  const output = toFiniteNumber(usage.output_tokens)
  const reasoning = toFiniteNumber(usage.reasoning_output_tokens)
  const totalIO = inputUncached + output

  return {
    inputUncached,
    cachedRead,
    cachedWrite: 0,
    output,
    reasoning,
    totalIO,
    totalGross: toFiniteNumber(usage.total_tokens),
  }
}

export function emptyBreakdown(): TokenBreakdown {
  return {
    inputUncached: 0,
    cachedRead: 0,
    cachedWrite: 0,
    output: 0,
    reasoning: 0,
    totalIO: 0,
    totalGross: 0,
  }
}

export function addBreakdown(a: TokenBreakdown, b: TokenBreakdown): TokenBreakdown {
  return {
    inputUncached: a.inputUncached + b.inputUncached,
    cachedRead: a.cachedRead + b.cachedRead,
    cachedWrite: a.cachedWrite + b.cachedWrite,
    output: a.output + b.output,
    reasoning: a.reasoning + b.reasoning,
    totalIO: a.totalIO + b.totalIO,
    totalGross: a.totalGross + b.totalGross,
  }
}

export function codexIOTokens(usage: CodexTokenUsage): number {
  return fromCodexUsage(usage).totalIO
}

export type { TokenBreakdown }
