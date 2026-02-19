import chalk from 'chalk'
import { readClaudeStats } from '../sources/claude.js'
import { readCodexSessions } from '../sources/codex.js'
import { printHeader, printTable, fmtNum } from '../format.js'
import { codexIOTokens } from '../token-metrics.js'

export async function dailyCommand(): Promise<void> {
  const [claude, codexSessions] = await Promise.all([
    readClaudeStats(),
    readCodexSessions(),
  ])

  printHeader('Agentic Commons - Daily Usage (14 days)')

  const dates: string[] = []
  const now = new Date()
  for (let i = 0; i < 14; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    dates.push(d.toISOString().slice(0, 10))
  }

  const claudeTokensByDate = new Map<string, number>()
  const claudeActivityByDate = new Map<string, { sessions: number; messages: number }>()
  for (const entry of claude?.dailyModelTokens ?? []) {
    const total = Object.values(entry.tokensByModel).reduce((a, b) => a + b, 0)
    claudeTokensByDate.set(entry.date, total)
  }
  for (const entry of claude?.dailyActivity ?? []) {
    claudeActivityByDate.set(entry.date, {
      sessions: entry.sessionCount,
      messages: entry.messageCount,
    })
  }

  const codexByDate = new Map<string, { sessions: number; tokens: number }>()
  for (const s of codexSessions) {
    const existing = codexByDate.get(s.date) ?? { sessions: 0, tokens: 0 }
    existing.sessions++
    existing.tokens += codexIOTokens(s.totalTokens)
    codexByDate.set(s.date, existing)
  }

  const rows: string[][] = []
  for (const date of dates) {
    const ct = claudeTokensByDate.get(date) ?? 0
    const ca = claudeActivityByDate.get(date)
    const cx = codexByDate.get(date)
    const total = ct + (cx?.tokens ?? 0)

    if (total === 0 && !ca) continue

    rows.push([
      chalk.dim(date.slice(5)),
      ct > 0 ? fmtNum(ct) : chalk.dim('--'),
      cx ? fmtNum(cx.tokens) : chalk.dim('--'),
      fmtNum(total),
      fmtNum((ca?.sessions ?? 0) + (cx?.sessions ?? 0)),
    ])
  }

  if (rows.length === 0) {
    console.log('  No data in the last 14 days.')
    return
  }

  printTable(
    [
      { header: 'Date', width: 6, align: 'left' },
      { header: 'Claude IO', width: 12, align: 'right' },
      { header: 'Codex IO', width: 12, align: 'right' },
      { header: 'Total IO', width: 12, align: 'right' },
      { header: 'Sessions', width: 8, align: 'right' },
    ],
    rows,
  )
  console.log(chalk.dim('  IO Tokens = Uncached Input + Output'))
  console.log()
}