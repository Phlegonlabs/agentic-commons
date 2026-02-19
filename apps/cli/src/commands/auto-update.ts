import { exec } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import chalk from 'chalk'
import { readConfig, writeConfig } from '../sources/config.js'

const execAsync = promisify(exec)
const AUTO_UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000

type PackageMeta = {
  version?: string
}

function parseSemver(version: string): [number, number, number] | null {
  const clean = version.trim().replace(/^v/, '')
  const [core] = clean.split('-')
  const parts = core.split('.').map(part => Number.parseInt(part, 10))
  if (parts.length < 3 || parts.some(part => !Number.isFinite(part))) {
    return null
  }
  return [parts[0], parts[1], parts[2]]
}

function isNewerVersion(current: string, next: string): boolean {
  const a = parseSemver(current)
  const b = parseSemver(next)
  if (!a || !b) {
    return false
  }

  if (b[0] !== a[0]) {
    return b[0] > a[0]
  }
  if (b[1] !== a[1]) {
    return b[1] > a[1]
  }
  return b[2] > a[2]
}

async function readCurrentVersion(): Promise<string> {
  const packageUrl = new URL('../../../../package.json', import.meta.url)
  const raw = await readFile(packageUrl, 'utf-8')
  const parsed = JSON.parse(raw) as PackageMeta
  return parsed.version?.trim() ?? '0.0.0'
}

async function readLatestVersion(): Promise<string | null> {
  try {
    const { stdout } = await execAsync('npm view agentic-commons version --silent')
    const version = stdout.trim()
    return version.length > 0 ? version : null
  } catch {
    return null
  }
}

async function installLatest(): Promise<boolean> {
  try {
    await execAsync('npm install -g agentic-commons@latest')
    return true
  } catch {
    return false
  }
}

async function maybeAutoUpdate(): Promise<void> {
  if (process.env['ACOMMONS_AUTO_UPDATE'] === 'false') {
    return
  }

  const config = await readConfig()
  if (config.autoUpdateEnabled === false) {
    return
  }

  const now = Date.now()
  const lastCheck = config.lastAutoUpdateCheck ? Date.parse(config.lastAutoUpdateCheck) : 0
  if (Number.isFinite(lastCheck) && now - lastCheck < AUTO_UPDATE_INTERVAL_MS) {
    return
  }

  const current = await readCurrentVersion()
  const latest = await readLatestVersion()

  config.lastAutoUpdateCheck = new Date(now).toISOString()
  if (!latest) {
    await writeConfig(config)
    return
  }

  config.lastAutoUpdateVersion = latest
  await writeConfig(config)

  if (!isNewerVersion(current, latest)) {
    return
  }

  console.log(`  ${chalk.cyan('Auto update:')} upgrading ${current} -> ${latest}`)
  const ok = await installLatest()
  if (ok) {
    console.log(`  ${chalk.green('+')} Updated to ${latest}. Next run will use the new version.`)
  } else {
    console.log(`  ${chalk.yellow('!')} Auto update failed. Run 'acommons update' manually.`)
  }
}

async function updateNow(): Promise<void> {
  const current = await readCurrentVersion()
  const latest = await readLatestVersion()

  if (!latest) {
    console.log(`  ${chalk.yellow('!')} Could not fetch latest version from npm.`)
    return
  }

  if (!isNewerVersion(current, latest)) {
    console.log(`  ${chalk.dim(`Already up to date (${current})`)}`)
    return
  }

  console.log(`  Updating ${current} -> ${latest}...`)
  const ok = await installLatest()
  if (!ok) {
    throw new Error('update_failed')
  }

  const config = await readConfig()
  config.lastAutoUpdateCheck = new Date().toISOString()
  config.lastAutoUpdateVersion = latest
  await writeConfig(config)

  console.log(`  ${chalk.green('+')} Updated to ${latest}.`)
}

export { maybeAutoUpdate, updateNow }
