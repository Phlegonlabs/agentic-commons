import { readClaudeStats } from '../sources/claude.js'
import { readStore, writeStore } from '../sources/store.js'
import { fmtNum } from '../format.js'

export async function logCommand(): Promise<void> {
  const claude = await readClaudeStats()
  if (!claude) {
    console.log('  No Claude stats found.')
    return
  }

  const store = await readStore()
  store.claude.stats = claude
  await writeStore(store)

  const today = new Date().toISOString().slice(0, 10)
  const daily = claude.dailyActivity.find(d => d.date === today)
  const tokens = claude.dailyModelTokens.find(d => d.date === today)
  const totalTokens = tokens
    ? Object.values(tokens.tokensByModel).reduce((a, b) => a + b, 0)
    : 0

  console.log(
    `  [acommons] ${today} | ${fmtNum(daily?.messageCount ?? 0)} msgs | ${fmtNum(totalTokens)} tokens`,
  )
}

