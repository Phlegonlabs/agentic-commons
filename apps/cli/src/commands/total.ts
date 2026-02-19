import chalk from 'chalk'
import { readClaudeStats } from '../sources/claude.js'
import { readCodexSessions } from '../sources/codex.js'
import { fmtNum, printHeader, printTable } from '../format.js'
import { codexIOTokens } from '../token-metrics.js'

function summarizeRange(dates: string[]): string {
  if (dates.length === 0) {
    return '--'
  }

  const sorted = [...dates].sort((a, b) => a.localeCompare(b))
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  if (first === last) {
    return first
  }

  return `${first}..${last}`
}

export async function totalCommand(): Promise<void> {
  const [claude, codexSessions] = await Promise.all([
    readClaudeStats(),
    readCodexSessions(),
  ])

  printHeader('Agentic Commons - All-time Total')

  const claudeDates = (claude?.dailyModelTokens ?? []).map(entry => entry.date)
  const claudeTotal = (claude?.dailyModelTokens ?? []).reduce((sum, entry) => {
    const daily = Object.values(entry.tokensByModel).reduce((a, b) => a + b, 0)
    return sum + daily
  }, 0)
  const claudeSessions = claude?.totalSessions ?? 0

  const codexDates = codexSessions.map(session => session.date)
  const codexTotal = codexSessions.reduce((sum, session) => sum + codexIOTokens(session.totalTokens), 0)
  const codexSessionCount = codexSessions.length

  if (claudeTotal === 0 && codexTotal === 0) {
    console.log('  No historical data found yet.')
    console.log('  Run `acommons setup` then `acommons sync` to initialize data.')
    console.log()
    return
  }

  const grandTotal = claudeTotal + codexTotal
  const allDates = [...claudeDates, ...codexDates]

  const rows: string[][] = []
  if (claudeTotal > 0) {
    rows.push([
      chalk.cyan('Claude'),
      summarizeRange(claudeDates),
      fmtNum(claudeSessions),
      fmtNum(claudeTotal),
    ])
  }

  if (codexTotal > 0) {
    rows.push([
      chalk.yellow('Codex'),
      summarizeRange(codexDates),
      fmtNum(codexSessionCount),
      fmtNum(codexTotal),
    ])
  }

  rows.push([
    chalk.bold('Total'),
    summarizeRange(allDates),
    chalk.bold(fmtNum(claudeSessions + codexSessionCount)),
    chalk.bold(fmtNum(grandTotal)),
  ])

  printTable(
    [
      { header: 'Tool', width: 10, align: 'left' },
      { header: 'Date Range', width: 23, align: 'left' },
      { header: 'Sessions', width: 10, align: 'right' },
      { header: 'IO Tokens', width: 14, align: 'right' },
    ],
    rows,
  )
  console.log(chalk.dim('  All-time total is based on currently available local source history.'))
  console.log()
}
