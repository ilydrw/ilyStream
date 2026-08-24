import { describe, expect, it } from 'vitest'
import { TwitchMapper } from './twitch-mapper'

describe('TwitchMapper subscriptions', () => {
  it('maps a gift sub recipient, gifter, and plan to viewer-facing values', () => {
    const event = new TwitchMapper().mapSubscription('cikezzee', {
      userId: '1507664691',
      displayName: 'Cikezzee',
      gifter: 'eastons76',
      gifterUserId: '623683411',
      gifterDisplayName: 'Eastons76',
      plan: '1000',
      months: 1
    }, true)

    expect(event.user).toEqual(expect.objectContaining({
      id: '1507664691',
      username: 'cikezzee',
      displayName: 'Cikezzee'
    }))
    expect(event.gifterUser).toEqual(expect.objectContaining({
      id: '623683411',
      username: 'eastons76',
      displayName: 'Eastons76'
    }))
    expect(event.tier).toBe('Tier 1')
  })

  it('keeps anonymous gift subs anonymous', () => {
    const event = new TwitchMapper().mapSubscription('recipient', {
      userId: 'recipient-id',
      displayName: 'Recipient',
      plan: '2000',
      months: 1
    }, true)

    expect(event.gifterUser).toBeUndefined()
    expect(event.tier).toBe('Tier 2')
  })
})
