import { describe, expect, it, vi } from 'vitest'
import { StreamIntelligenceService } from './stream-intelligence-service'
import type { ChatEvent, GiftEvent } from '../platforms/types'

describe('StreamIntelligenceService', () => {
  it('summarizes recent chat terms and recommendations', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-23T12:00:00.000Z'))
    const service = new StreamIntelligenceService()

    try {
      service.recordEvent(makeChat('viewer_a', 'Clip that moment?'))
      service.recordEvent(makeChat('viewer_b', 'that clip was wild'))
      service.recordEvent(makeGift())

      const insights = service.getInsights()

      expect(insights.chatCount).toBe(2)
      expect(insights.activeViewers).toBe(3)
      expect(insights.topTerms).toContain('clip')
      expect(insights.recommendation).toContain('gifts')
    } finally {
      vi.useRealTimers()
    }
  })
})

function makeChat(username: string, message: string): ChatEvent {
  return {
    id: `chat-${username}`,
    platform: 'twitch',
    timestamp: new Date(),
    type: 'chat',
    raw: {},
    user: {
      id: username,
      username,
      displayName: username,
      isModerator: false,
      isSubscriber: false,
      isVip: false,
      badges: []
    },
    message,
    emotes: []
  }
}

function makeGift(): GiftEvent {
  return {
    id: 'gift-1',
    platform: 'tiktok',
    timestamp: new Date(),
    type: 'gift',
    raw: {},
    user: {
      id: 'gifter',
      username: 'gifter',
      displayName: 'Gifter',
      isModerator: false,
      isSubscriber: false,
      isVip: false,
      badges: []
    },
    giftId: 'rose',
    giftName: 'Rose',
    giftCount: 1,
    monetaryValue: 1,
    isCombo: false
  }
}
