import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  selectLiveAudience,
  useLiveViewersStore,
  type ViewerIdentityInput
} from './live-viewers-store'

function viewer(username: string): ViewerIdentityInput {
  return { username, displayName: username }
}

describe('live viewers audience reconciliation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-16T12:00:00.000Z'))
    useLiveViewersStore.setState({ viewers: {}, rosterSnapshots: {} })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses the latest roster snapshot and never shows more identities than reported viewers', () => {
    const firstRoster = Array.from({ length: 24 }, (_, index) => viewer(`old-${index}`))
    useLiveViewersStore.getState().syncRoster('tiktok', firstRoster)

    vi.advanceTimersByTime(1_000)
    const latestRoster = Array.from({ length: 10 }, (_, index) => viewer(`current-${index}`))
    useLiveViewersStore.getState().syncRoster('tiktok', latestRoster)

    const state = useLiveViewersStore.getState()
    const audience = selectLiveAudience(
      state.viewers,
      state.rosterSnapshots,
      { tiktok: 6 },
      Date.now()
    )

    expect(audience.reportedTotal).toBe(6)
    expect(audience.identifiedCount).toBe(6)
    expect(audience.groups[0].viewers.map((entry) => entry.username)).toEqual([
      'current-0',
      'current-1',
      'current-2',
      'current-3',
      'current-4',
      'current-5'
    ])
  })

  it('fills incomplete roster identities with fresh activity while respecting the count', () => {
    useLiveViewersStore.getState().syncRoster('tiktok', [viewer('roster-a'), viewer('roster-b')])

    vi.advanceTimersByTime(1_000)
    useLiveViewersStore.getState().recordPresence({
      platform: 'tiktok',
      ...viewer('active-c'),
      action: 'chat'
    })
    useLiveViewersStore.getState().recordPresence({
      platform: 'tiktok',
      ...viewer('active-d'),
      action: 'like'
    })

    const state = useLiveViewersStore.getState()
    const audience = selectLiveAudience(
      state.viewers,
      state.rosterSnapshots,
      { tiktok: 3 },
      Date.now()
    )

    expect(audience.groups[0].viewers).toHaveLength(3)
    expect(audience.groups[0].viewers.map((entry) => entry.username)).toEqual([
      'active-c',
      'active-d',
      'roster-a'
    ])
  })

  it('shows no identities when the platform reports zero viewers', () => {
    useLiveViewersStore.getState().recordPresence({
      platform: 'tiktok',
      ...viewer('recent-user'),
      action: 'join'
    })

    const state = useLiveViewersStore.getState()
    const audience = selectLiveAudience(
      state.viewers,
      state.rosterSnapshots,
      { tiktok: 0 },
      Date.now()
    )

    expect(audience.reportedTotal).toBe(0)
    expect(audience.identifiedCount).toBe(0)
    expect(audience.groups).toEqual([])
  })

  it('clears one platform without removing identities from another', () => {
    useLiveViewersStore.getState().syncRoster('tiktok', [viewer('tiktok-user')])
    useLiveViewersStore.getState().syncRoster('twitch', [viewer('twitch-user')])

    useLiveViewersStore.getState().clearPlatform('tiktok')
    const state = useLiveViewersStore.getState()

    expect(Object.values(state.viewers).map((entry) => entry.username)).toEqual(['twitch-user'])
    expect(state.rosterSnapshots.tiktok).toBeUndefined()
    expect(state.rosterSnapshots.twitch?.viewerIds).toHaveLength(1)
  })
})
