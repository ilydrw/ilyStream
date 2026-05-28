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

  it('normalizes pre-escaped apostrophes in alert text without double escaping them', () => {
    expect(sanitizeOverlayHtml("You&#39;re Awesome")).toBe('You&#39;re Awesome')
    expect(sanitizeOverlayHtml("You&#39're Awesome")).toBe('You&#39;re Awesome')
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

  it('keeps count telemetry out of particle widgets', () => {
    expect(shouldBroadcastParticleEvent({
      id: 'viewer-count-1',
      platform: 'twitch',
      timestamp: new Date('2026-04-10T10:10:00.000Z'),
      type: 'viewer-count',
      raw: {},
      count: 7
    } as any)).toBe(false)

    expect(shouldBroadcastParticleEvent({
      id: 'follower-count-1',
      platform: 'twitch',
      timestamp: new Date('2026-04-10T10:10:00.000Z'),
      type: 'follower-count',
      raw: {},
      count: 42
    } as any)).toBe(false)
  })

  it('does not map likes into generic overlay feed items', () => {
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

    expect(eventToOverlayFeedItem(event)).toBeNull()
  })

  it('does not map TikTok like system messages that arrive as chat', () => {
    const event: ChatEvent = {
      id: 'chat-like-1',
      platform: 'tiktok',
      timestamp: new Date('2026-04-10T10:00:00.000Z'),
      type: 'chat',
      raw: {
        displayType: 'pm_mt_msg_viewer',
        defaultPattern: '{0:user} liked the LIVE',
        likeCount: 15,
        totalLikeCount: 18610
      },
      message: 'Alex liked the LIVE',
      emotes: [],
      user: {
        id: 'user-4',
        username: 'alex',
        displayName: 'Alex',
        isModerator: false,
        isSubscriber: false,
        isVip: false,
        badges: []
      }
    }

    expect(eventToOverlayFeedItem(event)).toBeNull()
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

  it('accepts html payloads from direct alert pushes', () => {
    expect(
      createOverlayAlertItem(
        {
          html: 'Test User is now following!',
          durationMs: 5000,
          animationIn: 'fade',
          animationOut: 'fade'
        },
        'tiktok'
      )
    ).toEqual(
      expect.objectContaining({
        html: 'Test User is now following!'
      })
    )
  })
})
