import { describe, expect, it } from 'vitest'
import { APP_THEME_DEFINITIONS, resolveAppSetting, resolveAppSettings } from './app-settings'

describe('resolveAppSettings built-in themes', () => {
  it('preserves every registered theme id through settings normalization', () => {
    for (const theme of APP_THEME_DEFINITIONS) {
      const settings = resolveAppSettings({ theme: theme.id })
      expect(settings.theme).toBe(theme.id)
      expect(settings.ui.theme).toBe(theme.id)
    }
  })
})

describe('resolveAppSettings TTS command and audience gates', () => {
  it('maps flat chat relay toggles into nested Chat Hub settings', () => {
    const settings = resolveAppSettings({
      chatAutoRelayEnabled: true,
      chatRelayTagMode: 'message-only',
      chatAutoRelayPlatforms: {
        tiktok: true,
        twitch: false,
        youtube: true,
        kick: false
      }
    })

    expect(settings.chat.autoRelayEnabled).toBe(true)
    expect(settings.chatAutoRelayEnabled).toBe(true)
    expect(settings.chat.relayTagMode).toBe('message-only')
    expect(settings.chatRelayTagMode).toBe('message-only')
    expect(settings.chat.autoRelayPlatforms).toEqual({
      tiktok: true,
      twitch: false,
      youtube: true,
      kick: false
    })
    expect(settings.chatAutoRelayPlatforms).toEqual(settings.chat.autoRelayPlatforms)
  })

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

  it('normalizes the chat TTS message template and exposes the flat alias', () => {
    const settings = resolveAppSettings({
      ttsChatMessageTemplate: '  {username}   says   {message}  '
    })
    const fallback = resolveAppSettings({
      ttsChatMessageTemplate: ''
    })

    expect(settings.tts.chatMessageTemplate).toBe('{username} says {message}')
    expect(settings.ttsChatMessageTemplate).toBe('{username} says {message}')
    expect(fallback.tts.chatMessageTemplate).toBe('{displayName} says: {message}')
  })

  it('exposes persisted TTS menu settings through flat and nested aliases', () => {
    const settings = resolveAppSettings({
      ttsRequireCommand: true,
      ttsCommandPrefixes: '/',
      ttsAllowedRoles: ['moderators'],
      ttsIgnoreEmotes: false,
      ttsVolume: 0.42,
      ttsReadAtSymbol: true,
      ttsSkipMessagesStartingWithAt: true,
      ttsChatVoiceProfileId: 'chat-profile',
      ttsSubscriptionVoiceProfileId: 'sub-profile',
      elevenlabsApiKey: 'eleven-key',
      elevenlabsApiKeys: [
        { id: 'friend-workspace', label: 'Friend Workspace', apiKey: 'friend-key' }
      ],
      elevenlabsDefaultApiKeyId: 'friend-workspace',
      audioOutputDeviceId: 'output-123',
      voiceModifiers: {
        radioFilter: true,
        speedRamping: false,
        pitchShifting: 'high'
      }
    })

    expect(settings.tts.requireCommand).toBe(true)
    expect(settings.ttsRequireCommand).toBe(true)
    expect(settings.tts.commandPrefixes).toEqual(['/'])
    expect(settings.ttsCommandPrefixes).toEqual(['/'])
    expect(settings.tts.allowedRoles).toEqual(['moderators'])
    expect(settings.ttsAllowedRoles).toEqual(['moderators'])
    expect(settings.tts.ignoreEmotes).toBe(false)
    expect(settings.ttsIgnoreEmotes).toBe(false)
    expect(settings.tts.volume).toBe(0.42)
    expect(settings.ttsVolume).toBe(0.42)
    expect(settings.tts.readAtSymbol).toBe(true)
    expect(settings.ttsReadAtSymbol).toBe(true)
    expect(settings.tts.skipMessagesStartingWithAt).toBe(true)
    expect(settings.ttsSkipMessagesStartingWithAt).toBe(true)
    expect(settings.tts.chatVoiceProfileId).toBe('chat-profile')
    expect(settings.ttsChatVoiceProfileId).toBe('chat-profile')
    expect(settings.tts.subscriptionVoiceProfileId).toBe('sub-profile')
    expect(settings.ttsSubscriptionVoiceProfileId).toBe('sub-profile')
    expect(settings.elevenlabsApiKey).toBe('eleven-key')
    expect(settings.elevenlabsApiKeys).toEqual([
      { id: 'friend-workspace', label: 'Friend Workspace', apiKey: 'friend-key' }
    ])
    expect(settings.elevenlabsDefaultApiKeyId).toBe('friend-workspace')
    expect(settings.audio.outputDeviceId).toBe('output-123')
    expect(settings.audioOutputDeviceId).toBe('output-123')
    expect(settings.tts.modifiers).toEqual({
      radioFilter: true,
      speedRamping: false,
      pitchShifting: 'high'
    })
    expect(settings.voiceModifiers).toEqual(settings.tts.modifiers)
  })

  it('normalizes partial or invalid voice modifier settings', () => {
    const settings = resolveAppSettings({
      voiceModifiers: {
        radioFilter: true,
        pitchShifting: 'helium'
      }
    })

    expect(settings.voiceModifiers).toEqual({
      radioFilter: true,
      speedRamping: true,
      pitchShifting: 'normal'
    })
    expect(settings.tts.modifiers).toEqual(settings.voiceModifiers)
  })
})

