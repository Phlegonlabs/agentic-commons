import { randomBytes } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { arch, cpus, hostname, platform, release, totalmem } from 'node:os'
import { acDeviceSecretPath, acDir } from './paths.js'
import type { DeviceIdentityPayload, DeviceProfilePayload } from '@agentic-commons/shared'

const DEVICE_SECRET_DIR_MODE = 0o700
const DEVICE_SECRET_FILE_MODE = 0o600
const DEVICE_SECRET_HEX_LENGTH = 64
const MAX_DEVICE_LABEL_LENGTH = 128

function cpuCoreBucket(coreCount: number): string {
  if (!Number.isFinite(coreCount) || coreCount <= 0) {
    return 'unknown'
  }
  if (coreCount <= 2) {
    return '1-2'
  }
  if (coreCount <= 4) {
    return '3-4'
  }
  if (coreCount <= 8) {
    return '5-8'
  }
  if (coreCount <= 16) {
    return '9-16'
  }
  return '17+'
}

function memorySizeBucket(memoryBytes: number): string {
  if (!Number.isFinite(memoryBytes) || memoryBytes <= 0) {
    return 'unknown'
  }

  const gib = memoryBytes / (1024 ** 3)
  if (gib < 4) {
    return '<4gb'
  }
  if (gib < 8) {
    return '4-8gb'
  }
  if (gib < 16) {
    return '8-16gb'
  }
  if (gib < 32) {
    return '16-32gb'
  }
  return '32gb+'
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function detectDeviceSignals(): Promise<string[]> {
  const signals = new Set<string>()

  if (process.env['CI']) {
    signals.add('ci')
  }
  if (process.env['KUBERNETES_SERVICE_HOST']) {
    signals.add('kubernetes')
  }
  if (process.env['CONTAINER']) {
    signals.add('container')
  }

  if (platform() === 'linux') {
    if (await fileExists('/.dockerenv')) {
      signals.add('docker')
      signals.add('container')
    }

    try {
      const cgroup = (await readFile('/proc/1/cgroup', 'utf-8')).toLowerCase()
      if (cgroup.includes('docker') || cgroup.includes('containerd') || cgroup.includes('kubepods')) {
        signals.add('container')
      }
      if (cgroup.includes('docker')) {
        signals.add('docker')
      }
      if (cgroup.includes('kubepods')) {
        signals.add('kubernetes')
      }
    } catch {
      // ignore cgroup detection errors
    }
  }

  return [...signals].sort()
}

function isValidDeviceSecret(secret: string): boolean {
  return /^[a-f0-9]{64}$/.test(secret)
}

async function writeDeviceSecret(secret: string): Promise<void> {
  await mkdir(acDir, { recursive: true, mode: DEVICE_SECRET_DIR_MODE })
  await writeFile(acDeviceSecretPath, secret, {
    encoding: 'utf-8',
    mode: DEVICE_SECRET_FILE_MODE,
  })
}

async function readOrCreateDeviceSecret(): Promise<string> {
  try {
    const existing = (await readFile(acDeviceSecretPath, 'utf-8')).trim().toLowerCase()
    if (isValidDeviceSecret(existing)) {
      return existing
    }
  } catch {
    // missing file is expected on first run
  }

  const created = randomBytes(DEVICE_SECRET_HEX_LENGTH / 2).toString('hex')
  await writeDeviceSecret(created)
  return created
}

async function readDeviceIdentityPayload(): Promise<DeviceIdentityPayload> {
  const label = hostname().slice(0, MAX_DEVICE_LABEL_LENGTH)
  const secret = await readOrCreateDeviceSecret()
  const signals = await detectDeviceSignals()

  return {
    device_secret: secret,
    device_label: label,
    device_profile: {
      hostname: label,
      platform: platform(),
      arch: arch(),
      osVersion: release(),
      cpuBucket: cpuCoreBucket(cpus().length),
      memoryBucket: memorySizeBucket(totalmem()),
      signals,
    },
  }
}

export { readDeviceIdentityPayload }
export type { DeviceIdentityPayload, DeviceProfilePayload }
