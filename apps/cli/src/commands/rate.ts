import chalk from 'chalk'
import { readCodexRateLimits } from '../sources/codex.js'
import { printHeader, progressBar } from '../format.js'

function formatTimeUntil(epochSec: number): string {
  const now = Date.now() / 1000
  const diff = epochSec - now
  if (diff <= 0) return 'now'
  const hours = Math.floor(diff / 3600)
  const mins = Math.floor((diff % 3600) / 60)
  if (hours > 24) {
    const date = new Date(epochSec * 1000)
    return date.toISOString().slice(0, 10)
  }
  return `${hours}h ${mins}m`
}

function windowLabel(minutes: number): string {
  if (minutes >= 10080) return '7-day'
  if (minutes >= 1440) return `${Math.round(minutes / 1440)}-day`
  if (minutes >= 60) return `${Math.round(minutes / 60)}-hour`
  return `${minutes}-min`
}

export async function rateCommand(): Promise<void> {
  const limits = await readCodexRateLimits()

  printHeader('Codex Rate Limits')

  if (!limits) {
    console.log('  No Codex rate limit data found.')
    return
  }

  const entries = [limits.primary, limits.secondary].filter(Boolean)

  if (entries.length === 0) {
    console.log('  No rate limit entries.')
    return
  }

  for (const entry of entries) {
    if (!entry) continue
    const pct = entry.used_percent
    const label = windowLabel(entry.window_minutes)
    const bar = progressBar(pct)
    const resets = formatTimeUntil(entry.resets_at)
    const pctStr = `${pct.toFixed(0)}%`

    console.log(`  ${chalk.bold(label.padEnd(8))} ${bar}  ${pctStr.padStart(4)}   resets in ${resets}`)
  }

  // Credits info
  const c = limits.credits
  if (c.has_credits) {
    console.log()
    console.log(`  Credits: ${c.unlimited ? 'unlimited' : `$${c.balance ?? 0}`}`)
  }

  console.log()
}
