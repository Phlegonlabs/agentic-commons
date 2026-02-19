import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { exec } from 'node:child_process'
import { platform } from 'node:os'
import { promisify } from 'node:util'
import chalk from 'chalk'
import { acDir, claudeSettingsPath, codexSessionsDir } from '../sources/paths.js'
import { printHeader } from '../format.js'
import { syncCommand } from './sync.js'
import type { SetupConfig } from '../types.js'
import { readConfig, writeConfig } from '../sources/config.js'
import { linkDevice } from './link-shared.js'
import { doctorCommand } from './doctor.js'

const execAsync = promisify(exec)

function firstNonEmptyLine(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
  return lines[0] ?? null
}

async function resolveWindowsAcommonsCmdPath(): Promise<string> {
  const cmdLookup = await execAsync('where acommons.cmd').catch(() => ({ stdout: '' }))
  const cmdPath = firstNonEmptyLine(cmdLookup.stdout)
  if (cmdPath) {
    return cmdPath
  }

  const genericLookup = await execAsync('where acommons').catch(() => ({ stdout: '' }))
  const genericLines = genericLookup.stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)

  const explicitCmd = genericLines.find(line => line.toLowerCase().endsWith('.cmd'))
  if (explicitCmd) {
    return explicitCmd
  }

  const explicitPs1 = genericLines.find(line => line.toLowerCase().endsWith('.ps1'))
  if (explicitPs1) {
    return explicitPs1.replace(/\.ps1$/i, '.cmd')
  }

  const appData = process.env['APPDATA']
  if (appData && appData.trim().length > 0) {
    return `${appData}\\npm\\acommons.cmd`
  }

  return 'acommons'
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as T
  } catch {
    return null
  }
}

type HookCommand = {
  type: 'command'
  command: string
}

type HookMatcherEntry = {
  matcher?: unknown
  hooks: unknown[]
  [key: string]: unknown
}

