import { existsSync } from 'node:fs'
import { exec } from 'node:child_process'
import { homedir, platform } from 'node:os'
import { promisify } from 'node:util'
import chalk from 'chalk'
import { printHeader } from '../format.js'
import { readConfig, writeConfig } from '../sources/config.js'
import { readStoredApiToken, writeStoredApiToken } from '../sources/api-token.js'
import { readExternalUsageDiagnostics } from '../sources/external-usage.js'
import {
  acClaudeLedgerPath,
  acCodexLedgerPath,
  acConfigPath,
  acExternalUsageDir,
  acUsagePath,
  claudeStatsPath,
  codexSessionsDir,
  openCodeDir,
} from '../sources/paths.js'
import { readApiBase } from './link-shared.js'

type HealthPayload = {
  ok?: boolean
}

type ConnectionPayload = {
  linked?: boolean
  activeKeyCount?: number
  lastSyncAt?: string | null
}

type CheckResult = {
  ok: boolean
  detail: string
}

const execAsync = promisify(exec)
const MAC_LAUNCHD_LABEL = 'com.agentic-commons'

function statusMark(ok: boolean): string {
  return ok ? chalk.green('+') : chalk.yellow('!')
}

function normalizeError(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message
  }
  return 'unknown_error'
}

function macLaunchAgentPlistPath(): string {
  return `${homedir()}/Library/LaunchAgents/${MAC_LAUNCHD_LABEL}.plist`
}

async function checkMacLaunchAgentLoaded(): Promise<CheckResult> {
  try {
    await execAsync(`launchctl list ${MAC_LAUNCHD_LABEL}`)
    return {
      ok: true,
      detail: `loaded (${MAC_LAUNCHD_LABEL})`,
    }
  } catch {
    return {
      ok: false,
      detail: `not loaded (${MAC_LAUNCHD_LABEL})`,
    }
  }
}

async function checkApiHealth(apiBase: string): Promise<CheckResult> {
  try {
    const response = await fetch(`${apiBase}/health`, {
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      return {
        ok: false,
        detail: `health endpoint returned ${response.status}`,
      }
    }

    const payload = await response.json() as HealthPayload
    return {
      ok: payload.ok === true,
      detail: payload.ok === true ? 'API reachable' : 'health payload missing ok=true',
    }
  } catch (cause) {
    return {
      ok: false,
      detail: `health check failed (${normalizeError(cause)})`,
    }
  }
}

async function checkConnectionStatus(apiBase: string, token: string): Promise<CheckResult> {
  try {
    const response = await fetch(`${apiBase}/v1/me/connection-status`, {
      headers: {
        authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      return {
        ok: false,
        detail: `connection-status returned ${response.status}`,
      }
    }

    const payload = await response.json() as ConnectionPayload
    return {
      ok: true,
      detail: `linked=${payload.linked ? 'yes' : 'no'}, activeKeys=${payload.activeKeyCount ?? 0}, lastSync=${payload.lastSyncAt ?? 'n/a'}`,
    }
  } catch (cause) {
    return {
      ok: false,
      detail: `connection-status failed (${normalizeError(cause)})`,
    }
  }
}

export async function doctorCommand(): Promise<void> {
  printHeader('Agentic Commons - Doctor')

  const config = await readConfig()
  const apiBase = readApiBase(config.apiBase)
  const envToken = process.env['ACOMMONS_API_TOKEN']?.trim() ?? null
  let tokenSource = envToken ? 'env (ACOMMONS_API_TOKEN)' : 'missing'
  const storedToken = await readStoredApiToken()
  let token = envToken ?? storedToken ?? null

  if (!envToken && !storedToken && config.apiToken) {
    const legacyToken = config.apiToken.trim()
    if (legacyToken) {
      await writeStoredApiToken(legacyToken)
      const { apiToken: _legacyApiToken, ...rest } = config
      await writeConfig(rest)
      token = legacyToken
      tokenSource = 'stored secure token (migrated)'
    }
  }

  if (!envToken && storedToken) {
    tokenSource = 'stored secure token'
  } else if (envToken) {
    tokenSource = 'env (ACOMMONS_API_TOKEN)'
  }
  const autoUpdateEnabledByEnv = process.env['ACOMMONS_AUTO_UPDATE'] !== 'false'
  const autoUpdateEnabled = autoUpdateEnabledByEnv && config.autoUpdateEnabled !== false
  const externalUsage = await readExternalUsageDiagnostics()

  console.log('  Local')
  console.log(`  ${statusMark(existsSync(acConfigPath))} Config file: ${acConfigPath}`)
  console.log(`  ${statusMark(existsSync(acUsagePath))} Usage store: ${acUsagePath}`)
  console.log(`  ${statusMark(existsSync(acClaudeLedgerPath))} Claude realtime ledger: ${acClaudeLedgerPath}`)
  console.log(`  ${statusMark(existsSync(acCodexLedgerPath))} Codex realtime ledger: ${acCodexLedgerPath}`)
  console.log(`  ${statusMark(existsSync(claudeStatsPath))} Claude stats source: ${claudeStatsPath}`)
  console.log(`  ${statusMark(existsSync(codexSessionsDir))} Codex sessions source: ${codexSessionsDir}`)
  console.log(`  ${statusMark(externalUsage.externalDirExists)} External usage dropbox: ${acExternalUsageDir} (${externalUsage.externalCandidateFiles} jsonl/ndjson files)`)
  console.log(`  ${statusMark(externalUsage.openCodeDirExists)} OpenCode dir: ${openCodeDir} (${externalUsage.openCodeJsonlFiles} candidate jsonl files)`)
  console.log(`  ${statusMark(externalUsage.parsedPayloadRows > 0)} External parsed rows: ${externalUsage.parsedPayloadRows}`)
  console.log(`  ${statusMark(config.schedulerInstalled)} Scheduler: ${config.schedulerInstalled ? (config.schedulerType ?? 'enabled') : 'not installed'}`)
  if (platform() === 'darwin') {
    const plistPath = macLaunchAgentPlistPath()
    console.log(`  ${statusMark(existsSync(plistPath))} macOS LaunchAgent plist: ${plistPath}`)
    const launchAgent = await checkMacLaunchAgentLoaded()
    console.log(`  ${statusMark(launchAgent.ok)} macOS LaunchAgent: ${launchAgent.detail}`)
  }
  console.log()

  console.log('  Cloud')
  console.log(`  ${chalk.green('+')} API base: ${apiBase}`)
  console.log(`  ${statusMark(Boolean(token))} Auth token: ${token ? tokenSource : 'missing'}`)

  const health = await checkApiHealth(apiBase)
  console.log(`  ${statusMark(health.ok)} API health: ${health.detail}`)

  if (token && health.ok) {
    const connection = await checkConnectionStatus(apiBase, token)
    console.log(`  ${statusMark(connection.ok)} Account link: ${connection.detail}`)
  } else if (!token) {
    console.log(`  ${chalk.yellow('!')} Account link: run 'acommons link' to authorize this device`)
  }
  console.log()

  console.log('  Updates')
  console.log(`  ${statusMark(autoUpdateEnabled)} Auto update: ${autoUpdateEnabled ? 'enabled' : 'disabled'}`)
  console.log(`  ${chalk.green('+')} Last check: ${config.lastAutoUpdateCheck ?? 'never'}`)
  console.log(`  ${chalk.green('+')} Last seen version: ${config.lastAutoUpdateVersion ?? 'n/a'}`)
  console.log()
}
