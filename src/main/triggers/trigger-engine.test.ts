import { describe, expect, it, vi } from 'vitest'
import type { ChatEvent } from '../platforms/types'
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
})

function createEngine() {
  const enqueue = vi.fn().mockReturnValue(true)
  const prepareChatSpeechMessage = vi.fn((event: ChatEvent) => event.message)
  const engine = new TriggerEngine({
    enqueue,
    prepareChatSpeechMessage
  } as unknown as TTSEngine)

  return { engine, enqueue, prepareChatSpeechMessage }
}
