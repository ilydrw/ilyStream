import { describe, expect, it, vi } from 'vitest'
import {
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
})
