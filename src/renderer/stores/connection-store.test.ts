import { beforeEach, describe, expect, it } from 'vitest'
import { useConnectionStore } from './connection-store'

describe('connection viewer counts', () => {
  beforeEach(() => {
    useConnectionStore.setState({
      statuses: {},
      viewerCounts: {},
      errors: {},
      reconnectInfo: {},
      profileHealth: {},
      recentEvents: []
    })
  })

  it('clears a stale viewer count when a platform is no longer connected', () => {
    useConnectionStore.getState().setStatus('tiktok', 'connected')
    useConnectionStore.getState().setViewerCount('tiktok', 6)
    expect(useConnectionStore.getState().viewerCounts.tiktok).toBe(6)

    useConnectionStore.getState().setStatus('tiktok', 'connecting')

    expect(useConnectionStore.getState().viewerCounts.tiktok).toBeUndefined()
  })

  it('normalizes invalid viewer counts', () => {
    useConnectionStore.getState().setViewerCount('tiktok', -4)
    useConnectionStore.getState().setViewerCount('twitch', 7.9)

    expect(useConnectionStore.getState().viewerCounts).toMatchObject({
      tiktok: 0,
      twitch: 7
    })
  })

  it('tracks profile enrichment health and clears it on disconnect', () => {
    useConnectionStore.getState().setStatus('kick', 'connected')
    useConnectionStore.getState().setProfileHealth('kick', {
      state: 'degraded',
      error: 'Kick profile lookup failed (401)'
    })
    expect(useConnectionStore.getState().profileHealth.kick?.state).toBe('degraded')

    useConnectionStore.getState().setStatus('kick', 'disconnected')
    expect(useConnectionStore.getState().profileHealth.kick).toBeUndefined()
  })
})
