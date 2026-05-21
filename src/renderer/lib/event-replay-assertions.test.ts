import { describe, expect, it } from 'vitest'
import type { EventLabEntry } from '../stores/event-lab-store'
import type { EventReplaySession } from './event-replay'
import { evaluateReplayAssertions } from './event-replay-assertions'

const startedAt = '2026-05-20T12:00:00.000Z'
const finishedAt = '2026-05-20T12:00:05.000Z'

function createSession(overrides: Partial<EventReplaySession> = {}): EventReplaySession {
  return {
    id: 'session-1',
    schemaVersion: 1,
    name: 'Regression Replay',
    description: 'test',
    createdAt: startedAt,
    updatedAt: startedAt,
    durationMs: 1000,
    events: [
      {
        id: 'event-like',
        offsetMs: 0,
        capturedAt: startedAt,
        sourceKind: 'stream',
        title: 'Likes',
        detail: '25 likes',
        payload: {
          type: 'like',
          platform: 'tiktok',
          username: 'fan',
          displayName: 'Fan',
          likeCount: 25,
          totalLikes: 100
        }
      },
      {
        id: 'event-gg',
        offsetMs: 500,
        capturedAt: '2026-05-20T12:00:00.500Z',
        sourceKind: 'stream',
        title: 'GG gift',
        detail: 'GG x1',
        payload: {
          type: 'gift',
          platform: 'tiktok',
          username: 'fan',
          displayName: 'Fan',
          giftName: 'GG',
          giftCount: 1
        }
      }
    ],
    ...overrides
  }
}

function marker(eventId: string, type: string, timestamp: string): EventLabEntry {
  return {
    id: `marker-${eventId}`,
    kind: 'system',
    title: `Replay fired ${type}`,
    detail: `Regression Replay ${eventId}`,
    timestamp,
    payload: {
      sessionId: 'session-1',
      event: { id: eventId, payload: { type } }
    }
  }
}

describe('event replay assertions', () => {
  it('passes the core checks for a clean replay', () => {
    const report = evaluateReplayAssertions(
      createSession(),
      [
        marker('event-like', 'like', '2026-05-20T12:00:00.100Z'),
        marker('event-gg', 'gift', '2026-05-20T12:00:00.600Z'),
        {
          id: 'automation-1',
          kind: 'automation',
          title: 'Automation receipt',
          detail: '0 failed',
          timestamp: '2026-05-20T12:00:00.700Z',
          payload: { actionsFailed: 0, rules: [] }
        },
        {
          id: 'alert-1',
          kind: 'alert',
          title: 'Alert visual queued',
          detail: 'GG celebration',
          timestamp: '2026-05-20T12:00:00.800Z',
          payload: { html: '<strong>GG</strong>' }
        },
        {
          id: 'overlay-1',
          kind: 'overlay',
          title: 'Overlay channel: alerts',
          detail: 'type=gift',
          channel: 'alerts',
          timestamp: '2026-05-20T12:00:00.900Z'
        }
      ],
      { startedAt, finishedAt }
    )

    expect(report.failed).toBe(0)
    expect(report.results.find((result) => result.id === 'likes-not-chat')?.status).toBe('passed')
    expect(report.results.find((result) => result.id === 'gg-alert-no-duplicates')?.status).toBe('passed')
  })

  it('fails when likes appear as chat', () => {
    const report = evaluateReplayAssertions(
      createSession(),
      [
        marker('event-like', 'like', '2026-05-20T12:00:00.100Z'),
        marker('event-gg', 'gift', '2026-05-20T12:00:00.600Z'),
        {
          id: 'chat-leak',
          kind: 'stream',
          title: 'Fan chatted',
          detail: 'Fan sent likes',
          platform: 'tiktok',
          eventType: 'chat',
          timestamp: '2026-05-20T12:00:00.200Z',
          payload: {
            type: 'chat',
            message: 'Fan sent likes',
            user: { username: 'fan', displayName: 'Fan' }
          }
        }
      ],
      { startedAt, finishedAt }
    )

    expect(report.results.find((result) => result.id === 'likes-not-chat')?.status).toBe('failed')
  })

  it('fails when a GG gift creates duplicate alerts', () => {
    const report = evaluateReplayAssertions(
      createSession(),
      [
        marker('event-like', 'like', '2026-05-20T12:00:00.100Z'),
        marker('event-gg', 'gift', '2026-05-20T12:00:00.600Z'),
        {
          id: 'alert-1',
          kind: 'alert',
          title: 'Alert visual queued',
          detail: 'GG',
          timestamp: '2026-05-20T12:00:00.800Z'
        },
        {
          id: 'alert-2',
          kind: 'alert',
          title: 'Alert visual queued',
          detail: 'GG',
          timestamp: '2026-05-20T12:00:00.900Z'
        }
      ],
      { startedAt, finishedAt }
    )

    expect(report.results.find((result) => result.id === 'gg-alert-no-duplicates')?.status).toBe('failed')
  })

  it('requires Spotify queue updates for song request commands', () => {
    const report = evaluateReplayAssertions(
      createSession({
        events: [
          {
            id: 'event-song',
            offsetMs: 0,
            capturedAt: startedAt,
            sourceKind: 'stream',
            title: 'Song request',
            detail: '!play song',
            payload: {
              type: 'chat',
              platform: 'twitch',
              username: 'dj',
              displayName: 'DJ',
              message: '!play never gonna give you up'
            }
          }
        ]
      }),
      [marker('event-song', 'chat', '2026-05-20T12:00:00.100Z')],
      { startedAt, finishedAt }
    )

    expect(report.results.find((result) => result.id === 'spotify-command-queued')?.status).toBe('failed')
  })
})
