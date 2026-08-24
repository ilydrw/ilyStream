/**
 * Stream-driven speech is only useful while it is still part of the current
 * conversation. Keeping it longer turns a temporary renderer/provider stall
 * into an unexpected replay much later in the stream.
 */
export const LIVE_TTS_MAX_AGE_MS = 30_000

const DURABLE_TTS_EVENT_TYPES = new Set(['manual', 'system', 'test'])

export interface TTSFreshnessCandidate {
  enqueuedAt?: number | null
  eventType?: string | null
}

export function isLiveTtsEventType(eventType?: string | null): boolean {
  const normalized = String(eventType || '').trim().toLowerCase()
  return !DURABLE_TTS_EVENT_TYPES.has(normalized)
}

export function isStaleLiveTts(
  item: TTSFreshnessCandidate,
  now = Date.now(),
  maxAgeMs = LIVE_TTS_MAX_AGE_MS
): boolean {
  if (!isLiveTtsEventType(item.eventType)) return false

  const enqueuedAt = Number(item.enqueuedAt)
  if (!Number.isFinite(enqueuedAt) || enqueuedAt <= 0) return true
  return now - enqueuedAt > Math.max(0, maxAgeMs)
}
