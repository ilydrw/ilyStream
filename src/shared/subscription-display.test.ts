import { describe, expect, it } from 'vitest'
import {
  formatGiftSubscriptionAlert,
  formatSubscriptionTier,
  getSubscriptionFeedPresentation,
  resolveSubscriptionGifter
} from './subscription-display'

describe('subscription display helpers', () => {
  it('turns Twitch plan IDs into viewer-facing tier names', () => {
    expect(formatSubscriptionTier('twitch', '1000')).toBe('Tier 1')
    expect(formatSubscriptionTier('twitch', '2000')).toBe('Tier 2')
    expect(formatSubscriptionTier('twitch', '3000')).toBe('Tier 3')
    expect(formatSubscriptionTier('twitch', 'Prime')).toBe('Prime')
    expect(formatSubscriptionTier('kick', 'Kick Sub')).toBe('Kick Sub')
  })

  it('describes a Twitch gift from the gifter to the recipient', () => {
    const event = {
      platform: 'twitch',
      tier: '1000',
      isGift: true,
      user: { username: 'recipient', displayName: 'Recipient' },
      gifterUser: { username: 'gifter', displayName: 'Gift Hero' }
    }

    expect(getSubscriptionFeedPresentation(event)).toEqual({
      user: event.gifterUser,
      message: 'gifted Recipient a Tier 1 subscription'
    })
    expect(formatGiftSubscriptionAlert(event)).toBe(
      'Gift Hero gifted Recipient a Tier 1 subscription!'
    )
  })

  it('recovers the gifter from historical raw Twitch events', () => {
    const event = {
      raw: {
        gifter: 'eastons76',
        gifterUserId: '623683411',
        gifterDisplayName: 'Eastons76'
      }
    }

    expect(resolveSubscriptionGifter(event)).toEqual(expect.objectContaining({
      id: '623683411',
      username: 'eastons76',
      displayName: 'Eastons76'
    }))
  })

  it('labels anonymous gift subscriptions without inventing a gifter', () => {
    expect(getSubscriptionFeedPresentation({
      platform: 'twitch',
      tier: '1000',
      isGift: true,
      user: { username: 'recipient', displayName: 'Recipient' },
      raw: {}
    })).toEqual({
      user: { username: 'recipient', displayName: 'Recipient' },
      message: 'received a Tier 1 subscription from an anonymous gifter'
    })
  })
})
