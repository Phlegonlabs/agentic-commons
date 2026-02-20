import { homedir, platform } from 'node:os'
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
export const acUploadTrackerPath = join(acDir, 'upload-tracker.json')
export const acExternalUsageDir = join(acDir, 'external-usage')
export const openCodeDir = platform() === 'win32'
  ? join(home, 'AppData', 'Roaming', 'opencode')
  : join(home, '.opencode')
export const openCodeDbPath = join(home, '.local', 'share', 'opencode', 'opencode.db')
export const geminiTmpDir = join(home, '.gemini', 'tmp')

