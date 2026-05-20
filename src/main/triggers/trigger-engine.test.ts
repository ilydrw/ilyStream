import { describe, expect, it, vi } from 'vitest'
import type { ChatEvent, GiftEvent } from '../platforms/types'
import type { TTSEngine } from '../tts/tts-engine'
import type { TriggerRule } from './trigger-types'
import { TriggerEngine } from './trigger-engine'

function createRule(id: string, sortOrder: number): TriggerRule {
  return {
    id,
    name: `Rule ${id}`,
    enabled: true,
    platforms: ['twitch'],
    conditions: [{ type: 'event_type', value: 'chat' }],
    actions: [{ type: 'tts', template: 'Hi {username}: {message}' }],
    cooldown: 0,
    userCooldown: 0,
    sortOrder
  }
}

function createChatEvent(message = 'hello world'): ChatEvent {
  return {
    id: 'event-1',
    platform: 'twitch',
    timestamp: new Date('2026-04-04T12:00:00.000Z'),
    type: 'chat',
    raw: {},
    user: {
      id: 'user-1',
      username: 'example_user',
      displayName: 'Example User',
      isModerator: false,
      isSubscriber: true,
      isVip: false,
      badges: []
    },
    message,
    emotes: []
  }
}

describe('TriggerEngine', () => {
  it('adds a new rule when updateRule receives an unknown id', () => {
    const { engine } = createEngine()

    engine.updateRule(createRule('b', 2))
    engine.updateRule(createRule('a', 1))

    expect(engine.getRules().map((rule) => rule.id)).toEqual(['a', 'b'])
  })

  it('evaluates newly saved rules immediately', () => {
    const { engine, enqueue } = createEngine()

    engine.updateRule(createRule('chat-rule', 0))
    engine.evaluate(createChatEvent('welcome in'))

    expect(enqueue).toHaveBeenCalledOnce()
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Hi Example User: welcome in',
        username: 'example_user',
        platform: 'twitch',
        priority: 'high',
        eventType: 'chat'
      })
    )
  })

  it('ignores invalid regex conditions instead of throwing during live evaluation', () => {
    const { engine, enqueue } = createEngine()
    const rule = createRule('bad-regex', 0)

    engine.updateRule({
      ...rule,
      conditions: [{ type: 'keyword', value: '[', matchMode: 'regex', caseSensitive: false }]
    })

    expect(() => engine.evaluate(createChatEvent('this should not crash'))).not.toThrow()
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('rejects nested quantified regex conditions before evaluating chat text', () => {
    const { engine, enqueue } = createEngine()
    const rule = createRule('redos-regex', 0)

    engine.updateRule({
      ...rule,
      conditions: [{ type: 'keyword', value: '(a+)+$', matchMode: 'regex', caseSensitive: false }]
    })

    engine.evaluate(createChatEvent('aaaaaaaaaaaaaaaaaaaaaaaa!'))
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('does not let chat TTS trigger actions bypass command and role gates', () => {
    const { engine, enqueue, prepareChatSpeechMessage } = createEngine()

    prepareChatSpeechMessage.mockReturnValueOnce(null)
    engine.updateRule(createRule('chat-rule', 0))
    engine.evaluate(createChatEvent('ordinary chat'))

    expect(enqueue).not.toHaveBeenCalled()
  })

  it('uses the stripped command message in trigger TTS templates', () => {
    const { engine, enqueue, prepareChatSpeechMessage } = createEngine()

    prepareChatSpeechMessage.mockReturnValueOnce('read this')
    engine.updateRule(createRule('chat-rule', 0))
    engine.evaluate(createChatEvent('!read this'))

    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Hi Example User: read this'
      })
    )
  })

  it('ignores in-progress gift combo updates before firing gift trigger actions', () => {
    vi.useFakeTimers()
    const { engine } = createEngine()
    const playSound = vi.fn()
    engine.on('action:play-sound', playSound)

    try {
      engine.updateRule({
        id: 'gg-gift',
        name: 'GG gift',
        enabled: true,
        platforms: ['tiktok'],
        conditions: [{ type: 'event_type', value: 'gift' }],
        actions: [{ type: 'play_sound', filePath: 'gg.mp3', volume: 1 }],
        cooldown: 0,
        userCooldown: 0,
        sortOrder: 0
      })

      engine.evaluate(createGiftEvent(true))
      vi.advanceTimersByTime(2100)
      expect(playSound).not.toHaveBeenCalled()

      engine.evaluate(createGiftEvent(false))
      vi.advanceTimersByTime(2100)
      expect(playSound).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

function createEngine() {
  const enqueue = vi.fn().mockReturnValue(true)
  const prepareChatSpeechMessage = vi.fn((event: ChatEvent) => event.message)
  const engine = new TriggerEngine({
    enqueue,
    prepareChatSpeechMessage
  } as unknown as TTSEngine, {} as any)

  return { engine, enqueue, prepareChatSpeechMessage }
}

function createGiftEvent(isCombo: boolean): GiftEvent {
  return {
    id: `gift-${isCombo ? 'combo' : 'final'}`,
    platform: 'tiktok',
    timestamp: new Date('2026-04-04T12:01:00.000Z'),
    type: 'gift',
    raw: {},
    user: {
      id: 'user-2',
      username: 'gg_friend',
      displayName: 'GG Friend',
      isModerator: false,
      isSubscriber: false,
      isVip: false,
      badges: []
    },
    giftName: 'GG',
    giftId: 'gg',
    giftCount: 1,
    monetaryValue: 1,
    isCombo
  }
}
