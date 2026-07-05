import { describe, expect, it, vi } from 'vitest'
import {
  isRestorablePlatformConnection,
  PlatformConnector,
  restoreEnabledPlatformConnections
} from './platform-persistence'
import { AnyPlatformConfig } from './types'

describe('restoreEnabledPlatformConnections', () => {
  it('connects enabled platform configs and skips disabled ones', async () => {
    const connect = vi.fn(async () => undefined) as PlatformConnector['connect']

    await restoreEnabledPlatformConnections(
      { connect },
      {
        tiktok: { platform: 'tiktok', enabled: true, username: 'streamer' },
        twitch: {
          platform: 'twitch',
          enabled: false,
          channel: 'live-channel',
          clientId: 'client-id',
          clientSecret: 'client-secret'
        },
        kick: { platform: 'kick', enabled: true, channelName: 'creator' }
      }
    )

    expect(connect).toHaveBeenCalledTimes(2)
    expect(connect).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining<Partial<AnyPlatformConfig>>({ platform: 'tiktok' })
    )
    expect(connect).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining<Partial<AnyPlatformConfig>>({ platform: 'kick' })
    )
  })

  it('continues restoring other platforms when one connection fails', async () => {
    const connect = vi.fn(async (config: AnyPlatformConfig) => {
      if (config.platform === 'youtube') {
        throw new Error('youtube failed')
      }
    }) as PlatformConnector['connect']

    await expect(
      restoreEnabledPlatformConnections(
        { connect },
        {
          youtube: {
            platform: 'youtube',
            enabled: true,
            apiKey: 'api-key'
          },
          kick: {
            platform: 'kick',
            enabled: true,
            channelName: 'creator'
          }
        }
      )
    ).resolves.toBeUndefined()

    expect(connect).toHaveBeenCalledTimes(2)
  })

  it('restores Twitch chat when auth is configured even if ilyStream is not the Twitch broadcaster', async () => {
    const connect = vi.fn(async () => undefined) as PlatformConnector['connect']

    await restoreEnabledPlatformConnections(
      { connect },
      {
        twitch: {
          platform: 'twitch',
          enabled: false,
          channel: 'live-channel',
          clientId: 'client-id',
          clientSecret: '',
          accessToken: 'oauth-token',
          streamKey: ''
        }
      }
    )

    expect(connect).toHaveBeenCalledTimes(1)
    expect(connect).toHaveBeenCalledWith(
      expect.objectContaining<Partial<AnyPlatformConfig>>({ platform: 'twitch' })
    )
  })

  it('does not restore Twitch from a stream key alone', () => {
    expect(
      isRestorablePlatformConnection({
        platform: 'twitch',
        enabled: false,
        channel: 'live-channel',
        clientId: '',
        clientSecret: '',
        streamKey: 'stream-key'
      })
    ).toBe(false)
  })

  it('restores Kick whenever a channel is configured, even if disabled', () => {
    expect(
      isRestorablePlatformConnection({
        platform: 'kick',
        enabled: false,
        channelName: 'creator'
      })
    ).toBe(true)

    expect(
      isRestorablePlatformConnection({
        platform: 'kick',
        enabled: false,
        channelName: ''
      })
    ).toBe(false)
  })

  it('restores YouTube from a channel input or refresh token, even if disabled', () => {
    expect(
      isRestorablePlatformConnection({
        platform: 'youtube',
        enabled: false,
        channelId: '@somechannel'
      })
    ).toBe(true)

    expect(
      isRestorablePlatformConnection({
        platform: 'youtube',
        enabled: false,
        refreshToken: 'refresh-token'
      })
    ).toBe(true)

    expect(
      isRestorablePlatformConnection({
        platform: 'youtube',
        enabled: false
      })
    ).toBe(false)
  })
})
