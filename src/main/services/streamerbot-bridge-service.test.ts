import { describe, expect, it } from 'vitest'
import {
  createStreamerbotEventPayload,
  createStreamerbotReceiptPayload
} from './streamerbot-bridge-service'
import type { ChatEvent } from '../platforms/types'
import type { AutomationRunReceipt } from '../../shared/automation-receipts'

describe('Streamerbot bridge payloads', () => {
  it('maps stream events into DoAction payloads', () => {
    const payload = createStreamerbotEventPayload(makeChat()) as any

    expect(payload.request).toBe('DoAction')
    expect(payload.action.name).toBe('ilyStream Event')
    expect(payload.args).toEqual(expect.objectContaining({
      source: 'ilyStream',
      eventType: 'chat',
      platform: 'twitch',
      username: 'viewer',
      message: '!hello'
    }))
  })

  it('maps automation receipts into DoAction payloads', () => {
    const payload = createStreamerbotReceiptPayload({
      id: 'receipt-1',
      eventId: 'event-1',
      eventType: 'chat',
      platform: 'twitch',
      startedAt: '2026-05-23T12:00:00.000Z',
      finishedAt: '2026-05-23T12:00:00.010Z',
      durationMs: 10,
      ruleCount: 1,
      matchedRules: 1,
      blockedRules: 0,
      actionsAttempted: 1,
      actionsRan: 1,
      actionsSkipped: 0,
      actionsFailed: 0,
      rules: []
    } as AutomationRunReceipt) as any

    expect(payload.request).toBe('DoAction')
    expect(payload.action.name).toBe('ilyStream Automation Receipt')
    expect(payload.args.actionsRan).toBe(1)
  })
})

function makeChat(): ChatEvent {
  return {
    id: 'event-1',
    platform: 'twitch',
    timestamp: new Date('2026-05-23T12:00:00.000Z'),
    type: 'chat',
    raw: {},
    user: {
      id: 'viewer',
      username: 'viewer',
      displayName: 'Viewer',
      isModerator: false,
      isSubscriber: false,
      isVip: false,
      badges: []
    },
    message: '!hello',
    emotes: []
  }
}
