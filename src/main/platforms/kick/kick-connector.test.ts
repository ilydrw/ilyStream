import { describe, expect, it, vi } from 'vitest'
import { KickConnector, extractGifteeUsernames, extractGifteeUsers, extractKickEmotes } from './kick-connector'
import type { ChatEvent, FollowEvent } from '../types'

describe('extractGifteeUsernames', () => {
  it('reads the gifted_usernames array from a Pusher gift-sub payload', () => {
    expect(
      extractGifteeUsernames({ gifted_usernames: ['alice', 'bob'], gifter_username: 'whale' })
    ).toEqual(['alice', 'bob'])
  })

  it('supports the lucky-users usernames shape and object entries', () => {
    expect(extractGifteeUsernames({ usernames: ['carol'] })).toEqual(['carol'])
    expect(
      extractGifteeUsernames({ giftees: [{ username: 'dave' }, { user: { username: 'erin' } }] })
    ).toEqual(['dave', 'erin'])
  })

  it('falls back to a single username, and returns empty when none exist', () => {
    expect(extractGifteeUsernames({ username: 'frank' })).toEqual(['frank'])
    expect(extractGifteeUsernames({})).toEqual([])
    expect(extractGifteeUsernames({ gifted_usernames: [] , username: 'grace' })).toEqual(['grace'])
  })

  it('keeps rich giftee payloads available to the event mapper', () => {
    const giftee = { id: 123, username: 'alice', profile_picture: 'https://files.kick.com/alice.webp' }
    expect(extractGifteeUsers({ giftees: [giftee] })).toEqual([giftee])
  })
})

describe('extractKickEmotes', () => {
  it('parses inline [emote:id:name] tokens from a real-time chat message', () => {
    const message = 'gg [emote:37226:KEKW]'
    const emotes = extractKickEmotes(message, {})

    expect(emotes).toHaveLength(1)
    expect(emotes[0]).toMatchObject({
      id: '37226',
      name: 'KEKW',
      imageUrl: 'https://files.kick.com/emotes/37226/fullsize'
    })
    expect(message.slice(emotes[0].startIndex, emotes[0].endIndex + 1)).toBe('[emote:37226:KEKW]')
  })
})

describe('KickConnector profile enrichment', () => {
  it('adds an official Kick avatar before emitting chat', async () => {
    const resolve = vi.fn().mockResolvedValue({
      id: '123',
      displayName: 'Viewer Live',
      profilePictureUrl: 'https://files.kick.com/viewer.webp'
    })
    const connector = new KickConnector({
      profileResolver: { resolve, getHealth: () => ({ state: 'healthy' }) }
    })
    const emitted: ChatEvent[] = []
    connector.on('event', (event) => {
      if (event.type === 'chat') emitted.push(event)
    })

    await (connector as any).emitEnriched(createChatEvent())

    expect(resolve).toHaveBeenCalledWith('123')
    expect(emitted).toHaveLength(1)
    expect(emitted[0].user).toMatchObject({
      id: '123',
      displayName: 'Viewer Live',
      profilePictureUrl: 'https://files.kick.com/viewer.webp'
    })
  })

  it('reuses a stored avatar without calling the Kick API', async () => {
    const resolve = vi.fn()
    const db = {
      getUserStat: vi.fn().mockReturnValue({
        platform_user_id: '123',
        display_name: 'Stored Viewer',
        profile_picture_url: 'https://files.kick.com/stored.webp',
        total_follows: 1,
        is_moderator: 0
      })
    }
    const connector = new KickConnector({
      db,
      profileResolver: { resolve, getHealth: () => ({ state: 'idle' }) }
    })
    const event = createChatEvent({ id: '', username: 'viewer', displayName: 'Viewer' })

    await (connector as any).enrichEventWithKickProfile(event)

    expect(db.getUserStat).toHaveBeenCalledWith('kick', 'viewer')
    expect(resolve).not.toHaveBeenCalled()
    expect(event.user).toMatchObject({
      id: '123',
      profilePictureUrl: 'https://files.kick.com/stored.webp',
      isFollower: true
    })
  })

  it('preserves IDs and avatars from rich real-time subscription payloads', () => {
    const connector = new KickConnector()
    const event = (connector as any).mapRealtimeSubscription({
      subscriber: {
        id: 456,
        username: 'subscriber',
        profile_picture: 'https://files.kick.com/subscriber.webp'
      },
      duration: 3
    })

    expect(event.user).toMatchObject({
      id: '456',
      username: 'subscriber',
      profilePictureUrl: 'https://files.kick.com/subscriber.webp',
      isSubscriber: true
    })
    expect(event.months).toBe(3)
  })

  it('deduplicates equivalent follow events before downstream side effects', async () => {
    const connector = new KickConnector()
    const emitted: FollowEvent[] = []
    connector.on('event', (event) => {
      if (event.type === 'follow') emitted.push(event)
    })

    await (connector as any).emitEnriched(createFollowEvent('first-delivery'))
    await (connector as any).emitEnriched(createFollowEvent('second-delivery'))

    expect(emitted).toHaveLength(1)
  })
})

describe('KickConnector viewer-count polling', () => {
  it('keeps the socket healthy, backs off, and cancels retries when channel APIs are blocked', async () => {
    vi.useFakeTimers()
    const resolveViewerCount = vi.fn().mockResolvedValue(null)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const connector = new KickConnector({ resolveViewerCount })
    connector.status = 'connected'

    try {
      ;(connector as any).startViewerCountPolling('creator')
      await vi.advanceTimersByTimeAsync(0)

      expect(resolveViewerCount).toHaveBeenCalledTimes(1)
      expect(connector.status).toBe('connected')
      expect(warn).toHaveBeenCalledWith(
        '[kick] Viewer-count lookup failed; real-time events remain connected'
      )

      await vi.advanceTimersByTimeAsync(59_999)
      expect(resolveViewerCount).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1)
      expect(resolveViewerCount).toHaveBeenCalledTimes(2)
      expect(connector.status).toBe('connected')

      await (connector as any).cleanup()
      await vi.advanceTimersByTimeAsync(5 * 60_000)
      expect(resolveViewerCount).toHaveBeenCalledTimes(2)
    } finally {
      await (connector as any).cleanup()
      warn.mockRestore()
      vi.useRealTimers()
    }
  })
})

function createChatEvent(user: Partial<ChatEvent['user']> = {}): ChatEvent {
  return {
    id: 'message-1',
    platform: 'kick',
    timestamp: new Date(),
    type: 'chat',
    raw: {},
    user: {
      id: user.id ?? '123',
      username: user.username ?? 'viewer',
      displayName: user.displayName ?? 'Viewer',
      profilePictureUrl: user.profilePictureUrl,
      isModerator: false,
      isSubscriber: false,
      isVip: false,
      badges: []
    },
    message: 'hello',
    emotes: []
  }
}

function createFollowEvent(id: string): FollowEvent {
  return {
    id,
    platform: 'kick',
    timestamp: new Date(),
    type: 'follow',
    raw: {},
    user: {
      id: '123',
      username: 'viewer',
      displayName: 'Viewer',
      profilePictureUrl: 'https://files.kick.com/viewer.webp',
      isModerator: false,
      isSubscriber: false,
      isVip: false,
      badges: []
    }
  }
}
