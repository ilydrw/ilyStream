import { describe, expect, it, vi } from 'vitest'
import { GoalManager } from './goal-manager'

function createManager() {
  const broadcast = vi.fn()
  const manager = new GoalManager({ broadcast } as any, null)
  return { manager, broadcast }
}

describe('GoalManager follower totals', () => {
  it('uses authoritative TikTok follower counts in goal snapshots', () => {
    const { manager, broadcast } = createManager()

    manager.handleEvent({
      id: 'tiktok-followers-1',
      platform: 'tiktok',
      type: 'follower-count',
      count: 4_521,
      timestamp: new Date('2026-08-10T12:00:00.000Z'),
      raw: {}
    })

    expect(manager.getState()).toMatchObject({
      totalFollows: 4_521,
      tiktokFollows: 4_521,
      twitchFollows: 0
    })
    expect(broadcast).toHaveBeenLastCalledWith('goals', {
      type: 'snapshot',
      payload: expect.objectContaining({ tiktokFollows: 4_521 })
    })
  })

  it('advances immediately on follows and reconciles to the next platform total', () => {
    const { manager } = createManager()

    manager.handleEvent({
      id: 'tiktok-followers-1',
      platform: 'tiktok',
      type: 'follower-count',
      count: 100,
      timestamp: new Date(),
      raw: {}
    })
    manager.handleEvent({
      id: 'follow-1',
      platform: 'tiktok',
      type: 'follow',
      user: { id: 'viewer-1', username: 'new-fan', displayName: 'New Fan' },
      timestamp: new Date(),
      raw: {}
    } as any)

    expect(manager.getState().tiktokFollows).toBe(101)

    manager.handleEvent({
      id: 'tiktok-followers-2',
      platform: 'tiktok',
      type: 'follower-count',
      count: 99,
      timestamp: new Date(),
      raw: {}
    })

    expect(manager.getState()).toMatchObject({ totalFollows: 99, tiktokFollows: 99 })
  })

  it('sums platform totals while keeping platform-specific goal counts separate', () => {
    const { manager } = createManager()

    manager.handleEvent({ id: 'tt', platform: 'tiktok', type: 'follower-count', count: 300, timestamp: new Date(), raw: {} })
    manager.handleEvent({ id: 'tw', platform: 'twitch', type: 'follower-count', count: 200, timestamp: new Date(), raw: {} })

    expect(manager.getState()).toMatchObject({
      totalFollows: 500,
      tiktokFollows: 300,
      twitchFollows: 200
    })
  })
})
