import { describe, expect, it } from 'vitest'
import {
  createReplaySession,
  eventLabPayloadToSimulation,
  normalizeReplaySession,
  replayableEntryToEvent
} from './event-replay'

describe('event replay', () => {
  it('converts chat events into simulation payloads', () => {
    const payload = eventLabPayloadToSimulation({
      type: 'chat',
      platform: 'twitch',
      message: '!play never gonna give you up',
      user: {
        username: 'viewer_one',
        displayName: 'Viewer One'
      }
    })

    expect(payload).toMatchObject({
      type: 'chat',
      platform: 'twitch',
      username: 'viewer_one',
      displayName: 'Viewer One',
      message: '!play never gonna give you up'
    })
  })

  it('preserves relative offsets while capturing replay entries', () => {
    const event = replayableEntryToEvent(
      {
        id: 'entry-1',
        kind: 'stream',
        title: 'Fan sent likes',
        detail: '25 likes',
        timestamp: '2026-05-20T12:00:03.250Z',
        payload: {
          type: 'like',
          platform: 'tiktok',
          likeCount: 25,
          totalLikes: 100,
          user: {
            username: 'fan',
            displayName: 'Fan'
          }
        }
      },
      '2026-05-20T12:00:00.000Z'
    )

    expect(event?.offsetMs).toBe(3250)
    expect(event?.payload).toMatchObject({
      type: 'like',
      platform: 'tiktok',
      likeCount: 25,
      totalLikes: 100
    })
  })

  it('skips non-replayable downstream packets', () => {
    const event = replayableEntryToEvent(
      {
        id: 'entry-2',
        kind: 'overlay',
        title: 'Overlay snapshot',
        detail: 'chat channel',
        timestamp: '2026-05-20T12:00:01.000Z',
        payload: { channel: 'chat', payload: [] }
      },
      '2026-05-20T12:00:00.000Z'
    )

    expect(event).toBeNull()
  })

  it('normalizes imported sessions and sorts events by timing', () => {
    const session = normalizeReplaySession({
      id: 'session-1',
      name: 'Import Me',
      events: [
        {
          id: 'late',
          offsetMs: 2000,
          capturedAt: '2026-05-20T12:00:02.000Z',
          sourceKind: 'stream',
          title: 'Late',
          detail: 'late',
          payload: { type: 'follow', platform: 'kick', username: 'late' }
        },
        {
          id: 'early',
          offsetMs: 250,
          capturedAt: '2026-05-20T12:00:00.250Z',
          sourceKind: 'stream',
          title: 'Early',
          detail: 'early',
          payload: { type: 'gift', platform: 'tiktok', giftName: 'GG', giftCount: 1 }
        }
      ]
    })

    expect(session.id).toBe('session-1')
    expect(session.durationMs).toBe(2000)
    expect(session.events.map((event) => event.id)).toEqual(['early', 'late'])
  })

  it('creates sessions only from valid replay events', () => {
    const session = createReplaySession([
      {
        id: 'valid',
        offsetMs: 0,
        capturedAt: '2026-05-20T12:00:00.000Z',
        sourceKind: 'stream',
        title: 'Valid',
        detail: 'valid',
        payload: { type: 'share', platform: 'youtube', username: 'viewer' }
      }
    ])

    expect(session.events).toHaveLength(1)
    expect(session.events[0].payload.displayName).toBe('viewer')
  })
})
