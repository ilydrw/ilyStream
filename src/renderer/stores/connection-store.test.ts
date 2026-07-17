import { beforeEach, describe, expect, it } from 'vitest'
import { useConnectionStore } from './connection-store'

describe('connection viewer counts', () => {
  beforeEach(() => {
    useConnectionStore.setState({
      statuses: {},
      viewerCounts: {},
      errors: {},
      reconnectInfo: {},
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
})
