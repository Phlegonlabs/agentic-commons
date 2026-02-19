import chalk from 'chalk'

export function fmtNum(n: number): string {
  return n.toLocaleString('en-US')
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

export function padRight(s: string, len: number): string {
  return s + ' '.repeat(Math.max(0, len - s.length))
}

export function padLeft(s: string, len: number): string {
  return ' '.repeat(Math.max(0, len - s.length)) + s
}

type Column = { header: string; width: number; align: 'left' | 'right' }

export function printTable(columns: Column[], rows: string[][]): void {
  const sep = '  '
  const headerLine = columns
    .map(c => c.align === 'right' ? padLeft(c.header, c.width) : padRight(c.header, c.width))
    .join(sep)

  console.log(chalk.dim('  ' + headerLine))
  console.log(chalk.dim('  ' + columns.map(c => '─'.repeat(c.width)).join(sep)))

  for (const row of rows) {
    const line = columns
      .map((c, i) => {
        const val = row[i] ?? '--'
        return c.align === 'right' ? padLeft(val, c.width) : padRight(val, c.width)
      })
      .join(sep)
    console.log('  ' + line)
  }
}

export function printHeader(title: string): void {
  console.log()
  console.log(chalk.bold(`  ${title}`))
  console.log()
}

export function progressBar(percent: number, width = 20): string {
  const filled = Math.round((percent / 100) * width)
  const empty = width - filled
  return chalk.green('█'.repeat(filled)) + chalk.dim('░'.repeat(empty))
}
