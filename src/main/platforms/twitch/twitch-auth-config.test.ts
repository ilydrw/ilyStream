import { describe, expect, it } from 'vitest'
import {
  createAuthorizedTwitchConfig,
  createDisconnectedTwitchConfig,
  createTwitchAuthStatus
} from './twitch-auth-config'
import type { TwitchAuthorizationResult } from './twitch-auth'
import type { TwitchConfig } from '../types'

const AUTH: TwitchAuthorizationResult = {
  clientId: 'public-client-id',
  accessToken: 'new-access-token',
  refreshToken: 'new-refresh-token',
  expiresIn: 14_400,
  scopes: ['chat:read', 'channel:read:stream_key'],
  login: 'new_streamer',
  userId: 'new-user-id'
}

describe('Twitch authorization config', () => {
  it('persists only derived public-client fields and strips a legacy secret', () => {
    const existing: TwitchConfig = {
      platform: 'twitch',
      enabled: true,
      clientId: 'legacy-client-id',
      clientSecret: 'must-not-survive',
      channel: 'old_streamer',
      broadcasterUserId: 'old-user-id',
      accessToken: 'old-access-token',
      refreshToken: 'old-refresh-token',
      streamKey: 'old-stream-key'
    }

    const config = createAuthorizedTwitchConfig(existing, AUTH, 1_000)

    expect(config).toEqual({
      platform: 'twitch',
      enabled: true,
      clientId: 'public-client-id',
      channel: 'new_streamer',
      broadcasterUserId: 'new-user-id',
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      tokenScopes: ['chat:read', 'channel:read:stream_key'],
      accessTokenExpiresAt: 14_401_000,
      streamKey: undefined
    })
    expect('clientSecret' in config).toBe(false)
  })

  it('preserves a prior stream key only for the same authenticated account', () => {
    const existing: TwitchConfig = {
      platform: 'twitch',
      enabled: true,
      clientId: 'public-client-id',
      channel: 'new_streamer',
      broadcasterUserId: 'new-user-id',
      streamKey: 'known-stream-key'
    }

    expect(createAuthorizedTwitchConfig(existing, AUTH).streamKey).toBe('known-stream-key')
    expect(createAuthorizedTwitchConfig(existing, {
      ...AUTH,
      userId: 'different-user-id',
      login: 'different_streamer'
    }).streamKey).toBeUndefined()
  })

  it('returns sanitized status and clears every account credential on disconnect', () => {
    const linked = createAuthorizedTwitchConfig(null, {
      ...AUTH,
      streamKey: 'stream-key'
    })
    expect(createTwitchAuthStatus(linked, true)).toEqual({
      configured: true,
      connected: true,
      account: { login: 'new_streamer', userId: 'new-user-id' },
      streamKeyAvailable: true,
      message: 'Connected as @new_streamer'
    })

    expect(createDisconnectedTwitchConfig('public-client-id')).toEqual({
      platform: 'twitch',
      enabled: false,
      clientId: 'public-client-id',
      channel: ''
    })
  })
})
