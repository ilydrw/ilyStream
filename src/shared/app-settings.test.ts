import { describe, expect, it } from 'vitest'
import { resolveAppSettings } from './app-settings'

describe('resolveAppSettings TTS command and audience gates', () => {
  it('normalizes command prefixes from compact or comma-separated input', () => {
    expect(resolveAppSettings({ ttsCommandPrefixes: '!/.' }).ttsCommandPrefixes).toEqual([
      '!',
      '/',
      '.'
    ])
    expect(resolveAppSettings({ ttsCommandPrefixes: '!, /, .' }).ttsCommandPrefixes).toEqual([
      '!',
      '/',
      '.'
    ])
  })

  it('normalizes allowed roles and treats all users as the broad override', () => {
    const settings = resolveAppSettings({
      ttsAllowedRoles: ['followers', 'subscribers', 'followers']
    })
    const everyoneSettings = resolveAppSettings({
      ttsAllowedRoles: ['followers', 'everyone', 'subscribers']
    })

    expect(settings.ttsAllowedRoles).toEqual(['followers', 'subscribers'])
    expect(everyoneSettings.ttsAllowedRoles).toEqual(['everyone'])
  })
})

describe('resolveAppSettings TTS user voice overrides', () => {
  it('keeps legacy profile-based overrides compatible', () => {
    const settings = resolveAppSettings({
      ttsUserVoiceOverrides: [
        {
          id: 'alice',
          platform: 'tiktok',
          username: '@Alice',
          voiceProfileId: 'alice-profile',
          enabled: true
        }
      ]
    })

    expect(settings.ttsUserVoiceOverrides).toEqual([
      expect.objectContaining({
        id: 'alice',
        platform: 'tiktok',
        username: 'alice',
        mode: 'profile',
        voiceProfileId: 'alice-profile',
        enabled: true
      })
    ])
  })

  it('normalizes custom direct voices and clamps unsafe numeric values', () => {
    const settings = resolveAppSettings({
      ttsUserVoiceOverrides: [
        {
          id: 'alice-custom',
          platform: 'all',
          username: 'Alice',
          mode: 'custom',
          provider: 'system',
          voiceName: 'Microsoft Alice',
          lang: 'en-US',
          pitch: 12,
          rate: -4,
          volume: 4,
          enabled: true
        }
      ]
    })

    expect(settings.ttsUserVoiceOverrides).toEqual([
      expect.objectContaining({
        id: 'alice-custom',
        platform: 'all',
        username: 'alice',
        mode: 'custom',
        voiceProfileId: '',
        provider: 'system',
        voiceName: 'Microsoft Alice',
        lang: 'en-US',
        pitch: 2,
        rate: 0.1,
        volume: 1,
        enabled: true
      })
    ])
  })

  it('preserves ElevenLabs direct user voice assignments', () => {
    const settings = resolveAppSettings({
      ttsUserVoiceOverrides: [
        {
          id: 'bob-eleven',
          platform: 'tiktok',
          username: 'Bob',
          mode: 'custom',
          provider: 'elevenlabs',
          elevenlabsVoiceId: 'JBFqnCBsd6RMkjVDRZzb',
          elevenlabsStability: 0.35,
          elevenlabsSimilarity: 0.9,
          elevenlabsStyle: 0.15,
          enabled: true
        }
      ]
    })

    expect(settings.ttsUserVoiceOverrides[0]).toEqual(
      expect.objectContaining({
        username: 'bob',
        provider: 'elevenlabs',
        elevenlabsVoiceId: 'JBFqnCBsd6RMkjVDRZzb',
        elevenlabsStability: 0.35,
        elevenlabsSimilarity: 0.9,
        elevenlabsStyle: 0.15
      })
    )
  })
})

describe('resolveAppSettings event sounds', () => {
  it('normalizes gift and follower event sound settings', () => {
    const settings = resolveAppSettings({
      eventSoundGiftEnabled: true,
      eventSoundGiftSoundId: 'gift-drop.mp3',
      eventSoundGiftVolume: 2,
      eventSoundFollowEnabled: true,
      eventSoundFollowSoundId: 'new-follower.wav',
      eventSoundFollowVolume: -1,
      eventSoundSuperfanEnabled: true,
      eventSoundSuperfanSoundId: 'superfan.wav',
      eventSoundSuperfanVolume: 0.5
    })

    expect(settings).toEqual(
      expect.objectContaining({
        eventSoundGiftEnabled: true,
        eventSoundGiftSoundId: 'gift-drop.mp3',
        eventSoundGiftVolume: 1,
        eventSoundFollowEnabled: true,
        eventSoundFollowSoundId: 'new-follower.wav',
        eventSoundFollowVolume: 0,
        eventSoundSuperfanEnabled: true,
        eventSoundSuperfanSoundId: 'superfan.wav',
        eventSoundSuperfanVolume: 0.5
      })
    )
  })

  it('rejects non-audio or path-like event sound ids', () => {
    const settings = resolveAppSettings({
      eventSoundGiftSoundId: 'C:\\sounds\\gift.mp3',
      eventSoundFollowSoundId: 'follow.ogg',
      eventSoundSuperfanSoundId: '..\\superfan.wav'
    })

    expect(settings.eventSoundGiftSoundId).toBe('')
    expect(settings.eventSoundFollowSoundId).toBe('')
    expect(settings.eventSoundSuperfanSoundId).toBe('')
  })

  it('normalizes alert text box styling', () => {
    const settings = resolveAppSettings({
      eventTextSuperfanColor: '#ABCDEF',
      eventTextSuperfanBackgroundColor: 'not-a-color',
      eventTextSuperfanBorderColor: '#ff00aa',
      eventTextSuperfanFontSize: 200
    })

    expect(settings.eventTextSuperfanColor).toBe('#abcdef')
    expect(settings.eventTextSuperfanBackgroundColor).toBe('rgba(0, 0, 0, 0.05)')
    expect(settings.eventTextSuperfanBorderColor).toBe('#ff00aa')
    expect(settings.eventTextSuperfanFontSize).toBe(120)
  })
})
