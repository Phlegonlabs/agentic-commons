import chalk from 'chalk'
import { printHeader, printTable } from '../format.js'
import { probeAll, discoverUnknown } from '../sources/probe.js'

export async function probeCommand(): Promise<void> {
  const results = probeAll()
  const detected = results.filter(r => r.status === 'detected')
  const notFound = results.filter(r => r.status === 'not_found')

  printHeader('Agentic Commons - Tool Probe')

  const columns = [
    { header: 'Tool', width: 14, align: 'left' as const },
    { header: 'Binary', width: 6, align: 'left' as const },
    { header: 'Config', width: 6, align: 'left' as const },
    { header: 'Provider', width: 10, align: 'left' as const },
    { header: 'API Key', width: 8, align: 'left' as const },
    { header: 'Model', width: 20, align: 'left' as const },
  ]

  const rows = detected.map(r => [
    r.name,
    r.binaryOnPath ? chalk.green('yes') : chalk.dim('no'),
    r.configFound ? chalk.green('yes') : chalk.dim('no'),
    r.provider,
    r.apiKeyStatus === 'set' ? chalk.green('set')
      : r.apiKeyStatus === 'n/a' ? chalk.dim('n/a')
      : chalk.yellow('not set'),
    r.model ?? chalk.dim('--'),
  ])

  if (rows.length > 0) {
    printTable(columns, rows)
  }

  console.log()
  console.log(chalk.dim(`  ${detected.length} detected, ${notFound.length} not found`))

  const unknown = discoverUnknown()
  if (unknown.length > 0) {
    console.log()
    printHeader('Unknown AI Tools (heuristic)')
    printTable(
      [
        { header: 'Directory', width: 20, align: 'left' as const },
        { header: 'Signal', width: 24, align: 'left' as const },
      ],
      unknown.map(h => [h.dir, h.signal]),
    )
    console.log()
    console.log(chalk.dim(`  ${unknown.length} possible AI tools discovered`))
  }

  console.log()
}