type NormalizeStopHooksResult = {
  stopEntries: unknown[]
  migratedLegacyCount: number
  droppedDuplicateCount: number
  repairedInvalidEntryCount: number
  droppedInvalidEntryCount: number
  hadAcommonsLog: boolean
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLegacyCommandEntry(value: unknown): value is HookCommand {
  return isObjectRecord(value)
    && value.type === 'command'
    && typeof value.command === 'string'
}

function isHookConfigEntry(value: unknown): value is { type: string } {
  return isObjectRecord(value) && typeof value.type === 'string'
}

function toMatcherEntry(command: string): HookMatcherEntry {
  return {
    hooks: [
      { type: 'command', command },
    ],
  }
}

function normalizeStopHooks(stopRaw: unknown, hookCmd: string): NormalizeStopHooksResult {
  const source = Array.isArray(stopRaw) ? stopRaw : []
  const seenCommands = new Set<string>()
  const stopEntries: unknown[] = []
  let migratedLegacyCount = 0
  let droppedDuplicateCount = 0
  let repairedInvalidEntryCount = 0
  let droppedInvalidEntryCount = 0
  let hadAcommonsLog = false

  for (const entry of source) {
    if (isLegacyCommandEntry(entry)) {
      const command = entry.command.trim()
      if (!command) {
        continue
      }
      migratedLegacyCount++
      if (seenCommands.has(command)) {
        droppedDuplicateCount++
        if (command === hookCmd) {
          hadAcommonsLog = true
        }
        continue
      }
      seenCommands.add(command)
      if (command === hookCmd) {
        hadAcommonsLog = true
      }
      stopEntries.push(toMatcherEntry(command))
      continue
    }

    if (!isObjectRecord(entry)) {
      droppedInvalidEntryCount++
      continue
    }

    if (Array.isArray(entry.hooks)) {
      const dedupedHooks: unknown[] = []
      for (const hook of entry.hooks) {
        if (isLegacyCommandEntry(hook)) {
          const command = hook.command.trim()
          if (!command) {
            continue
          }
          if (seenCommands.has(command)) {
            droppedDuplicateCount++
            if (command === hookCmd) {
              hadAcommonsLog = true
            }
            continue
          }
          seenCommands.add(command)
          if (command === hookCmd) {
            hadAcommonsLog = true
          }
          dedupedHooks.push({ type: 'command', command })
          continue
        }

        if (isHookConfigEntry(hook)) {
          dedupedHooks.push(hook)
          continue
        }
        droppedInvalidEntryCount++
      }

      stopEntries.push({
        ...entry,
        hooks: dedupedHooks,
      })
      continue
    }

    repairedInvalidEntryCount++
    stopEntries.push({
      ...entry,
      hooks: [],
    })
  }

  if (!hadAcommonsLog) {
    stopEntries.push(toMatcherEntry(hookCmd))
  }

  return {
    stopEntries,
    migratedLegacyCount,
    droppedDuplicateCount,
    repairedInvalidEntryCount,
    droppedInvalidEntryCount,
    hadAcommonsLog,
  }
}

async function installClaudeHook(): Promise<boolean> {
  type ClaudeSettings = {
    hooks?: Record<string, unknown>
    [key: string]: unknown
  }

  const settings = await readJsonFile<ClaudeSettings>(claudeSettingsPath) ?? {}
  settings.hooks = isObjectRecord(settings.hooks) ? settings.hooks : {}

  const hookCmd = 'acommons log'
  const normalized = normalizeStopHooks(settings.hooks['Stop'], hookCmd)
  settings.hooks['Stop'] = normalized.stopEntries

  await writeFile(claudeSettingsPath, JSON.stringify(settings, null, 2), 'utf-8')

  if (normalized.migratedLegacyCount > 0) {
    console.log(`  ${chalk.green('+')} Migrated ${normalized.migratedLegacyCount} legacy Claude Stop hook${normalized.migratedLegacyCount === 1 ? '' : 's'} to matcher format`)
  }
  if (normalized.droppedDuplicateCount > 0) {
    console.log(`  ${chalk.green('+')} Removed ${normalized.droppedDuplicateCount} duplicate Claude Stop command hook${normalized.droppedDuplicateCount === 1 ? '' : 's'}`)
  }
  if (normalized.repairedInvalidEntryCount > 0) {
    console.log(`  ${chalk.green('+')} Repaired ${normalized.repairedInvalidEntryCount} invalid Claude Stop hook entr${normalized.repairedInvalidEntryCount === 1 ? 'y' : 'ies'}`)
  }
  if (normalized.droppedInvalidEntryCount > 0) {
    console.log(`  ${chalk.green('+')} Dropped ${normalized.droppedInvalidEntryCount} malformed Claude Stop hook value${normalized.droppedInvalidEntryCount === 1 ? '' : 's'}`)
  }
  if (normalized.hadAcommonsLog) {
    console.log(`  ${chalk.dim('Claude hook already installed')}`)
    return true
  }

  console.log(`  ${chalk.green('+')} Claude Code Stop hook installed (matcher format)`)
  return true
}

async function installScheduler(): Promise<'schtasks' | 'launchd' | 'crontab' | null> {
  const os = platform()

  if (os === 'win32') {
    try {
      const acommonsCmdPath = await resolveWindowsAcommonsCmdPath()
      const taskRunCommand = `cmd /c ""${acommonsCmdPath}" sync""`
      await execAsync(`schtasks /create /tn "AgenticCommons" /tr "${taskRunCommand}" /sc hourly /f`)
      console.log(`  ${chalk.green('+')} Windows scheduled task created`)
      return 'schtasks'
    } catch (e) {
      console.log(`  ${chalk.yellow('!')} Failed to create scheduled task: ${e}`)
      return null
    }
  }

  if (os === 'darwin') {
    const plistPath = `${process.env['HOME']}/Library/LaunchAgents/com.agentic-commons.plist`
    const acommonsPath = (await execAsync('which acommons').catch(() => ({ stdout: 'acommons' }))).stdout.trim()
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.agentic-commons</string>
  <key>ProgramArguments</key><array><string>${acommonsPath}</string><string>sync</string></array>
  <key>StartInterval</key><integer>3600</integer>
  <key>RunAtLoad</key><true/>
</dict>
</plist>`
    await writeFile(plistPath, plist, 'utf-8')
    await execAsync(`launchctl load "${plistPath}"`).catch(() => {})
    console.log(`  ${chalk.green('+')} macOS LaunchAgent installed`)
    return 'launchd'
  }

  try {
    const { stdout } = await execAsync('crontab -l 2>/dev/null || true')
    if (stdout.includes('acommons sync')) {
      console.log(`  ${chalk.dim('Crontab entry already exists')}`)
      return 'crontab'
    }
    const newCron = `${stdout.trimEnd()}\n0 * * * * acommons sync\n`
    await execAsync(`echo "${newCron}" | crontab -`)
    console.log(`  ${chalk.green('+')} Crontab entry added`)
    return 'crontab'
  } catch {
    console.log(`  ${chalk.yellow('!')} Failed to install crontab entry`)
    return null
  }
}

export async function setupCommand(): Promise<void> {
  printHeader('Agentic Commons - Setup')

  await mkdir(acDir, { recursive: true })
  console.log(`  ${chalk.green('+')} Created ~/.agentic-commons/`)

  const claudeHook = await installClaudeHook()

  const hasCodex = existsSync(codexSessionsDir)
  if (hasCodex) {
    console.log(`  ${chalk.green('+')} Codex sessions directory found`)
  } else {
    console.log(`  ${chalk.dim('Codex not found (skipping)')}`)
  }

  const schedulerType = await installScheduler()

  const previous = await readConfig()
  const config: SetupConfig = {
    ...previous,
    version: 1,
    claudeHookInstalled: claudeHook,
    schedulerInstalled: schedulerType !== null,
    schedulerType,
    lastSetup: new Date().toISOString(),
  }
  await writeConfig(config)

  console.log()
  try {
    await linkDevice({ force: false, openBrowser: true })
  } catch (cause) {
    if (cause instanceof Error && cause.message === 'link_timeout') {
      console.log(`  ${chalk.yellow('!')} Linking timed out. You can run 'acommons link' later.`)
    } else {
      console.log(`  ${chalk.yellow('!')} Linking skipped: ${cause instanceof Error ? cause.message : 'unknown_error'}`)
    }
  }

  console.log()
  await syncCommand()

  console.log(`  ${chalk.green('+')} Running post-setup self-check`)
  console.log()
  await doctorCommand()

  console.log(`  ${chalk.green('Setup complete!')}`)
  console.log()
}
