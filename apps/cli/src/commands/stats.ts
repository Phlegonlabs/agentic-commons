import chalk from 'chalk'
import { readClaudeStats } from '../sources/claude.js'
import { readCodexSessions } from '../sources/codex.js'
import { readOpenCodeStats } from '../sources/opencode.js'
import { readGeminiStats } from '../sources/gemini.js'
import { printHeader, printTable, fmtNum } from '../format.js'
import { codexIOTokens } from '../token-metrics.js'

export async function statsCommand(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  const [claude, codexSessions] = await Promise.all([
    readClaudeStats(),
    readCodexSessions(),
  ])
  const opencode = readOpenCodeStats()
  const gemini = readGeminiStats()

  printHeader(`Agentic Commons - Today (${today})`)

  const claudeDaily = claude?.dailyActivity.find(d => d.date === today)
  const claudeTokens = claude?.dailyModelTokens.find(d => d.date === today)
  const claudeTotal = claudeTokens
    ? Object.values(claudeTokens.tokensByModel).reduce((a, b) => a + b, 0)
    : 0

  const todayCodex = codexSessions.filter(s => s.date === today)
  const codexTotal = todayCodex.reduce((sum, s) => sum + codexIOTokens(s.totalTokens), 0)

  const ocToday = opencode?.daily.find(d => d.date === today)
  const ocTotal = ocToday ? ocToday.inputUncached + ocToday.output : 0

  const rows: string[][] = []

  if (claude) {
    rows.push([
      chalk.cyan('Claude'),
      fmtNum(claudeDaily?.sessionCount ?? 0),
      fmtNum(claudeDaily?.messageCount ?? 0),
      fmtNum(claudeTotal),
      fmtNum(claudeDaily?.toolCallCount ?? 0),
    ])
  }

  if (todayCodex.length > 0) {
    rows.push([
      chalk.yellow('Codex'),
      fmtNum(todayCodex.length),
      '--',
      fmtNum(codexTotal),
      '--',
    ])
  }

  if (ocToday) {
    rows.push([
      chalk.magenta('OpenCode'),
      fmtNum(ocToday.sessions),
      fmtNum(ocToday.messages),
      fmtNum(ocTotal),
      '--',
    ])
  }

  const gmToday = gemini?.daily.find(d => d.date === today)
  const gmTotal = gmToday ? gmToday.inputUncached + gmToday.output : 0
  if (gmToday) {
    rows.push([
      chalk.green('Gemini'),
      fmtNum(gmToday.sessions),
      fmtNum(gmToday.messages),
      fmtNum(gmTotal),
      '--',
    ])
  }

  if (rows.length === 0) {
    console.log('  No data for today.')
    return
  }

  const grandTotal = claudeTotal + codexTotal + ocTotal + gmTotal
  rows.push([
    chalk.bold('Total'),
    fmtNum((claudeDaily?.sessionCount ?? 0) + todayCodex.length + (ocToday?.sessions ?? 0) + (gmToday?.sessions ?? 0)),
    '',
    chalk.bold(fmtNum(grandTotal)),
    '',
  ])

  printTable(
    [
      { header: 'Tool', width: 10, align: 'left' },
      { header: 'Sessions', width: 8, align: 'right' },
      { header: 'Messages', width: 8, align: 'right' },
      { header: 'IO Tokens', width: 12, align: 'right' },
      { header: 'Tool Calls', width: 10, align: 'right' },
    ],
    rows,
  )
  console.log(chalk.dim('  IO Tokens = Uncached Input + Output'))
  console.log()
}