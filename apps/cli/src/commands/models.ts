import chalk from 'chalk'
import { readClaudeStats } from '../sources/claude.js'
import { readCodexSessions } from '../sources/codex.js'
import { printHeader, printTable, fmtNum } from '../format.js'
import { addBreakdown, emptyBreakdown, fromClaudeUsage, fromCodexUsage } from '../token-metrics.js'
import type { TokenBreakdown } from '../token-metrics.js'

type ModelRow = {
  model: string
  source: 'claude' | 'codex'
  tokens: TokenBreakdown
}

export async function modelsCommand(): Promise<void> {
  const [claude, codexSessions] = await Promise.all([
    readClaudeStats(),
    readCodexSessions(),
  ])

  printHeader('Agentic Commons - Model Breakdown')

  const models: ModelRow[] = []

  if (claude) {
    for (const [model, usage] of Object.entries(claude.modelUsage)) {
      models.push({
        model,
        source: 'claude',
        tokens: fromClaudeUsage(usage),
      })
    }
  }

  if (codexSessions.length > 0) {
    const codexByModel = new Map<string, TokenBreakdown>()
    for (const session of codexSessions) {
      const model = session.model?.trim() || 'gpt-5'
      const current = codexByModel.get(model) ?? emptyBreakdown()
      codexByModel.set(model, addBreakdown(current, fromCodexUsage(session.totalTokens)))
    }

    for (const [model, totals] of codexByModel.entries()) {
      models.push({
        model,
        source: 'codex',
        tokens: totals,
      })
    }
  }

  if (models.length === 0) {
    console.log('  No model data found.')
    return
  }

  models.sort((a, b) => b.tokens.totalIO - a.tokens.totalIO)

  const rows = models.map(model => [
    model.source === 'claude' ? chalk.cyan(model.model) : chalk.yellow(model.model),
    fmtNum(model.tokens.inputUncached),
    fmtNum(model.tokens.output),
    fmtNum(model.tokens.cachedRead),
    model.tokens.cachedWrite > 0 ? fmtNum(model.tokens.cachedWrite) : chalk.dim('--'),
    fmtNum(model.tokens.totalIO),
  ])

  printTable(
    [
      { header: 'Model', width: 32, align: 'left' },
      { header: 'Input*', width: 12, align: 'right' },
      { header: 'Output', width: 12, align: 'right' },
      { header: 'Cached Read', width: 16, align: 'right' },
      { header: 'Cached Write', width: 16, align: 'right' },
      { header: 'Total IO', width: 12, align: 'right' },
    ],
    rows,
  )
  console.log(chalk.dim('  * Input = Uncached Input'))
  console.log(chalk.dim('  Total IO = Uncached Input + Output'))
  console.log()
}
