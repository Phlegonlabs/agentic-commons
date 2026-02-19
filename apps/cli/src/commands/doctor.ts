import { existsSync } from 'node:fs'
import chalk from 'chalk'
import { printHeader } from '../format.js'
import { readConfig } from '../sources/config.js'
import {
  acClaudeLedgerPath,
  acCodexLedgerPath,
  acConfigPath,
  acUsagePath,
  claudeStatsPath,
  codexSessionsDir,
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

function statusMark(ok: boolean): string {
  return ok ? chalk.green('+') : chalk.yellow('!')
}

function normalizeError(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message
  }
  return 'unknown_error'
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
  const token = envToken ?? config.apiToken ?? null
  const autoUpdateEnabledByEnv = process.env['ACOMMONS_AUTO_UPDATE'] !== 'false'
  const autoUpdateEnabled = autoUpdateEnabledByEnv && config.autoUpdateEnabled !== false

  console.log('  Local')
  console.log(`  ${statusMark(existsSync(acConfigPath))} Config file: ${acConfigPath}`)
  console.log(`  ${statusMark(existsSync(acUsagePath))} Usage store: ${acUsagePath}`)
  console.log(`  ${statusMark(existsSync(acClaudeLedgerPath))} Claude realtime ledger: ${acClaudeLedgerPath}`)
  console.log(`  ${statusMark(existsSync(acCodexLedgerPath))} Codex realtime ledger: ${acCodexLedgerPath}`)
  console.log(`  ${statusMark(existsSync(claudeStatsPath))} Claude stats source: ${claudeStatsPath}`)
  console.log(`  ${statusMark(existsSync(codexSessionsDir))} Codex sessions source: ${codexSessionsDir}`)
  console.log(`  ${statusMark(config.schedulerInstalled)} Scheduler: ${config.schedulerInstalled ? (config.schedulerType ?? 'enabled') : 'not installed'}`)
  console.log()

  console.log('  Cloud')
  console.log(`  ${chalk.green('+')} API base: ${apiBase}`)
  console.log(`  ${statusMark(Boolean(token))} Auth token: ${token ? (envToken ? 'env (ACOMMONS_API_TOKEN)' : 'stored config') : 'missing'}`)

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
