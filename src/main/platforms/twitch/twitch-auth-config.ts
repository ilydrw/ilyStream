import type { TwitchAuthStatus } from '../../../shared/twitch-auth'
import type { TwitchConfig } from '../types'
import type { TwitchAuthorizationResult } from './twitch-auth'

export function createAuthorizedTwitchConfig(
  existing: TwitchConfig | null,
  auth: TwitchAuthorizationResult,
  now = Date.now()
): TwitchConfig {
  const sameAccount = Boolean(
    existing?.broadcasterUserId
    && existing.broadcasterUserId === auth.userId
  )

  return {
    platform: 'twitch',
    enabled: true,
    clientId: auth.clientId,
    channel: auth.login,
    broadcasterUserId: auth.userId,
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken,
    tokenScopes: [...auth.scopes],
    accessTokenExpiresAt: now + auth.expiresIn * 1000,
    streamKey: auth.streamKey || (sameAccount ? existing?.streamKey : undefined)
  }
}

export function createDisconnectedTwitchConfig(clientId: string): TwitchConfig {
  return {
    platform: 'twitch',
    enabled: false,
    clientId,
    channel: ''
  }
}

export function createTwitchAuthStatus(
  config: TwitchConfig | null,
  connected: boolean
): TwitchAuthStatus {
  const account = config?.channel?.trim()
    ? {
        login: config.channel.trim(),
        userId: config.broadcasterUserId?.trim() || ''
      }
    : null
  const configured = Boolean(
    account
    && config?.clientId?.trim()
    && (config?.refreshToken?.trim() || config?.accessToken?.trim())
  )

  return {
    configured,
    connected,
    account,
    streamKeyAvailable: Boolean(config?.streamKey?.trim()),
    message: connected && account
      ? `Connected as @${account.login}`
      : configured && account
        ? `Authorized as @${account.login}; Twitch services are currently offline.`
        : 'Connect your Twitch account to enable chat, events, telemetry, and streaming.'
  }
}
