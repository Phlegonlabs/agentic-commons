import type { UsageDaily } from './schema.js'

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
  | { status: 'authorized'; access_token: string; token_type: string; user_id: string }

type DeviceProfilePayload = {
  hostname: string
  platform: string
  arch: string
  osVersion: string
  cpuBucket: string
  memoryBucket: string
  signals: string[]
}

type DeviceIdentityPayload = {
  device_secret: string
  device_label: string
  device_profile: DeviceProfilePayload
}

type UsageDailyBase = Omit<UsageDaily, 'source' | 'provider'>

export type {
  DeviceIdentityPayload,
  DeviceProfilePayload,
  DevicePollResponse,
  DeviceStartResponse,
  UsageDailyBase,
}
