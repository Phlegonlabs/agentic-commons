import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { acDir, acUsagePath } from './paths.js'
import type { UsageStore } from '../types.js'

const EMPTY_STORE: UsageStore = {
  version: 1,
  lastSync: new Date().toISOString(),
  claude: { stats: null },
  codex: { sessions: [] },
}

export async function readStore(): Promise<UsageStore> {
  try {
    const raw = await readFile(acUsagePath, 'utf-8')
    return JSON.parse(raw) as UsageStore
  } catch {
    return { ...EMPTY_STORE }
  }
}

export async function writeStore(store: UsageStore): Promise<void> {
  await mkdir(acDir, { recursive: true })
  store.lastSync = new Date().toISOString()
  await writeFile(acUsagePath, JSON.stringify(store, null, 2), 'utf-8')
}
