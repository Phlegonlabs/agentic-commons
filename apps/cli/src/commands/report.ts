import { writeFile } from 'node:fs/promises'
import { exec } from 'node:child_process'
import { platform } from 'node:os'
import { readClaudeStats } from '../sources/claude.js'
import { readCodexSessions } from '../sources/codex.js'
import { acReportPath, acDir } from '../sources/paths.js'
import { mkdir } from 'node:fs/promises'
import { fmtNum } from '../format.js'
import { addBreakdown, codexIOTokens, emptyBreakdown, fromClaudeUsage, fromCodexUsage } from '../token-metrics.js'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function openInBrowser(path: string): void {
  const os = platform()
  const cmd = os === 'win32' ? `start "" "${path}"`
    : os === 'darwin' ? `open "${path}"`
    : `xdg-open "${path}"`
  exec(cmd)
}

export async function reportCommand(): Promise<void> {
  const [claude, codexSessions] = await Promise.all([
    readClaudeStats(),
    readCodexSessions(),
  ])

  const today = new Date().toISOString().slice(0, 10)

  // Today's data
  const claudeDaily = claude?.dailyActivity.find(d => d.date === today)
  const claudeTokens = claude?.dailyModelTokens.find(d => d.date === today)
  const claudeTotal = claudeTokens
    ? Object.values(claudeTokens.tokensByModel).reduce((a, b) => a + b, 0)
    : 0
  const todayCodex = codexSessions.filter(s => s.date === today)
  const codexTotal = todayCodex.reduce((sum, s) => sum + codexIOTokens(s.totalTokens), 0)

  // Daily trend (14 days)
  const dates: string[] = []
  const now = new Date()
  for (let i = 0; i < 14; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    dates.push(d.toISOString().slice(0, 10))
  }

  const claudeByDate = new Map<string, number>()
  for (const e of claude?.dailyModelTokens ?? []) {
    claudeByDate.set(e.date, Object.values(e.tokensByModel).reduce((a, b) => a + b, 0))
  }
  const codexByDate = new Map<string, number>()
  for (const s of codexSessions) {
    codexByDate.set(s.date, (codexByDate.get(s.date) ?? 0) + codexIOTokens(s.totalTokens))
  }

  // Model breakdown
  const modelRows: string[] = []
  if (claude) {
    for (const [model, usage] of Object.entries(claude.modelUsage)) {
      const tokens = fromClaudeUsage(usage)
      modelRows.push(`<tr>
        <td>${escapeHtml(model)}</td>
        <td class="r">${fmtNum(tokens.inputUncached)}</td>
        <td class="r">${fmtNum(tokens.output)}</td>
        <td class="r">${fmtNum(tokens.cachedRead)}</td>
        <td class="r">${fmtNum(tokens.cachedWrite)}</td>
        <td class="r">${fmtNum(tokens.totalIO)}</td>
      </tr>`)
    }
  }
  if (codexSessions.length > 0) {
    const codexByModel = new Map<string, ReturnType<typeof emptyBreakdown>>()
    for (const session of codexSessions) {
      const model = session.model?.trim() || 'gpt-5'
      const current = codexByModel.get(model) ?? emptyBreakdown()
      codexByModel.set(model, addBreakdown(current, fromCodexUsage(session.totalTokens)))
    }

    const codexRows = [...codexByModel.entries()]
      .sort((a, b) => b[1].totalIO - a[1].totalIO)
      .map(([model, agg]) => `<tr>
      <td>${escapeHtml(model)}</td>
      <td class="r">${fmtNum(agg.inputUncached)}</td>
      <td class="r">${fmtNum(agg.output)}</td>
      <td class="r">${fmtNum(agg.cachedRead)}</td>
      <td class="r">${fmtNum(agg.cachedWrite)}</td>
      <td class="r">${fmtNum(agg.totalIO)}</td>
    </tr>`)

    modelRows.push(...codexRows)
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agentic Commons Report - ${today}</title>
<style>
  :root { --bg: #0d1117; --fg: #c9d1d9; --border: #30363d; --accent: #58a6ff; --muted: #8b949e; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: var(--bg); color: var(--fg); font-family: 'SF Mono', 'Cascadia Code', monospace; padding: 2rem; max-width: 900px; margin: 0 auto; }
  h1 { color: var(--accent); margin-bottom: 0.5rem; font-size: 1.4rem; }
  h2 { color: var(--muted); margin: 2rem 0 0.8rem; font-size: 1rem; text-transform: uppercase; letter-spacing: 0.1em; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
  th, td { padding: 0.5rem 0.8rem; text-align: left; border-bottom: 1px solid var(--border); }
  th { color: var(--muted); font-weight: normal; font-size: 0.85rem; }
  .r { text-align: right; }
  .total { font-weight: bold; border-top: 2px solid var(--border); }
  .dim { color: var(--muted); }
  .ts { color: var(--muted); font-size: 0.8rem; margin-top: 2rem; }
</style>
</head>
<body>
<h1>Agentic Commons</h1>
<p class="dim">Report generated ${new Date().toLocaleString()}</p>

<h2>Today (${today})</h2>
<table>
  <tr><th>Tool</th><th class="r">Sessions</th><th class="r">Messages</th><th class="r">IO Tokens</th><th class="r">Tool Calls</th></tr>
  ${claude ? `<tr><td>Claude</td><td class="r">${fmtNum(claudeDaily?.sessionCount ?? 0)}</td><td class="r">${fmtNum(claudeDaily?.messageCount ?? 0)}</td><td class="r">${fmtNum(claudeTotal)}</td><td class="r">${fmtNum(claudeDaily?.toolCallCount ?? 0)}</td></tr>` : ''}
  ${todayCodex.length > 0 ? `<tr><td>Codex</td><td class="r">${todayCodex.length}</td><td class="r dim">--</td><td class="r">${fmtNum(codexTotal)}</td><td class="r dim">--</td></tr>` : ''}
  <tr class="total"><td>Total</td><td class="r">${(claudeDaily?.sessionCount ?? 0) + todayCodex.length}</td><td></td><td class="r">${fmtNum(claudeTotal + codexTotal)}</td><td></td></tr>
</table>

<h2>Daily Trend (14 days, IO Tokens)</h2>
<table>
  <tr><th>Date</th><th class="r">Claude IO</th><th class="r">Codex IO</th><th class="r">Total IO</th></tr>
  ${dates.map(d => {
    const ct = claudeByDate.get(d) ?? 0
    const cx = codexByDate.get(d) ?? 0
    if (ct === 0 && cx === 0) return ''
    return `<tr><td>${d.slice(5)}</td><td class="r">${ct > 0 ? fmtNum(ct) : '<span class="dim">--</span>'}</td><td class="r">${cx > 0 ? fmtNum(cx) : '<span class="dim">--</span>'}</td><td class="r">${fmtNum(ct + cx)}</td></tr>`
  }).join('\n  ')}
</table>

<h2>Model Breakdown</h2>
<table>
  <tr><th>Model</th><th class="r">Input*</th><th class="r">Output</th><th class="r">Cached Read</th><th class="r">Cached Write</th><th class="r">Total IO</th></tr>
  ${modelRows.join('\n  ')}
</table>

<p class="dim">* Input = Uncached Input. Total IO = Uncached Input + Output.</p>

<p class="ts">Generated by agentic-commons v0.1.0</p>
</body>
</html>`

  await mkdir(acDir, { recursive: true })
  await writeFile(acReportPath, html, 'utf-8')
  console.log(`  Report saved to ${acReportPath}`)
  openInBrowser(acReportPath)
  console.log('  Opened in browser.')
  console.log()
}

