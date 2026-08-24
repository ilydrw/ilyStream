import { describe, expect, it } from 'vitest'
import type { PlatformEventDiagnostic } from '../stores/connection-store'
import {
  buildPlatformHealthRows,
  createHealthDiagnosticReport,
  isRealPlatformEventDiagnostic
} from './health-center'

const NOW = Date.parse('2026-08-22T16:00:00.000Z')

function diagnostic(
  overrides: Partial<PlatformEventDiagnostic> = {}
): PlatformEventDiagnostic {
  return {
    id: 'event-1',
    platform: 'twitch',
    type: 'chat',
    summary: 'Viewer: hello',
    timestamp: new Date(NOW - 5_000),
    simulated: false,
    ...overrides
  }
}

function twitchRow(recentEvents: PlatformEventDiagnostic[]) {
  const row = buildPlatformHealthRows({
    now: NOW,
    statuses: { twitch: 'connected' },
    configs: {
      twitch: {
        platform: 'twitch',
        enabled: true,
        channel: 'channel',
        clientId: 'client-id',
        clientSecret: 'client-secret'
      }
    },
    capabilities: {
      twitch: { platform: 'twitch', canSend: true }
    },
    recentEvents
  }).find((candidate) => candidate.platform === 'twitch')

  if (!row) throw new Error('Twitch health row was not built')
  return row
}

describe('Health Center event trust', () => {
  it('does not treat a fresh simulated event as live platform traffic', () => {
    const row = twitchRow([diagnostic({ simulated: true })])

    expect(row).toMatchObject({
      trafficState: 'quiet',
      trustLabel: 'Connection verified',
      lastEventAt: null,
      lastEventLabel: 'No real platform events this session'
    })
    expect(row.trustDetail).not.toContain('Last real event')
  })

  it('treats a fresh real event as verified live traffic', () => {
    const row = twitchRow([diagnostic()])

    expect(row).toMatchObject({
      trafficState: 'receiving',
      trustLabel: 'Verified live',
      trustDetail: 'Last real event: chat 5s ago.'
    })
  })

  it('uses an older real event when a newer simulated event exists', () => {
    const realTimestamp = new Date(NOW - 30_000)
    const row = twitchRow([
      diagnostic({ id: 'simulation', simulated: true, timestamp: new Date(NOW - 1_000) }),
      diagnostic({ id: 'real', timestamp: realTimestamp })
    ])

    expect(row.lastEventAt).toEqual(realTimestamp)
    expect(row.trustDetail).toBe('Last real event: chat 30s ago.')
  })

  it('counts only explicitly real diagnostics as platform evidence', () => {
    const events = [diagnostic(), diagnostic({ id: 'simulation', simulated: true })]

    expect(events.filter(isRealPlatformEventDiagnostic)).toHaveLength(1)
  })

  it('keeps simulation provenance in copied diagnostic reports', () => {
    const report = JSON.parse(createHealthDiagnosticReport({
      now: NOW,
      recentEvents: [diagnostic({ simulated: true })]
    }))

    expect(report.recentEvents).toEqual([
      expect.objectContaining({ platform: 'twitch', type: 'chat', simulated: true })
    ])
  })
})
