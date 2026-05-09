import { describe, expect, it, vi } from 'vitest'
import { TTSEngine } from './tts-engine'
import { DEFAULT_APP_SETTINGS } from '../../shared/app-settings'
import type { ChatEvent, FollowEvent, GiftEvent, UserInfo } from '../platforms/types'

describe('TTSEngine settings', () => {
  it('rejects all enqueue requests when TTS is disabled', () => {
    const engine = new TTSEngine()

    engine.applySettings({
      ...DEFAULT_APP_SETTINGS,
      ttsEnabled: false
    })

    const added = engine.enqueue({
      text: 'hello world',
      username: 'alice',
      platform: 'twitch',
      priority: 'normal',
      eventType: 'chat'
    })

    expect(added).toBe(false)
    expect(engine.getQueue()).toHaveLength(0)
  })

  it('applies max length, duplicate window, and per-user queue limits from settings', () => {
    const engine = new TTSEngine()

    engine.applySettings({
      ...DEFAULT_APP_SETTINGS,
      ttsMaxLength: 5,
      ttsDuplicateWindow: 30,
      ttsPerUserLimit: 1
    })
    engine.pause()

    const firstAdded = engine.enqueue({
      text: '123456789',
      username: 'alice',
      platform: 'twitch',
      priority: 'normal',
      eventType: 'chat'
    })
    const perUserRejected = engine.enqueue({
      text: 'second message',
      username: 'alice',
      platform: 'twitch',
      priority: 'normal',
      eventType: 'chat'
    })
    const duplicateRejected = engine.enqueue({
      text: '123456789',
      username: 'bob',
      platform: 'youtube',
      priority: 'normal',
      eventType: 'chat'
    })

    expect(firstAdded).toBe(true)
    expect(perUserRejected).toBe(false)
    expect(duplicateRejected).toBe(false)
    expect(engine.getQueue()).toEqual([
      expect.objectContaining({
        username: 'alice',
        text: '12345...'
      })
    ])
  })

  it('falls back to the default voice when a referenced profile no longer exists', () => {
    const engine = new TTSEngine()
    const speakListener = vi.fn()

    engine.on('tts:speak', speakListener)

    const added = engine.enqueue({
      text: 'hello world',
      username: 'alice',
      platform: 'twitch',
      priority: 'normal',
      voiceProfileId: 'missing-profile',
      eventType: 'chat'
    })

    expect(added).toBe(true)
    expect(speakListener).toHaveBeenCalledWith(
      expect.objectContaining({
        voice: expect.objectContaining({
          id: 'default'
        })
      })
    )
  })

  it('prefetches the next queued item while current speech is still playing', () => {
    const engine = new TTSEngine()
    const prefetchListener = vi.fn()

    engine.on('tts:prefetch', prefetchListener)

    engine.enqueue({
      text: 'first live message',
      username: 'alice',
      platform: 'tiktok',
      priority: 'normal',
      eventType: 'chat'
    })
    engine.enqueue({
      text: 'second live message',
      username: 'bob',
      platform: 'tiktok',
      priority: 'normal',
      eventType: 'chat'
    })

    expect(prefetchListener).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'second live message'
      })
    )
  })

  it('queues offline test speech without platform connections or per-user throttling', () => {
    const engine = new TTSEngine()

    engine.pause()

    const results = Array.from({ length: 5 }, () =>
      engine.enqueueTestSpeech({
        text: 'This is an offline voice test.',
        voiceProfileId: 'default'
      })
    )

    expect(results).toEqual(Array.from({ length: 5 }, () => ({ ok: true })))
    expect(engine.getQueue()).toHaveLength(5)
    expect(engine.getQueue()[0]).toEqual(
      expect.objectContaining({
        eventType: 'test',
        platform: 'local',
        username: 'TTS Test',
        voiceProfileId: 'default'
      })
    )
  })

  it('uses a custom user voice override before the default event voice', () => {
    const engine = new TTSEngine()
    const speakListener = vi.fn()

    engine.getVoiceProfiles().save({
      id: 'alice-voice',
      name: 'Alice Voice',
      provider: 'system',
      voiceName: 'Alice system voice',
      kokoroVoice: 'af_heart',
      lang: 'en-US',
      pitch: 1,
      rate: 1,
      volume: 1,
      effects: [],
      isDefault: false
    })
    engine.applySettings({
      ...DEFAULT_APP_SETTINGS,
      ttsChatVoiceProfileId: 'default',
      ttsUserVoiceOverrides: [
        {
          id: 'alice',
          platform: 'tiktok',
          username: 'alice',
          mode: 'profile',
          voiceProfileId: 'alice-voice',
          provider: 'system',
          voiceName: '',
          kokoroVoice: 'af_heart',
          elevenlabsVoiceId: '',
          elevenlabsStability: 0.5,
          elevenlabsSimilarity: 0.8,
          elevenlabsStyle: 0,
          lang: 'en-US',
          pitch: 1,
          rate: 1,
          volume: 1,
          enabled: true
        }
      ]
    })
    engine.on('tts:speak', speakListener)

    const added = engine.enqueue({
      text: 'hello world',
      username: '@Alice',
      platform: 'tiktok',
      priority: 'normal',
      voiceProfileId: 'default',
      eventType: 'chat'
    })

    expect(added).toBe(true)
    expect(speakListener).toHaveBeenCalledWith(
      expect.objectContaining({
        voice: expect.objectContaining({
          id: 'alice-voice'
        })
      })
    )
  })

  it('can speak with an inline per-user voice without a saved profile', () => {
    const engine = new TTSEngine()
    const speakListener = vi.fn()

    engine.applySettings({
      ...DEFAULT_APP_SETTINGS,
      ttsChatVoiceProfileId: 'default',
      ttsUserVoiceOverrides: [
        {
          id: 'alice-direct',
          platform: 'all',
          username: 'Alice',
          mode: 'custom',
          voiceProfileId: '',
          provider: 'system',
          voiceName: 'Alice direct voice',
          kokoroVoice: 'af_heart',
          elevenlabsVoiceId: '',
          elevenlabsStability: 0.5,
          elevenlabsSimilarity: 0.8,
          elevenlabsStyle: 0,
          lang: 'en-US',
          pitch: 1.7,
          rate: 1.4,
          volume: 0.55,
          enabled: true
        }
      ]
    })
    engine.on('tts:speak', speakListener)

    const added = engine.enqueue({
      text: 'hello world',
      username: '@alice',
      platform: 'youtube',
      priority: 'normal',
      voiceProfileId: 'default',
      eventType: 'chat'
    })

    expect(added).toBe(true)
    expect(speakListener).toHaveBeenCalledWith(
      expect.objectContaining({
        voice: expect.objectContaining({
          id: 'user-voice:alice-direct',
          voiceName: 'Alice direct voice',
          pitch: 1.7,
          rate: 1.4,
          volume: 0.55 * DEFAULT_APP_SETTINGS.ttsVolume
        })
      })
    )
  })

  it('can speak with an inline per-user ElevenLabs voice', () => {
    const engine = new TTSEngine()
    const speakListener = vi.fn()

    engine.applySettings({
      ...DEFAULT_APP_SETTINGS,
      ttsChatVoiceProfileId: 'default',
      ttsUserVoiceOverrides: [
        {
          id: 'bob-eleven',
          platform: 'tiktok',
          username: 'bob',
          mode: 'custom',
          voiceProfileId: '',
          provider: 'elevenlabs',
          voiceName: '',
          kokoroVoice: 'af_heart',
          elevenlabsVoiceId: 'JBFqnCBsd6RMkjVDRZzb',
          elevenlabsStability: 0.35,
          elevenlabsSimilarity: 0.9,
          elevenlabsStyle: 0.15,
          lang: 'en-US',
          pitch: 1,
          rate: 1,
          volume: 0.8,
          enabled: true
        }
      ]
    })
    engine.on('tts:speak', speakListener)

    const added = engine.enqueue({
      text: 'hello world',
      username: '@bob',
      platform: 'tiktok',
      priority: 'normal',
      voiceProfileId: 'default',
      eventType: 'chat'
    })

    expect(added).toBe(true)
    expect(speakListener).toHaveBeenCalledWith(
      expect.objectContaining({
        voice: expect.objectContaining({
          provider: 'elevenlabs',
          elevenlabsVoiceId: 'JBFqnCBsd6RMkjVDRZzb',
          elevenlabsStability: 0.35,
          elevenlabsSimilarity: 0.9,
          elevenlabsStyle: 0.15,
          volume: 0.8 * DEFAULT_APP_SETTINGS.ttsVolume
        })
      })
    )
  })

  it('requires a configured command prefix and strips it before speaking chat', () => {
    const engine = new TTSEngine()

    engine.applySettings({
      ...DEFAULT_APP_SETTINGS,
      ttsRequireCommand: true,
      ttsCommandPrefixes: ['!']
    })
    engine.pause()

    engine.processEvent(makeChatEvent({ message: 'hello without command' }))
    expect(engine.getQueue()).toHaveLength(0)

    engine.processEvent(makeChatEvent({ message: '!read this one' }))
    expect(engine.getQueue()).toEqual([
      expect.objectContaining({
        text: 'Alice says: read this one'
      })
    ])
  })

  it('does not enqueue gift or follow events because those use event sounds', () => {
    const engine = new TTSEngine()
    const speakListener = vi.fn()

    engine.on('tts:speak', speakListener)
    engine.processEvent(makeGiftEvent())
    engine.processEvent(makeFollowEvent())

    expect(engine.getQueue()).toHaveLength(0)
    expect(speakListener).not.toHaveBeenCalled()
  })

  it('allows chat TTS only for configured audience roles', () => {
    const engine = new TTSEngine()

    engine.applySettings({
      ...DEFAULT_APP_SETTINGS,
      ttsAllowedRoles: ['followers', 'subscribers'],
      ttsRequireCommand: false
    })
    engine.pause()

    engine.processEvent(makeChatEvent({ message: 'not allowed' }))
    engine.processEvent(
      makeChatEvent({
        message: 'follower allowed',
        user: {
          ...makeUser(),
          username: 'follower',
          displayName: 'Follower',
          isFollower: true
        }
      })
    )
    engine.processEvent(
      makeChatEvent({
        message: 'subscriber allowed',
        user: {
          ...makeUser(),
          username: 'subscriber',
          displayName: 'Subscriber',
          isSubscriber: true
        }
      })
    )

    expect(engine.getQueue()).toEqual([
      expect.objectContaining({ text: 'Follower says: follower allowed' }),
      expect.objectContaining({ text: 'Subscriber says: subscriber allowed' })
    ])
  })
})

function makeUser(patch: Partial<UserInfo> = {}): UserInfo {
  return {
    id: 'alice',
    username: 'alice',
    displayName: 'Alice',
    isModerator: false,
    isSubscriber: false,
    isVip: false,
    badges: [],
    ...patch
  }
}

function makeGiftEvent(): GiftEvent {
  return {
    id: 'gift-1',
    platform: 'tiktok',
    timestamp: new Date(),
    type: 'gift',
    raw: {},
    user: makeUser(),
    giftName: 'Rose',
    giftId: 'rose',
    giftCount: 1,
    monetaryValue: 1,
    isCombo: false
  }
}

function makeFollowEvent(): FollowEvent {
  return {
    id: 'follow-1',
    platform: 'tiktok',
    timestamp: new Date(),
    type: 'follow',
    raw: {},
    user: makeUser()
  }
}

function makeChatEvent({
  message,
  user = makeUser()
}: {
  message: string
  user?: UserInfo
}): ChatEvent {
  return {
    id: `chat-${message}`,
    platform: 'tiktok',
    timestamp: new Date(),
    type: 'chat',
    raw: {},
    user,
    message,
    emotes: []
  }
}
