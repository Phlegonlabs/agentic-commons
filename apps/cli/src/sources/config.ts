import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { acConfigPath, acDir } from './paths.js'
import type { SetupConfig } from '../types.js'

const DEFAULT_CONFIG: SetupConfig = {
  version: 1,
  claudeHookInstalled: false,
  schedulerInstalled: false,
  schedulerType: null,
  lastSetup: '',
  autoUpdateEnabled: true,
}

function mergeConfig(raw: Partial<SetupConfig> | null): SetupConfig {
  return {
    ...DEFAULT_CONFIG,
    ...(raw ?? {}),
  }
}

async function readConfig(): Promise<SetupConfig> {
  try {
    const content = await readFile(acConfigPath, 'utf-8')
    const parsed = JSON.parse(content) as Partial<SetupConfig>
    return mergeConfig(parsed)
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

async function writeConfig(config: SetupConfig): Promise<void> {
  await mkdir(acDir, { recursive: true })
  await writeFile(acConfigPath, JSON.stringify(config, null, 2), 'utf-8')
}

export { readConfig, writeConfig }