describe('resolveAppSetting write guard', () => {
  it('rejects unsupported and prototype-pollution setting keys', () => {
    expect(() => resolveAppSetting('__proto__', { polluted: true })).toThrow('Unsupported setting key')
    expect(() => resolveAppSetting('randomRendererPayload', true)).toThrow('Unsupported setting key')
  })

  it('coerces primitive settings and rejects oversized payloads', () => {
    expect(resolveAppSetting('spotifyVotesRequired', 0)).toBe(1)
    expect(resolveAppSetting('overlayPort', 99999)).toBe(65535)
    expect(resolveAppSetting('spotifySkipEnabled', 'false')).toBe(false)
    expect(resolveAppSetting('elevenlabsApiKey', '  el-key  ')).toBe('  el-key  ')
    expect(() => resolveAppSetting('aiSystemPrompt', 'x'.repeat(300_000))).toThrow('too large')
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
      eventSoundGiftSoundId: 'alerts/gift-drop.mp3',
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
        eventSoundGiftSoundId: 'alerts/gift-drop.mp3',
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
      eventSoundSuperfanSoundId: '../superfan.wav'
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

  it('normalizes the optional TikTok like milestone alert', () => {
    const settings = resolveAppSettings({
      eventLikeMilestoneEnabled: 'true',
      eventLikeMilestoneRepeatEnabled: 'false',
      eventLikeMilestoneTemplate: '  {displayName} reached {milestoneLikes}!  ',
      eventLikeMilestoneFallbackSoundId: 'alerts/thank-you.mp3',
      eventLikeMilestoneFallbackVolume: 2,
      eventLikeMilestoneDurationMs: 99_000
    })

    expect(settings.alerts.likeMilestone).toEqual({
      enabled: true,
      repeatEveryMilestone: false,
      template: '{displayName} reached {milestoneLikes}!',
      fallbackSoundId: 'alerts/thank-you.mp3',
      fallbackSoundVolume: 1,
      durationMs: 30_000
    })
    expect(settings).toEqual(expect.objectContaining({
      eventLikeMilestoneEnabled: true,
      eventLikeMilestoneRepeatEnabled: false,
      eventLikeMilestoneTemplate: '{displayName} reached {milestoneLikes}!',
      eventLikeMilestoneFallbackSoundId: 'alerts/thank-you.mp3',
      eventLikeMilestoneFallbackVolume: 1,
      eventLikeMilestoneDurationMs: 30_000
    }))
  })
})

describe('resolveAppSettings custom themes', () => {
  it('normalizes saved custom themes, schemes, overrides, and clears dangling active ids', () => {
    const settings = resolveAppSettings({
      customThemes: [
        {
          id: 'sunset',
          name: '  Sunset  ',
          background: '#101010',
          secondary: '#FF00AA',
          accent: '#00FFEE',
          colorScheme: 'light',
          overrides: { surface: '#ABCDEF', border: 'nope', bogusToken: '#ffffff' }
        },
        { name: 'Unnamed', background: 'not-a-color', colorScheme: 'sideways' }
      ],
      activeCustomThemeId: 'does-not-exist'
    })

    expect(settings.ui.customThemes).toEqual([
      {
        id: 'sunset',
        name: 'Sunset',
        background: '#101010',
        secondary: '#ff00aa',
        accent: '#00ffee',
        colorScheme: 'light',
        // Invalid hex and unknown tokens are dropped; valid ones are lowercased.
        overrides: { surface: '#abcdef' }
      },
      {
        id: 'custom-theme-2',
        name: 'Unnamed',
        background: '#0b0d12',
        secondary: '#d035f1',
        accent: '#19c8ff',
        colorScheme: 'auto',
        overrides: {}
      }
    ])
    expect(settings.customThemes).toEqual(settings.ui.customThemes)
    // Active id must reference a saved theme, otherwise it is cleared.
    expect(settings.ui.activeCustomThemeId).toBe('')
  })

  it('normalizes the live custom scheme and per-token overrides', () => {
    const settings = resolveAppSettings({
      customColorScheme: 'light',
      customPalette: { text: '#123456', canvas: 'not-a-color', unknown: '#000000' }
    })

    expect(settings.ui.customColorScheme).toBe('light')
    expect(settings.customColorScheme).toBe('light')
    expect(settings.ui.customPalette).toEqual({ text: '#123456' })
    expect(settings.customPalette).toEqual(settings.ui.customPalette)
  })

  it('keeps a valid active custom theme id through flat and nested aliases', () => {
    const settings = resolveAppSettings({
      customThemes: [{ id: 'sunset', name: 'Sunset', background: '#101010', secondary: '#ff00aa', accent: '#00ffee' }],
      activeCustomThemeId: 'sunset'
    })

    expect(settings.ui.activeCustomThemeId).toBe('sunset')
    expect(settings.activeCustomThemeId).toBe('sunset')
  })

  it('defaults to an empty custom theme library and derived palette', () => {
    const defaults = resolveAppSettings()
    expect(defaults.ui.customThemes).toEqual([])
    expect(defaults.ui.activeCustomThemeId).toBe('')
    expect(defaults.ui.customColorScheme).toBe('auto')
    expect(defaults.ui.customPalette).toEqual({})
  })
})

describe('resolveAppSettings Spotify aliases', () => {
  it('returns flat Spotify keys from defaults and nested settings', () => {
    const defaults = resolveAppSettings()
    const settings = resolveAppSettings({
      spotify: {
        clientId: 'client-123',
        songRequestsEnabled: false,
        playEnabled: false,
        skipEnabled: true,
        allowExplicit: false,
        maxQueueLength: 10,
        maxPerUser: 2
      }
    })

    expect(defaults.spotifySongRequestsEnabled).toBe(true)
    expect(defaults.spotifyPlayEnabled).toBe(true)
    expect(settings.spotifyClientId).toBe('client-123')
    expect(settings.spotifySongRequestsEnabled).toBe(false)
    expect(settings.spotifyPlayEnabled).toBe(false)
    expect(settings.spotifySkipEnabled).toBe(true)
    expect(settings.spotifyAllowExplicit).toBe(false)
    expect(settings.spotifyMaxQueueLength).toBe(10)
    expect(settings.spotifyMaxPerUser).toBe(2)
  })
})

describe('resolveAppSettings chat aliases', () => {
  it('defaults Chat Hub retention to 150 messages', () => {
    const defaults = resolveAppSettings()
    const oversized = resolveAppSettings({ chatMaxMessages: 2000 })

    expect(defaults.chat.maxMessages).toBe(150)
    expect(defaults.chatMaxMessages).toBe(150)
    expect(oversized.chat.maxMessages).toBe(150)
    expect(oversized.chatMaxMessages).toBe(150)
    expect(resolveAppSetting('chatMaxMessages', 2000)).toBe(150)
  })

  it('returns the host chat response toggle from flat and nested settings', () => {
    const defaults = resolveAppSettings()
    const flat = resolveAppSettings({ chatHostResponsesEnabled: false })
    const nested = resolveAppSettings({ chat: { hostResponsesEnabled: false } })

    expect(defaults.chat.hostResponsesEnabled).toBe(true)
    expect(defaults.chatHostResponsesEnabled).toBe(true)
    expect(flat.chat.hostResponsesEnabled).toBe(false)
    expect(flat.chatHostResponsesEnabled).toBe(false)
    expect(nested.chat.hostResponsesEnabled).toBe(false)
    expect(nested.chatHostResponsesEnabled).toBe(false)
  })
})

describe('resolveAppSettings Streamer.bot aliases', () => {
  it('returns bridge settings from flat and nested settings', () => {
    const defaults = resolveAppSettings()
    const flat = resolveAppSettings({
      streamerbotEnabled: true,
      streamerbotWsUrl: 'ws://localhost:9090'
    })
    const nested = resolveAppSettings({
      integrations: {
        streamerbot: {
          enabled: true,
          wsUrl: 'ws://192.168.0.2:8080'
        }
      }
    })

    expect(defaults.integrations.streamerbot.enabled).toBe(false)
    expect(defaults.streamerbotWsUrl).toBe('ws://127.0.0.1:8080')
    expect(flat.integrations.streamerbot.enabled).toBe(true)
    expect(flat.streamerbotWsUrl).toBe('ws://localhost:9090')
    expect(nested.streamerbotEnabled).toBe(true)
    expect(nested.integrations.streamerbot.wsUrl).toBe('ws://192.168.0.2:8080')
  })
})

describe('resolveAppSettings streaming aliases', () => {
  it('returns broadcast defaults from flat and nested settings', () => {
    const defaults = resolveAppSettings()
    const flat = resolveAppSettings({
      streamingRtmpUrl: 'rtmp://example.test/app',
      streamingStreamKey: 'stream-key',
      streamingBitrate: 4300,
      streamingFps: 30
    })
    const nested = resolveAppSettings({
      streaming: {
        enabled: true,
        rtmpUrl: 'rtmp://nested.test/app',
        streamKey: 'nested-key',
        bitrate: 5200,
        fps: 60,
        width: 1920,
        height: 1080
      }
    })

    expect(defaults.streaming.bitrate).toBe(6000)
    expect(defaults.streaming.fps).toBe(30)
    expect(flat.streaming.rtmpUrl).toBe('rtmp://example.test/app')
    expect(flat.streaming.streamKey).toBe('stream-key')
    expect(flat.streaming.bitrate).toBe(4300)
    expect(flat.streaming.fps).toBe(30)
    expect(flat.streamingBitrate).toBe(4300)
    expect(flat.streamingFps).toBe(30)
    expect(nested.streamingRtmpUrl).toBe('rtmp://nested.test/app')
    expect(nested.streamingStreamKey).toBe('nested-key')
    expect(nested.streamingBitrate).toBe(5200)
    expect(nested.streamingFps).toBe(60)
  })
})
