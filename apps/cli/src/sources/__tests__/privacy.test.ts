import { describe, it, after } from 'node:test'
import { strict as assert } from 'node:assert'
import { writeFile, unlink, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { readIncrementalTranscriptUsage } from '../claude-transcript.js'
import { readDeviceIdentityPayload } from '../device-identity.js'

const SENSITIVE_KEYS = ['content', 'prompt', 'messages', 'text', 'body'] as const
const tmpDir = join(tmpdir(), `privacy-test-${randomBytes(4).toString('hex')}`)
const tempFiles: string[] = []

function hasSensitiveKeys(obj: Record<string, unknown>): string | null {
  const json = JSON.stringify(obj)
  for (const key of SENSITIVE_KEYS) {
    if (json.includes(`"${key}"`)) {
      return key
    }
  }
  return null
}

function makeTranscriptEntry(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'assistant',
    sessionId: 'sess-abc-123',
    timestamp: '2025-06-15T10:00:00Z',
    message: {
      id: 'msg-001',
      role: 'assistant',
      model: 'claude-sonnet-4-20250514',
      content: [{ type: 'text', text: 'This is secret user data' }],
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 20,
        cache_creation_input_tokens: 10,
      },
      ...overrides,
    },
  })
}

async function writeTempJsonl(lines: string[]): Promise<string> {
  await mkdir(tmpDir, { recursive: true })
  const path = join(tmpDir, `transcript-${randomBytes(4).toString('hex')}.jsonl`)
  await writeFile(path, lines.join('\n') + '\n', 'utf-8')
  tempFiles.push(path)
  return path
}

after(async () => {
  for (const f of tempFiles) {
    await unlink(f).catch(() => {})
  }
})

describe('readIncrementalTranscriptUsage privacy', () => {
  it('strips content/prompt/messages from usage rows', async () => {
    const lines = [
      makeTranscriptEntry(),
      makeTranscriptEntry({ prompt: 'secret prompt data' }),
    ]
    const path = await writeTempJsonl(lines)
    const result = await readIncrementalTranscriptUsage(path, 0)
    assert.ok(result, 'should return a result')
    assert.ok(result.newRows.length > 0, 'should have rows')

    for (const row of result.newRows) {
      const leaked = hasSensitiveKeys(row as unknown as Record<string, unknown>)
      assert.equal(leaked, null, `row should not contain sensitive key "${leaked}"`)
    }
  })

  it('only includes expected fields in usage rows', async () => {
    const path = await writeTempJsonl([makeTranscriptEntry()])
    const result = await readIncrementalTranscriptUsage(path, 0)
    assert.ok(result)
    assert.equal(result.newRows.length, 1)

    const row = result.newRows[0]!
    const allowedKeys = new Set(['eventId', 'sessionId', 'date', 'model', 'usage'])
    const rowKeys = Object.keys(row)
    for (const key of rowKeys) {
      assert.ok(allowedKeys.has(key), `unexpected key "${key}" in usage row`)
    }
  })

  it('usage object only contains token count fields', async () => {
    const path = await writeTempJsonl([makeTranscriptEntry()])
    const result = await readIncrementalTranscriptUsage(path, 0)
    assert.ok(result)
    const row = result.newRows[0]!
    const allowedUsageKeys = new Set([
      'inputUncached', 'cachedRead', 'cachedWrite',
      'output', 'reasoning', 'totalIO', 'totalGross',
    ])
    for (const key of Object.keys(row.usage)) {
      assert.ok(allowedUsageKeys.has(key), `unexpected usage key "${key}"`)
    }
  })

  it('ignores non-assistant entries', async () => {
    const nonAssistant = JSON.stringify({
      type: 'human',
      sessionId: 'sess-abc-123',
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'secret question' }],
      },
    })
    const path = await writeTempJsonl([nonAssistant])
    const result = await readIncrementalTranscriptUsage(path, 0)
    assert.ok(result)
    assert.equal(result.newRows.length, 0, 'non-assistant entries should produce no rows')
  })

  it('returns null for missing transcript file', async () => {
    const result = await readIncrementalTranscriptUsage('/nonexistent/path.jsonl', 0)
    assert.equal(result, null)
  })
})

describe('readDeviceIdentityPayload privacy', () => {
  it('only contains expected top-level fields', async () => {
    const payload = await readDeviceIdentityPayload()
    const allowedTopKeys = new Set(['device_secret', 'device_label', 'device_profile'])
    for (const key of Object.keys(payload)) {
      assert.ok(allowedTopKeys.has(key), `unexpected top-level key "${key}"`)
    }
  })

  it('device_profile only contains expected fields', async () => {
    const payload = await readDeviceIdentityPayload()
    const allowedProfileKeys = new Set([
      'hostname', 'platform', 'arch', 'osVersion',
      'cpuBucket', 'memoryBucket', 'signals',
    ])
    for (const key of Object.keys(payload.device_profile)) {
      assert.ok(allowedProfileKeys.has(key), `unexpected profile key "${key}"`)
    }
  })

  it('does not leak file paths or user content in payload', async () => {
    const payload = await readDeviceIdentityPayload()
    const json = JSON.stringify(payload)
    const pathPatterns = ['/home/', '/Users/', 'C:\\Users\\', 'AppData']
    for (const pattern of pathPatterns) {
      const lower = json.toLowerCase()
      const found = lower.includes(pattern.toLowerCase())
      // hostname may contain user info, but no full paths should appear
      if (found) {
        // only acceptable in hostname/device_label which are known fields
        assert.ok(
          payload.device_label.toLowerCase().includes(pattern.toLowerCase()) ||
          payload.device_profile.hostname.toLowerCase().includes(pattern.toLowerCase()),
          `path pattern "${pattern}" found outside hostname fields`,
        )
      }
    }
  })
})
