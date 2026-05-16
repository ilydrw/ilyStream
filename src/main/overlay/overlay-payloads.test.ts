import { describe, expect, it } from 'vitest'
import {
  createOverlayAlertItem,
  eventToOverlayFeedItem,
  sanitizeOverlayHtml,
  shouldBroadcastParticleEvent
} from './overlay-payloads'
import type { ChatEvent, GiftEvent, LikeEvent } from '../platforms/types'

describe('overlay payload helpers', () => {
  it('maps chat events into overlay feed items', () => {
    const event: ChatEvent = {
      id: 'chat-1',
      platform: 'twitch',
      timestamp: new Date('2026-04-10T10:00:00.000Z'),
      type: 'chat',
      raw: {},
      message: 'hello overlay',
      emotes: [],
      user: {
        id: 'user-1',
        username: 'stream_friend',
        displayName: 'Stream Friend',
        isModerator: false,
        isSubscriber: true,
        isVip: false,
        badges: []
      }
    }

    expect(eventToOverlayFeedItem(event)).toEqual(
      expect.objectContaining({
        kind: 'chat',
        platformLabel: 'Twitch',
        displayName: 'Stream Friend',
        message: 'hello overlay'
      })
    )
  })

  it('maps monetized events into highlighted overlay feed items', () => {
    const event: GiftEvent = {
      id: 'gift-1',
      platform: 'tiktok',
      timestamp: new Date('2026-04-10T10:00:00.000Z'),
      type: 'gift',
      raw: {},
      giftName: 'Rose',
      giftId: 'rose',
      giftCount: 5,
      monetaryValue: 99,
      isCombo: false,
      user: {
        id: 'user-2',
        username: 'gifter',
        displayName: 'Gift Hero',
        isModerator: false,
        isSubscriber: false,
        isVip: false,
        badges: []
      }
    }

    expect(eventToOverlayFeedItem(event)).toEqual(
      expect.objectContaining({
        kind: 'gift',
        displayName: 'Gift Hero',
        message: 'sent 5 Rose',
        meta: '$0.99',
        emphasis: true
      })
    )
  })

  it('sanitizes alert html before it reaches the overlay', () => {
    expect(
      sanitizeOverlayHtml('<div onclick="hack()">Hi<script>alert(1)</script><a href="javascript:evil()">Go</a></div>')
    ).toBe('&lt;div onclick=&quot;hack()&quot;&gt;Hi&lt;script&gt;alert(1)&lt;/script&gt;&lt;a href=&quot;javascript:evil()&quot;&gt;Go&lt;/a&gt;&lt;/div&gt;')
  })

  it('preserves line breaks as the only alert html tag', () => {
    expect(sanitizeOverlayHtml('hello<br />world')).toBe('hello<br />world')
  })

  it('suppresses particle bursts for in-progress gift streak updates', () => {
    const baseGift: GiftEvent = {
      id: 'gift-1',
      platform: 'tiktok',
      timestamp: new Date('2026-04-10T10:00:00.000Z'),
      type: 'gift',
      raw: {},
      giftName: 'Rose',
      giftId: 'rose',
      giftCount: 1,
      monetaryValue: 1,
      isCombo: true,
      user: {
        id: 'user-2',
        username: 'gifter',
        displayName: 'Gift Hero',
        isModerator: false,
        isSubscriber: false,
        isVip: false,
        badges: []
      }
    }

    expect(shouldBroadcastParticleEvent(baseGift)).toBe(false)
    expect(shouldBroadcastParticleEvent({ ...baseGift, isCombo: false })).toBe(true)
  })

  it('lets like tracker fall back to deltas when TikTok omits cumulative totals', () => {
    const event: LikeEvent = {
      id: 'like-1',
      platform: 'tiktok',
      timestamp: new Date('2026-04-10T10:00:00.000Z'),
      type: 'like',
      raw: {},
      likeCount: 8,
      totalLikes: 0,
      user: {
        id: 'user-3',
        username: 'liker',
        displayName: 'Like Friend',
        isModerator: false,
        isSubscriber: false,
        isVip: false,
        badges: []
      }
    }

    expect(eventToOverlayFeedItem(event)).toEqual(
      expect.objectContaining({
        kind: 'like',
        amount: 8,
        meta: undefined
      })
    )
  })

  it('clamps alert durations into a safe browser-source range', () => {
    expect(
      createOverlayAlertItem(
        {
          template: '<strong>Hi</strong>',
          durationMs: 999999,
          animationIn: 'fade',
          animationOut: 'slide'
        },
        'tiktok'
      )
    ).toEqual(
      expect.objectContaining({
        platform: 'tiktok',
        durationMs: 30000,
        html: '&lt;strong&gt;Hi&lt;/strong&gt;'
      })
    )
  })
})
