import { resolve } from 'node:path'

const DEFAULT_REDIRECT_URI = 'http://127.0.0.1:8792/callback/'

export interface TikTokBridgeConfig {
  host: string
  port: number
  clientKey: string
  clientSecret: string
  redirectUri: string
  encryptionKey: Buffer
  sessionFile: string
  desktopSessionTtlMs: number
}

export function loadTikTokBridgeConfig(
  environment: NodeJS.ProcessEnv = process.env
): TikTokBridgeConfig {
  const clientKey = required(environment, 'TIKTOK_CLIENT_KEY')
  const clientSecret = required(environment, 'TIKTOK_CLIENT_SECRET')
  const encodedEncryptionKey = required(environment, 'TIKTOK_BRIDGE_ENCRYPTION_KEY')
  const encryptionKey = Buffer.from(encodedEncryptionKey, 'base64')
  if (encryptionKey.byteLength !== 32) {
    throw new Error('TIKTOK_BRIDGE_ENCRYPTION_KEY must be a base64-encoded 32-byte key.')
  }

  const platformPort = environment.PORT
  const port = integer(environment.TIKTOK_BRIDGE_PORT || platformPort, 8787, 1, 65535)
  const sessionTtlDays = integer(environment.TIKTOK_DESKTOP_SESSION_TTL_DAYS, 30, 1, 365)
  return {
    host: String(environment.TIKTOK_BRIDGE_HOST || (platformPort ? '0.0.0.0' : '127.0.0.1')).trim(),
    port,
    clientKey,
    clientSecret,
    redirectUri: String(environment.TIKTOK_REDIRECT_URI || DEFAULT_REDIRECT_URI).trim(),
    encryptionKey,
    sessionFile: resolve(
      String(environment.TIKTOK_BRIDGE_SESSION_FILE || './data/tiktok-sessions.enc').trim()
    ),
    desktopSessionTtlMs: sessionTtlDays * 24 * 60 * 60 * 1000
  }
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = String(environment[name] || '').trim()
  if (!value) throw new Error(`${name} is required.`)
  return value
}

function integer(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Expected an integer between ${min} and ${max}, received ${value}.`)
  }
  return parsed
}
