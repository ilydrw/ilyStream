import { describe, expect, it, beforeEach } from 'vitest'
import { useEventLabStore } from './event-lab-store'

describe('event lab store replay recording', () => {
  beforeEach(() => {
    useEventLabStore.setState({
      entries: [],
      recording: null,
      replaySessions: [],
      activeReplay: null
    })
  })

  it('captures replayable stream entries into a saved session', () => {
    const store = useEventLabStore.getState()
    store.startRecording('Gift Burst')

    useEventLabStore.getState().addEntry({
      id: 'stream-1',
      kind: 'stream',
      title: 'Viewer sent a gift',
      detail: 'GG x1',
      timestamp: '2026-05-20T12:00:02.000Z',
      platform: 'tiktok',
      eventType: 'gift',
      replayable: true,
      payload: {
        type: 'gift',
        platform: 'tiktok',
        giftName: 'GG',
        giftCount: 1,
        user: { username: 'viewer', displayName: 'Viewer' }
      }
    })

    const session = useEventLabStore.getState().stopRecording()

    expect(session?.name).toBe('Gift Burst')
    expect(session?.events).toHaveLength(1)
    expect(session?.events[0].payload).toMatchObject({
      type: 'gift',
      platform: 'tiktok',
      giftName: 'GG'
    })
    expect(useEventLabStore.getState().replaySessions).toHaveLength(1)
  })

  it('does not capture events generated while replay is active', () => {
    useEventLabStore.getState().startRecording('Replay Loop Guard')
    useEventLabStore.getState().setActiveReplay({
      sessionId: 'session-1',
      sessionName: 'Loop Guard',
      running: true,
      index: 1,
      total: 1,
      speed: 1,
      startedAt: '2026-05-20T12:00:00.000Z'
    })

    useEventLabStore.getState().addEntry({
      id: 'stream-2',
      kind: 'stream',
      title: 'Replay chat',
      detail: 'hello',
      timestamp: '2026-05-20T12:00:01.000Z',
      platform: 'twitch',
      eventType: 'chat',
      replayable: true,
      payload: {
        type: 'chat',
        platform: 'twitch',
        message: 'hello',
        user: { username: 'viewer', displayName: 'Viewer' }
      }
    })

    useEventLabStore.getState().setActiveReplay(null)
    const session = useEventLabStore.getState().stopRecording()

    expect(session).toBeNull()
  })
})
