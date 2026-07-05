import { describe, expect, it } from 'vitest'
import type { TwitchConfig } from '../../main/platforms/types'
import {
  getPlatformCapability,
  getPlatformConfig,
  toPlatformConfigMap
} from './platform-configs'

describe('platform config helpers', () => {
  it('maps legacy config arrays by platform id', () => {
    const configs = toPlatformConfigMap([
      { platform: 'twitch', enabled: false, channel: 'ily2drw', clientId: 'client', clientSecret: '', streamKey: 'key' },
      { platform: 'kick', enabled: true, channelName: 'creator' }
    ])

    expect((configs.twitch as TwitchConfig | undefined)?.streamKey).toBe('key')
    expect(configs.kick?.enabled).toBe(true)
  })

  it('returns keyed config maps unchanged', () => {
    const twitch = {
      platform: 'twitch' as const,
      enabled: false,
      channel: 'ily2drw',
      clientId: 'client',
      clientSecret: '',
      streamKey: 'saved-key'
    }

    expect(getPlatformConfig({ twitch }, 'twitch')).toBe(twitch)
  })

  it('reads chat capabilities from arrays or keyed maps', () => {
    expect(getPlatformCapability([{ platform: 'twitch', canSend: true }], 'twitch')?.canSend).toBe(true)
    expect(getPlatformCapability({ twitch: { platform: 'twitch', canSend: false } }, 'twitch')?.canSend).toBe(false)
  })
})
