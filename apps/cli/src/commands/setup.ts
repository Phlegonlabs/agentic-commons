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

const execAsync = promisify(exec)

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as T
  } catch {
    return null
  }
}

async function installClaudeHook(): Promise<boolean> {
  type ClaudeSettings = {
    hooks?: {
      Stop?: Array<{ type: string; command: string }>
      [key: string]: unknown
    }
    [key: string]: unknown
  }

  const settings = await readJsonFile<ClaudeSettings>(claudeSettingsPath) ?? {}
  settings.hooks = settings.hooks ?? {}
  settings.hooks.Stop = settings.hooks.Stop ?? []

  const hookCmd = 'acommons log'
  const already = settings.hooks.Stop.some((h: { command: string }) => h.command === hookCmd)
  if (already) {
    console.log(`  ${chalk.dim('Claude hook already installed')}`)
    return true
  }

  settings.hooks.Stop.push({ type: 'command', command: hookCmd })
  await writeFile(claudeSettingsPath, JSON.stringify(settings, null, 2), 'utf-8')
  console.log(`  ${chalk.green('+')} Claude Code Stop hook installed`)
  return true
}

async function installScheduler(): Promise<'schtasks' | 'launchd' | 'crontab' | null> {
  const os = platform()

  if (os === 'win32') {
    try {
      await execAsync('schtasks /create /tn "AgenticCommons" /tr "acommons sync" /sc hourly /f')
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

  console.log(`  ${chalk.green('Setup complete!')}`)
  console.log()
}
