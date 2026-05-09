import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TwitchConnector } from './twitch-connector'
import type { ChatEvent } from '../types'

describe('TwitchConnector follower enrichment', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('marks a chat user as follower before emitting when Helix confirms follow status', async () => {
    const connector = new TwitchConnector()
    const getChannelFollowers = vi.fn().mockResolvedValue({ data: [{ userId: '123' }] })
    ;(connector as any).apiClient = {
      channels: { getChannelFollowers },
      users: { getUserById: vi.fn().mockResolvedValue(null) }
    }
    ;(connector as any).broadcasterId = '999'
    ;(connector as any).tokenScopes = ['moderator:read:followers']

    const enriched = await (connector as any).enrichEventWithTwitchProfile(
      createChatEvent({
        id: '123',
        username: 'streamfriend',
        displayName: 'StreamFriend',
        isFollower: false
      })
    )

    expect(getChannelFollowers).toHaveBeenCalledWith('999', '123')
    expect(enriched.user.isFollower).toBe(true)
  })

  it('does not call the follower API when the Twitch token lacks the follower scope', async () => {
    const connector = new TwitchConnector()
    const getChannelFollowers = vi.fn().mockResolvedValue({ data: [{ userId: '123' }] })
    ;(connector as any).apiClient = {
      channels: { getChannelFollowers },
      users: { getUserById: vi.fn().mockResolvedValue(null) }
    }
    ;(connector as any).broadcasterId = '999'
    ;(connector as any).tokenScopes = []

    const enriched = await (connector as any).enrichEventWithTwitchProfile(
      createChatEvent({
        id: '123',
        username: 'streamfriend',
        displayName: 'StreamFriend',
        isFollower: false
      })
    )

    expect(getChannelFollowers).not.toHaveBeenCalled()
    expect(enriched.user.isFollower).toBe(false)
  })

  it('uses cached follower stats without waiting for the Twitch API', async () => {
    const db = {
      getUserStat: vi.fn().mockReturnValue({ total_follows: 1 })
    }
    const connector = new TwitchConnector(db as any)

    const enriched = await (connector as any).enrichEventWithTwitchProfile(
      createChatEvent({
        id: '123',
        username: 'streamfriend',
        displayName: 'StreamFriend',
        isFollower: false
      })
    )

    expect(db.getUserStat).toHaveBeenCalledWith('twitch', 'streamfriend')
    expect(enriched.user.isFollower).toBe(true)
  })
})

function createChatEvent(user: Partial<ChatEvent['user']>): ChatEvent {
  return {
    id: 'event-1',
    platform: 'twitch',
    timestamp: new Date(),
    type: 'chat',
    raw: {},
    user: {
      id: user.id || 'user-id',
      username: user.username || 'viewer',
      displayName: user.displayName || 'Viewer',
      isModerator: user.isModerator || false,
      isSubscriber: user.isSubscriber || false,
      isVip: user.isVip || false,
      isFollower: user.isFollower,
      badges: user.badges || []
    },
    message: 'hello',
    emotes: []
  }
}
