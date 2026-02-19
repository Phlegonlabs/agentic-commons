#!/usr/bin/env node

import { statsCommand } from './commands/stats.js'
import { dailyCommand } from './commands/daily.js'
import { modelsCommand } from './commands/models.js'
import { rateCommand } from './commands/rate.js'
import { reportCommand } from './commands/report.js'
import { syncCommand } from './commands/sync.js'
import { logCommand } from './commands/log.js'
import { setupCommand } from './commands/setup.js'
import { linkCommand } from './commands/link.js'
import { updateCommand } from './commands/update.js'
import { doctorCommand } from './commands/doctor.js'
import { totalCommand } from './commands/total.js'

const commands: Record<string, () => Promise<void>> = {
  stats: statsCommand,
  daily: dailyCommand,
  models: modelsCommand,
  rate: rateCommand,
  report: reportCommand,
  sync: syncCommand,
  log: logCommand,
  setup: setupCommand,
  link: linkCommand,
  update: updateCommand,
  doctor: doctorCommand,
  total: totalCommand,
}

function printHelp(): void {
  console.log(`
  agentic-commons (acommons) - AI coding tool token usage stats

  Usage: acommons [command]

  Commands:
    stats     Today's usage summary (default)
    daily     Last 14 days daily breakdown
    models    Token usage by model
    rate      Codex rate limit status
    report    Generate HTML report
    sync      Sync data to ~/.agentic-commons/usage.json
    log       Log session stats (used by hooks)
    setup     Install hooks and scheduler
    link      Link this CLI device to your web account
    update    Upgrade CLI to the latest npm version
    doctor    Run local/cloud diagnostics
    total     All-time token total from local history
`)
}

async function main(): Promise<void> {
  const arg = process.argv[2]

  if (arg === '--help' || arg === '-h') {
    printHelp()
    return
  }

  const cmd = commands[arg ?? 'stats']
  if (!cmd) {
    console.log(`  Unknown command: ${arg}`)
    printHelp()
    process.exitCode = 1
    return
  }

  await cmd()
}

main().catch((err: Error) => {
  console.error(`  Error: ${err.message}`)
  process.exitCode = 1
})

