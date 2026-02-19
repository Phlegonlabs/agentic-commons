import { readFile } from 'node:fs/promises'
import { claudeStatsPath } from './paths.js'
import type { ClaudeStatsCache } from '../types.js'

export async function readClaudeStats(): Promise<ClaudeStatsCache | null> {
  try {
    const raw = await readFile(claudeStatsPath, 'utf-8')
    return JSON.parse(raw) as ClaudeStatsCache
  } catch {
    return null
  }
}
