import { describe, expect, it } from 'vitest'
import type { LikeEvent } from '../../platforms/types'
import type { OverlayFeedItem } from '../../../shared/overlay'
import { LikesTracker } from './likes-tracker'

describe('LikesTracker', () => {
  it('caps attributed user likes to cumulative platform movement', () => {
    const { tracker } = createTracker()

    tracker.updateState(makeLikeEvent({ id: 'like-1', username: 'alice', displayName: 'Alice', likeCount: 10, totalLikes: 100 }), makeFeedItem('Alice', 10))
    tracker.updateState(makeLikeEvent({ id: 'like-2', username: 'bob', displayName: 'Bob', likeCount: 50, totalLikes: 105 }), makeFeedItem('Bob', 50))

    const snapshot = tracker.getSnapshot()
    expect(snapshot.totalLikes).toBe(15)
    expect(snapshot.users).toEqual([
      expect.objectContaining({ displayName: 'Alice', count: 10 }),
      expect.objectContaining({ displayName: 'Bob', count: 5 })
    ])
  })

  it('starts a fresh app-session count from cumulative platform totals', () => {
    const { tracker } = createTracker()

    tracker.updateState(
      makeLikeEvent({ id: 'post-restart-1', username: 'alice', displayName: 'Alice', likeCount: 3, totalLikes: 10003 }),
      makeFeedItem('Alice', 3)
    )
    tracker.updateState(
      makeLikeEvent({ id: 'post-restart-2', username: 'bob', displayName: 'Bob', likeCount: 4, totalLikes: 10007 }),
      makeFeedItem('Bob', 4)
    )

    const snapshot = tracker.getSnapshot()
    expect(snapshot.totalLikes).toBe(7)
    expect(snapshot.users).toEqual([
      expect.objectContaining({ displayName: 'Bob', count: 4 }),
      expect.objectContaining({ displayName: 'Alice', count: 3 })
    ])
  })

  it('clears cumulative platform baselines on reset', () => {
    const { tracker } = createTracker()

    tracker.updateState(
      makeLikeEvent({ id: 'before-reset', username: 'alice', displayName: 'Alice', likeCount: 5, totalLikes: 205 }),
      makeFeedItem('Alice', 5)
    )
    tracker.reset()
    tracker.updateState(
      makeLikeEvent({ id: 'after-reset', username: 'bob', displayName: 'Bob', likeCount: 2, totalLikes: 502 }),
      makeFeedItem('Bob', 2)
    )

    expect(tracker.getSnapshot()).toEqual({
      totalLikes: 2,
      users: [
        expect.objectContaining({ displayName: 'Bob', count: 2 })
      ]
    })
  })

  it('ignores duplicate event ids and stale cumulative totals', () => {
    const { tracker, broadcasts } = createTracker()
    const event = makeLikeEvent({ id: 'dupe-like', username: 'alice', displayName: 'Alice', likeCount: 5, totalLikes: 5 })

    const first = tracker.updateState(event, makeFeedItem('Alice', 5))
    const duplicate = tracker.updateState(event, makeFeedItem('Alice', 5))
    const stale = tracker.updateState(
      makeLikeEvent({ id: 'stale-like', username: 'alice', displayName: 'Alice', likeCount: 3, totalLikes: 4 }),
      makeFeedItem('Alice', 3)
    )

    expect(first?.amount).toBe(5)
    expect(duplicate).toBeNull()
    expect(stale).toBeNull()
    expect(tracker.getSnapshot().users).toEqual([
      expect.objectContaining({ displayName: 'Alice', count: 5 })
    ])
    expect(broadcasts).toHaveLength(1)
  })

  it('accepts reused TikTok like ids when the cumulative total advances', () => {
    const { tracker } = createTracker()

    tracker.updateState(
      makeLikeEvent({ id: 'shared-like-id', username: 'alice', displayName: 'Alice', likeCount: 5, totalLikes: 100 }),
      makeFeedItem('Alice', 5)
    )
    tracker.updateState(
      makeLikeEvent({ id: 'shared-like-id', username: 'alice', displayName: 'Alice', likeCount: 5, totalLikes: 105 }),
      makeFeedItem('Alice', 5)
    )

    expect(tracker.getSnapshot()).toEqual(
      expect.objectContaining({
        totalLikes: 10,
        users: [
          expect.objectContaining({ displayName: 'Alice', count: 10 })
        ]
      })
    )
  })

  it('accepts reused like ids without platform totals when packet timestamps differ', () => {
    const { tracker } = createTracker()

    tracker.updateState(
      makeLikeEvent({ id: 'shared-delta-id', username: 'alice', displayName: 'Alice', likeCount: 3, totalLikes: 0, timestamp: '2026-05-20T12:00:00.000Z' }),
      makeFeedItem('Alice', 3)
    )
    tracker.updateState(
      makeLikeEvent({ id: 'shared-delta-id', username: 'alice', displayName: 'Alice', likeCount: 3, totalLikes: 0, timestamp: '2026-05-20T12:00:00.500Z' }),
      makeFeedItem('Alice', 3)
    )

    expect(tracker.getSnapshot()).toEqual(
      expect.objectContaining({
        totalLikes: 6,
        users: [
          expect.objectContaining({ displayName: 'Alice', count: 6 })
        ]
      })
    )
  })

  it('keeps same display names separate by platform identity and falls back to deltas without platform totals', () => {
    const { tracker } = createTracker()

    tracker.updateState(makeLikeEvent({ id: 'tiktok-1', platform: 'tiktok', username: 'sam_tt', displayName: 'Sam', likeCount: 3, totalLikes: 0 }), makeFeedItem('Sam', 3, 'tiktok'))
    tracker.updateState(makeLikeEvent({ id: 'twitch-1', platform: 'twitch', username: 'sam_tv', displayName: 'Sam', likeCount: 7, totalLikes: 0 }), makeFeedItem('Sam', 7, 'twitch'))

    const snapshot = tracker.getSnapshot()
    expect(snapshot.totalLikes).toBe(10)
    expect(snapshot.users).toEqual([
      expect.objectContaining({ key: 'twitch:sam_tv', displayName: 'Sam', count: 7 }),
      expect.objectContaining({ key: 'tiktok:sam_tt', displayName: 'Sam', count: 3 })
    ])
  })
})

function createTracker() {
  const broadcasts: Array<{ channel: string; payload: unknown }> = []
  const tracker = new LikesTracker({
    broadcast: (channel: string, payload: unknown) => broadcasts.push({ channel, payload })
  } as any)

  return { tracker, broadcasts }
}

function makeLikeEvent({
  id,
  platform = 'tiktok',
  username,
  displayName,
  likeCount,
  totalLikes,
  timestamp = '2026-05-20T12:00:00.000Z'
}: {
  id: string
  platform?: LikeEvent['platform']
  username: string
  displayName: string
  likeCount: number
  totalLikes: number
  timestamp?: string
}): LikeEvent {
  return {
    id,
    platform,
    timestamp: new Date(timestamp),
    type: 'like',
    raw: {},
    likeCount,
    totalLikes,
    user: {
      id: username,
      username,
      displayName,
      isModerator: false,
      isSubscriber: false,
      isVip: false,
      badges: []
    }
  }
}

function makeFeedItem(displayName: string, amount: number, platform = 'tiktok'): OverlayFeedItem {
  return {
    id: `${platform}-${displayName}-${amount}`,
    kind: 'like',
    platform,
    platformLabel: platform,
    displayName,
    message: '',
    amount,
    accentColor: '#ff3b5c',
    timestamp: '2026-05-20T12:00:00.000Z',
    emphasis: false
  }
}
