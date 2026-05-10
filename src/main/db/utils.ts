import { safeStorage } from 'electron'

const SENSITIVE_FIELDS = new Set([
  'sessionId',
  'signApiKey',
  'clientSecret',
  'accessToken',
  'refreshToken',
  'streamKey',
  'apiKey',
  'password',
  'obsPassword'
])

const SENSITIVE_SETTING_KEYS = new Set([
  'aiApiKey',
  'elevenlabsApiKey',
  'obsPassword',
  'spotifyAccessToken',
  'spotifyRefreshToken',
  'streamingStreamKey'
])

const ENC_PREFIX = 'enc:v1:'

export function encryptField(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) return value
  const encrypted = safeStorage.encryptString(value)
  return ENC_PREFIX + encrypted.toString('base64')
}

export function decryptField(value: string): string {
  if (!value.startsWith(ENC_PREFIX)) return value
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[db] safeStorage not available — cannot decrypt field')
    return value
  }
  try {
    const buf = Buffer.from(value.slice(ENC_PREFIX.length), 'base64')
    return safeStorage.decryptString(buf)
  } catch (err) {
    console.error('[db] Failed to decrypt field:', (err as Error).message)
    return value
  }
}

export function encryptConfig(config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(config)) {
    out[key] = SENSITIVE_FIELDS.has(key) && typeof val === 'string' ? encryptField(val) : val
  }
  return out
}

export function decryptConfig(config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(config)) {
    out[key] = SENSITIVE_FIELDS.has(key) && typeof val === 'string' ? decryptField(val) : val
  }
  return out
}

export function encodeSettingValue(key: string, value: unknown): unknown {
  if (SENSITIVE_SETTING_KEYS.has(key) && typeof value === 'string') return encryptField(value)
  return value
}

export function decodeSettingValue(key: string, value: unknown): unknown {
  if (SENSITIVE_SETTING_KEYS.has(key) && typeof value === 'string') return decryptField(value)
  return value
}

export function parseJson<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}
