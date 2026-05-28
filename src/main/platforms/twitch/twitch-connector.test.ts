import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TwitchConnector, normalizeTwitchChannelName } from './twitch-connector'
import type { ChatEvent } from '../types'

describe('normalizeTwitchChannelName', () => {
  it('accepts copied Twitch channel names with chat prefixes', () => {
    expect(normalizeTwitchChannelName('@ily2drw')).toBe('ily2drw')
    expect(normalizeTwitchChannelName('#Some_Channel')).toBe('some_channel')
    expect(normalizeTwitchChannelName('  @MixedCase  ')).toBe('mixedcase')
  })
})

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

  it('emits chat even when Twitch profile enrichment hangs', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const connector = new TwitchConnector()
    const emitted: ChatEvent[] = []

    connector.on('event', (event) => {
      if (event.type === 'chat') emitted.push(event)
    })
    ;(connector as any).apiClient = {
      channels: { getChannelFollowers: vi.fn(() => new Promise(() => undefined)) }
    }
    ;(connector as any).broadcasterId = '999'
    ;(connector as any).tokenScopes = ['moderator:read:followers']

    try {
      const pending = (connector as any).emitEnriched(
        createChatEvent({
          id: '123',
          username: 'streamfriend',
          displayName: 'StreamFriend',
          isFollower: false
        })
      )

      await vi.advanceTimersByTimeAsync(1_600)
      await pending

      expect(emitted).toHaveLength(1)
      expect(emitted[0]).toEqual(expect.objectContaining({
        platform: 'twitch',
        type: 'chat',
        message: 'hello'
      }))
    } finally {
      warnSpy.mockRestore()
    }
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
