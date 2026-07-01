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

  it('emits a run receipt with condition and action results', async () => {
    const { engine } = createEngine()
    const receiptPromise = onceReceipt(engine)

    engine.updateRule(createRule('chat-rule', 0))
    engine.evaluate(createChatEvent('receipt check'))

    const receipt = await receiptPromise
    expect(receipt).toEqual(
      expect.objectContaining({
        eventId: 'event-1',
        eventType: 'chat',
        platform: 'twitch',
        ruleCount: 1,
        matchedRules: 1,
        actionsAttempted: 1,
        actionsRan: 1,
        actionsFailed: 0
      })
    )
    expect(receipt.rules[0]).toEqual(
      expect.objectContaining({
        ruleId: 'chat-rule',
        matched: true,
        blockedByCooldown: false
      })
    )
    expect(receipt.rules[0].conditions[0]).toEqual(expect.objectContaining({ passed: true }))
    expect(receipt.rules[0].actions[0]).toEqual(expect.objectContaining({ status: 'ran', type: 'tts' }))
    expect(receipt.testPayload).toEqual(expect.objectContaining({ type: 'chat', message: 'receipt check' }))
  })

  it('fills templates for host chat send actions', async () => {
    const { engine } = createEngine()
    const sendChat = vi.fn()
    engine.on('action:send-chat', sendChat)
    engine.updateRule({
      ...createRule('send-chat-rule', 0),
      actions: [{
        type: 'send_chat',
        template: 'Thanks {username}: {message}',
        platform: 'source'
      }]
    })

    const receiptPromise = onceReceipt(engine)
    engine.evaluate(createChatEvent('song request queued'))
    const receipt = await receiptPromise

    expect(sendChat).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Thanks Example User: song request queued',
        platform: 'twitch'
      }),
      expect.objectContaining({ id: 'event-1' })
    )
    expect(receipt.rules[0].actions[0]).toEqual(expect.objectContaining({ status: 'ran', type: 'send_chat' }))
  })

  it('strips legacy html from host chat send actions', async () => {
    const { engine } = createEngine()
    const sendChat = vi.fn()
    engine.on('action:send-chat', sendChat)
    engine.updateRule({
      ...createRule('send-chat-html-rule', 0),
      actions: [{
        type: 'send_chat',
        template: '<div>SUPER FAN DETECTED</div><div>Welcome back, <strong>{username}</strong>!</div>',
        platform: 'source'
      }]
    })

    const receiptPromise = onceReceipt(engine)
    engine.evaluate(createChatEvent('hello'))
    await receiptPromise

    expect(sendChat).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'SUPER FAN DETECTED Welcome back, Example User!',
        platform: 'twitch'
      }),
      expect.objectContaining({ id: 'event-1' })
    )
  })

  it('does not treat VIP or owner status as super fan status', async () => {
    const { engine } = createEngine()
    const showAlert = vi.fn()
    engine.on('action:show-alert', showAlert)
    engine.updateRule({
      ...createRule('strict-superfan-rule', 0),
      conditions: [{ type: 'user_status', status: 'is_super_fan' }],
      actions: [{
        type: 'show_alert',
        template: 'SUPERFAN {username}',
        durationMs: 5000,
        animationIn: 'fade',
        animationOut: 'fade'
      }]
    })

    const event = createChatEvent('owner chat')
    event.user.isVip = true
    const receiptPromise = onceReceipt(engine)
    engine.evaluate(event)
    const receipt = await receiptPromise

    expect(showAlert).not.toHaveBeenCalled()
    expect(receipt.matchedRules).toBe(0)
  })

  it('matches super fan status from an explicit super fan flag', async () => {
    const { engine } = createEngine()
    const showAlert = vi.fn()
    engine.on('action:show-alert', showAlert)
    engine.updateRule({
      ...createRule('explicit-superfan-rule', 0),
      conditions: [{ type: 'user_status', status: 'is_super_fan' }],
      actions: [{
        type: 'show_alert',
        template: 'SUPERFAN {username}',
        durationMs: 5000,
        animationIn: 'fade',
        animationOut: 'fade'
      }]
    })

    const event = createChatEvent('super fan chat')
    event.user.isSuperFan = true
    const receiptPromise = onceReceipt(engine)
    engine.evaluate(event)
    const receipt = await receiptPromise

    expect(showAlert).toHaveBeenCalledOnce()
    expect(receipt.matchedRules).toBe(1)
  })

  it('explains why a rule did not match', async () => {
    const { engine } = createEngine()
    const receiptPromise = onceReceipt(engine)
    const rule = createRule('keyword-rule', 0)

    engine.updateRule({
      ...rule,
      conditions: [
        { type: 'event_type', value: 'chat' },
        { type: 'keyword', value: '!play', matchMode: 'starts_with', caseSensitive: false }
      ]
    })
    engine.evaluate(createChatEvent('hello there'))

    const receipt = await receiptPromise
    expect(receipt.matchedRules).toBe(0)
    expect(receipt.rules[0].matched).toBe(false)
    expect(receipt.rules[0].conditions.map((condition) => condition.passed)).toEqual([true, false])
    expect(receipt.rules[0].skipReason).toContain('!play')
  })

  it('records cooldown-blocked rules', async () => {
    const { engine } = createEngine()

    engine.updateRule({
      ...createRule('cooldown-rule', 0),
      cooldown: 30
    })

    const firstReceiptPromise = onceReceipt(engine)
    engine.evaluate(createChatEvent('first'))
    await firstReceiptPromise

    const receiptPromise = onceReceipt(engine)
    engine.evaluate(createChatEvent('second'))
    const receipt = await receiptPromise

    expect(receipt.matchedRules).toBe(0)
    expect(receipt.blockedRules).toBe(1)
    expect(receipt.rules[0]).toEqual(
      expect.objectContaining({
        blockedByCooldown: true,
        matched: false
      })
    )
    expect(receipt.rules[0].skipReason).toContain('cooldown')
  })

  it('fails webhook actions that hang instead of leaving a trigger run open', async () => {
    vi.useFakeTimers()
    const originalFetch = globalThis.fetch
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { engine } = createEngine()

    globalThis.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        })
      })
    }) as typeof fetch

    try {
      engine.updateRule({
        ...createRule('webhook-rule', 0),
        actions: [{
          type: 'http_webhook',
          url: 'https://example.com/hook',
          method: 'POST',
          headers: {},
          body: '{"message":"{message}"}'
        }]
      })

      const receiptPromise = onceReceipt(engine)
      engine.evaluate(createChatEvent('slow webhook'))
      await vi.advanceTimersByTimeAsync(10_000)
      const receipt = await receiptPromise

      expect(receipt.actionsFailed).toBe(1)
      expect(receipt.rules[0].actions[0]).toEqual(expect.objectContaining({
        status: 'failed',
        error: 'Webhook timed out after 10s.'
      }))
    } finally {
      errorSpy.mockRestore()
      globalThis.fetch = originalFetch
      vi.useRealTimers()
    }
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

function onceReceipt(engine: TriggerEngine): Promise<any> {
  return new Promise((resolve) => {
    engine.once('receipt', resolve)
  })
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
