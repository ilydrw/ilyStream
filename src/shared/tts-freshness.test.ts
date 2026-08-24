import { describe, expect, it } from 'vitest'
import { isLiveTtsEventType, isStaleLiveTts, LIVE_TTS_MAX_AGE_MS } from './tts-freshness'

describe('TTS freshness', () => {
  it('expires stream-driven speech after the live-chat window', () => {
    const now = 1_000_000

    expect(isStaleLiveTts({ eventType: 'chat', enqueuedAt: now - LIVE_TTS_MAX_AGE_MS }, now)).toBe(false)
    expect(isStaleLiveTts({ eventType: 'chat', enqueuedAt: now - LIVE_TTS_MAX_AGE_MS - 1 }, now)).toBe(true)
    expect(isStaleLiveTts({ eventType: 'subscription', enqueuedAt: null }, now)).toBe(true)
  })

  it('keeps explicit local speech durable until the user clears it', () => {
    const now = 1_000_000

    for (const eventType of ['manual', 'system', 'test']) {
      expect(isLiveTtsEventType(eventType)).toBe(false)
      expect(isStaleLiveTts({ eventType, enqueuedAt: 1 }, now)).toBe(false)
    }
  })
})
