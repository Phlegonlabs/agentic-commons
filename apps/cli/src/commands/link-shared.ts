import { exec } from 'node:child_process'
import { hostname, platform } from 'node:os'
import { promisify } from 'node:util'
import chalk from 'chalk'
import { readConfig, writeConfig } from '../sources/config.js'
import { readStoredApiToken, writeStoredApiToken } from '../sources/api-token.js'
import { readDeviceIdentityPayload } from '../sources/device-identity.js'

const execAsync = promisify(exec)
const DEFAULT_API_BASE = 'https://api.agenticcommons.xyz'
const LOCAL_DEV_API_BASE = 'http://127.0.0.1:8787'

type DeviceStartResponse = {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete: string
  expires_in: number
  interval: number
}

type DevicePollResponse =
  | { status: 'authorization_pending' }
  | { status: 'authorized'; access_token: string; user_id: string }

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function readApiBase(configApiBase?: string): string {
  const fromEnv = process.env['ACOMMONS_API_URL']?.trim()
  if (fromEnv) {
    return fromEnv
  }

  if (configApiBase && configApiBase.trim()) {
    return configApiBase
  }

  if (process.env['ACOMMONS_LOCAL_API'] === 'true') {
    return LOCAL_DEV_API_BASE
  }

  return DEFAULT_API_BASE
}

async function readPersistedToken(configToken?: string): Promise<string | null> {
  const stored = await readStoredApiToken()
  if (stored) {
    return stored
  }

  const legacyToken = configToken?.trim() ?? ''
  if (!legacyToken) {
    return null
  }

  await writeStoredApiToken(legacyToken)
  return legacyToken
}

async function maybeOpenBrowser(url: string): Promise<void> {
  try {
    if (platform() === 'win32') {
      await execAsync(`start "" "${url}"`)
      return
    }

    if (platform() === 'darwin') {
      await execAsync(`open "${url}"`)
      return
    }

    await execAsync(`xdg-open "${url}"`)
  } catch {
    // No-op: manual open fallback is printed to user.
  }
}

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json() as T | { error?: string }
  if (!response.ok) {
    const error = (data as { error?: string }).error
    throw new Error(error ?? `API error ${response.status}`)
  }

  return data as T
}

async function linkDevice(options?: { force?: boolean; openBrowser?: boolean }): Promise<{ apiBase: string; apiToken: string | null }> {
  const config = await readConfig()
  const apiBase = readApiBase(config.apiBase)

  const envToken = process.env['ACOMMONS_API_TOKEN']?.trim()
  if (envToken) {
    return {
      apiBase,
      apiToken: envToken,
    }
  }

  const persistedToken = await readPersistedToken(config.apiToken)
  if (config.apiToken) {
    const { apiToken: _legacyApiToken, ...rest } = config
    await writeConfig(rest)
  }

  if (!options?.force && persistedToken) {
    return {
      apiBase,
      apiToken: persistedToken,
    }
  }

  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    return {
      apiBase,
      apiToken: null,
    }
  }

  const deviceIdentity = await readDeviceIdentityPayload().catch(() => null)
  const deviceLabel = deviceIdentity?.device_label ?? hostname()
  const startPayload: Record<string, unknown> = {
    device_label: deviceLabel,
  }
  if (deviceIdentity) {
    startPayload.device_secret = deviceIdentity.device_secret
    startPayload.device_profile = deviceIdentity.device_profile
  }
  const start = await postJson<DeviceStartResponse>(`${apiBase}/v1/auth/device/start`, startPayload)

  console.log(`  ${chalk.cyan('Link required:')} authorize this CLI in your browser`)
  console.log(`  Open: ${start.verification_uri_complete}`)
  console.log(`  Code: ${chalk.bold(start.user_code)}`)

  if (options?.openBrowser ?? true) {
    await maybeOpenBrowser(start.verification_uri_complete)
  }

  const startedAt = Date.now()
  const timeoutMs = start.expires_in * 1000

  while (Date.now() - startedAt < timeoutMs) {
    await sleep(Math.max(1, start.interval) * 1000)

    try {
      const poll = await postJson<DevicePollResponse>(`${apiBase}/v1/auth/device/poll`, {
        device_code: start.device_code,
      })

      if (poll.status === 'authorization_pending') {
        continue
      }

      if (poll.status === 'authorized') {
        await writeStoredApiToken(poll.access_token)
        const { apiToken: _legacyApiToken, ...rest } = config
        const next = {
          ...rest,
          apiBase,
          linkedAt: new Date().toISOString(),
          deviceLabel,
        }
        await writeConfig(next)

        console.log(`  ${chalk.green('+')} CLI linked to account ${poll.user_id}`)
        return {
          apiBase,
          apiToken: poll.access_token,
        }
      }
    } catch (cause) {
      if (cause instanceof Error && (cause.message === 'authorization_pending' || cause.message === 'expired_token')) {
        if (cause.message === 'authorization_pending') {
          continue
        }
        break
      }

      throw cause
    }
  }

  throw new Error('link_timeout')
}

export { linkDevice, readApiBase }
