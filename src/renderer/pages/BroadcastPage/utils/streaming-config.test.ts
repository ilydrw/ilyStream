import { describe, expect, it } from 'vitest'
import { buildStreamPlatforms, normalizeTikTokStreamUrl } from './streaming-config'

describe('TikTok streaming destinations', () => {
  it('uses the creator-specific RTMP server URL when a manual key is configured', () => {
    expect(buildStreamPlatforms({
      tiktok: {
        streamUrl: 'rtmps://push.example.test/live/',
        streamKey: 'manual-key',
        nativeAuthConnected: true,
        nativeLiveAccess: 'approved'
      }
    })).toContainEqual({
      id: 'tiktok',
      name: 'TikTok',
      url: 'rtmps://push.example.test/live',
      key: 'manual-key'
    })
  })

  it('uses native go-live provisioning only when approved and no manual key wins', () => {
    expect(buildStreamPlatforms({
      tiktok: { nativeAuthConnected: true, nativeLiveAccess: 'approved' }
    })).toContainEqual({
      id: 'tiktok',
      name: 'TikTok',
      url: '',
      key: '',
      keyProvider: 'tiktok-native'
    })
    expect(buildStreamPlatforms({
      tiktok: { nativeAuthConnected: true, nativeLiveAccess: 'pending' }
    }).some((destination) => destination.id === 'tiktok')).toBe(false)
  })

  it('keeps the historical TikTok ingest as the manual fallback default', () => {
    expect(normalizeTikTokStreamUrl('')).toBe('rtmp://open-rtmp.tiktok.com/stage')
  })
})
