import { resolve } from 'node:path'

const DEFAULT_REDIRECT_URI = 'http://127.0.0.1:8792/callback/'
const DEFAULT_KICK_REDIRECT_URI = 'http://127.0.0.1:8793/callback'

export interface KickOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export interface TikTokBridgeConfig {
  host: string
  port: number
  clientKey: string
  clientSecret: string
  redirectUri: string
  encryptionKey: Buffer
  sessionFile: string
  desktopSessionTtlMs: number
  kick?: KickOAuthConfig
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
  const kick = loadKickOAuthConfig(environment)
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
    desktopSessionTtlMs: sessionTtlDays * 24 * 60 * 60 * 1000,
    kick
  }
}

export function loadKickOAuthConfig(
  environment: NodeJS.ProcessEnv = process.env
): KickOAuthConfig | undefined {
  const clientId = String(environment.KICK_CLIENT_ID || '').trim()
  const clientSecret = String(environment.KICK_CLIENT_SECRET || '').trim()
  const configuredRedirectUri = String(environment.KICK_REDIRECT_URI || '').trim()
  const hasKickConfiguration = Boolean(clientId || clientSecret || configuredRedirectUri)
  if (!hasKickConfiguration) return undefined

  if (!clientId) throw new Error('KICK_CLIENT_ID is required when Kick OAuth is configured.')
  if (!clientSecret) throw new Error('KICK_CLIENT_SECRET is required when Kick OAuth is configured.')

  const redirectUri = configuredRedirectUri || DEFAULT_KICK_REDIRECT_URI
  assertValidRedirectUri(redirectUri)
  return { clientId, clientSecret, redirectUri }
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

function assertValidRedirectUri(value: string): void {
  let redirectUri: URL
  try {
    redirectUri = new URL(value)
  } catch {
    throw new Error('KICK_REDIRECT_URI must be a valid absolute URL.')
  }

  const isSecure = redirectUri.protocol === 'https:'
  const isLoopback = redirectUri.protocol === 'http:' &&
    (redirectUri.hostname === '127.0.0.1' || redirectUri.hostname === 'localhost')
  if (!isSecure && !isLoopback) {
    throw new Error('KICK_REDIRECT_URI must use HTTPS or an HTTP loopback address.')
  }
  if (redirectUri.username || redirectUri.password || redirectUri.hash) {
    throw new Error('KICK_REDIRECT_URI must not include credentials or a fragment.')
  }
}
