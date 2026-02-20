import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { acDir, acUploadTrackerPath } from './paths.js'
import type { UsageDaily } from '@agentic-commons/shared'

type UploadTracker = Record<string, number>

function trackerKey(p: { date: string; source: string; provider: string; model: string }): string {
  return `${p.date}|${p.source}|${p.provider}|${p.model}`
}

async function readUploadTracker(): Promise<UploadTracker> {
  try {
    const content = await readFile(acUploadTrackerPath, 'utf-8')
    return JSON.parse(content) as UploadTracker
  } catch {
    return {}
  }
}

async function writeUploadTracker(tracker: UploadTracker): Promise<void> {
  await mkdir(acDir, { recursive: true })
  await writeFile(acUploadTrackerPath, JSON.stringify(tracker, null, 2), 'utf-8')
}

function filterChangedPayloads(payloads: UsageDaily[], tracker: UploadTracker): UsageDaily[] {
  return payloads.filter(p => tracker[trackerKey(p)] !== p.total_io)
}

function markPayloadsUploaded(tracker: UploadTracker, payloads: UsageDaily[]): void {
  for (const p of payloads) {
    tracker[trackerKey(p)] = p.total_io
  }
}

export { readUploadTracker, writeUploadTracker, filterChangedPayloads, markPayloadsUploaded }
