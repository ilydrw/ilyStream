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
  'obsPassword',
  'webhookUrl',
  'botToken',
  'token'
])

const SENSITIVE_SETTING_KEYS = new Set([
  'aiApiKey',
  'elevenlabsApiKey',
  'obsPassword',
  'spotifyAccessToken',
  'spotifyRefreshToken',
  'streamKey',
  'streamingStreamKey',
  'goveeApiKey',
  'hueUsername',
  'voicemodApiKey',
  'vtubeToken',
  'discordWebhookUrl',
  'discordBotToken'
])

const ENC_PREFIX = 'enc:v1:'

export function encryptField(value: string): string {
  if (value.startsWith(ENC_PREFIX)) return value
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
    out[key] = encodeSensitiveValue(key, val, SENSITIVE_FIELDS)
  }
  return out
}

export function decryptConfig(config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(config)) {
    out[key] = decodeSensitiveValue(key, val, SENSITIVE_FIELDS)
  }
  return out
}

export function encodeSettingValue(key: string, value: unknown): unknown {
  return encodeSensitiveValue(key, value, SENSITIVE_SETTING_KEYS)
}

export function decodeSettingValue(key: string, value: unknown): unknown {
  return decodeSensitiveValue(key, value, SENSITIVE_SETTING_KEYS)
}

export function parseJson<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

function encodeSensitiveValue(key: string, value: unknown, exactKeys: Set<string>): unknown {
  if (typeof value === 'string') {
    return isSensitiveKey(key, exactKeys) && value ? encryptField(value) : value
  }
  if (Array.isArray(value)) {
    return value.map((item) => encodeSensitiveValue(key, item, exactKeys))
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      out[childKey] = encodeSensitiveValue(childKey, childValue, exactKeys)
    }
    return out
  }
  return value
}

function decodeSensitiveValue(key: string, value: unknown, exactKeys: Set<string>): unknown {
  if (typeof value === 'string') {
    return isSensitiveKey(key, exactKeys) ? decryptField(value) : value
  }
  if (Array.isArray(value)) {
    return value.map((item) => decodeSensitiveValue(key, item, exactKeys))
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      out[childKey] = decodeSensitiveValue(childKey, childValue, exactKeys)
    }
    return out
  }
  return value
}

function isSensitiveKey(key: string, exactKeys: Set<string>): boolean {
  return exactKeys.has(key) || /(?:apiKey|accessToken|refreshToken|streamKey|clientSecret|password|webhookUrl|botToken|sessionId)$/i.test(key)
}
