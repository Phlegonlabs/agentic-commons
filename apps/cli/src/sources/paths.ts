import { homedir } from 'node:os'
import { join } from 'node:path'

const home = homedir()

export const claudeStatsPath = join(home, '.claude', 'stats-cache.json')
export const claudeSettingsPath = join(home, '.claude', 'settings.json')
export const codexSessionsDir = join(home, '.codex', 'sessions')
export const acDir = join(home, '.agentic-commons')
export const acUsagePath = join(acDir, 'usage.json')
export const acClaudeLedgerPath = join(acDir, 'claude-ledger.json')
export const acCodexLedgerPath = join(acDir, 'codex-ledger.json')
export const acReportPath = join(acDir, 'report.html')
export const acConfigPath = join(acDir, 'config.json')
export const acApiTokenPath = join(acDir, 'api-token.secret')
export const acDeviceSecretPath = join(acDir, 'device-secret.key')

