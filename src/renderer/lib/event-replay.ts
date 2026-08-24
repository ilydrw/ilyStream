import type { Platform } from '../../main/platforms/types'
import type { EventLabSimulationPayload } from '../../shared/event-lab'

export type EventLabEntryKind =
  | 'stream'
  | 'overlay'
  | 'performance'
  | 'device'
  | 'automation'
  | 'alert'
  | 'sound'
  | 'tts'
  | 'spotify'
  | 'status'
  | 'system'

export const EVENT_REPLAY_SESSIONS_KEY = 'ilystream.eventReplay.sessions.v1'
export const EVENT_REPLAY_SCHEMA_VERSION = 1

export interface EventReplayEvent {
  id: string
  offsetMs: number
  capturedAt: string
  sourceKind: EventLabEntryKind
  title: string
  detail: string
  payload: EventLabSimulationPayload
}

export interface EventReplaySession {
  id: string
  schemaVersion: number
  name: string
  description: string
  createdAt: string
  updatedAt: string
  durationMs: number
  events: EventReplayEvent[]
}

export interface EventReplayRecording {
  id: string
  name: string
  startedAt: string
  events: EventReplayEvent[]
}

export interface ActiveReplayState {
  sessionId: string
  sessionName: string
  running: boolean
  index: number
  total: number
  speed: number
  startedAt: string
}

interface ReplayableEntryLike {
  id: string
  kind: EventLabEntryKind
  title: string
  detail: string
  timestamp: string
  payload?: unknown
}

export function createReplayRecording(name = 'Untitled Replay'): EventReplayRecording {
  return {
    id: createReplayId('recording'),
    name: cleanText(name, 'Untitled Replay', 80),
    startedAt: new Date().toISOString(),
    events: []
  }
}

export function createReplaySession(
  events: EventReplayEvent[],
  metadata: Partial<Pick<EventReplaySession, 'id' | 'name' | 'description' | 'createdAt'>> = {}
): EventReplaySession {
  const now = new Date().toISOString()
  const normalizedEvents = normalizeReplayEvents(events)
  const durationMs = normalizedEvents.reduce((max, event) => Math.max(max, event.offsetMs), 0)
  const name = cleanText(metadata.name, 'Untitled Replay', 80)

  return {
    id: cleanText(metadata.id, createReplayId('replay'), 96),
    schemaVersion: EVENT_REPLAY_SCHEMA_VERSION,
    name,
    description: cleanText(metadata.description, 'Recorded Event Lab replay session.', 200),
    createdAt: metadata.createdAt ?? now,
    updatedAt: now,
    durationMs,
    events: normalizedEvents
  }
}

export function replayableEntryToEvent(
  entry: ReplayableEntryLike,
  recordingStartedAt: string,
  fallbackOffsetMs = 0
): EventReplayEvent | null {
  const payload = eventLabPayloadToSimulation(entry.payload)
  if (!payload) return null

  const startedAt = parseTimestamp(recordingStartedAt)
  const capturedAt = parseTimestamp(entry.timestamp)
  const offsetMs = Number.isFinite(startedAt) && Number.isFinite(capturedAt)
    ? Math.max(0, capturedAt - startedAt)
    : Math.max(0, Math.floor(Number.isFinite(fallbackOffsetMs) ? fallbackOffsetMs : 0))

  return {
    id: createReplayId('event'),
    offsetMs,
    capturedAt: new Date(Number.isFinite(capturedAt) ? capturedAt : Date.now()).toISOString(),
    sourceKind: entry.kind,
    title: entry.title,
    detail: entry.detail,
    payload
  }
}

export function eventLabPayloadToSimulation(payload: unknown): EventLabSimulationPayload | null {
  const value = payload as any
  const testPayload = value?.testPayload ?? value?.payload?.testPayload
  if (testPayload?.type) return normalizeReplayPayload(testPayload)

  if (!value?.type) return null

  if (value.type === 'viewer-count') {
    return normalizeReplayPayload({
      platform: value.platform,
      type: 'viewer-count',
      viewerCount: value.count
    })
  }

  const base: EventLabSimulationPayload = {
    platform: value.platform,
    type: value.type,
    username: value.user?.username,
    displayName: value.user?.displayName
  }

  switch (value.type) {
    case 'chat':
      return normalizeReplayPayload({ ...base, type: 'chat', message: value.message })
    case 'gift':
      return normalizeReplayPayload({
        ...base,
        type: 'gift',
        giftName: value.giftName,
        giftId: value.giftId,
        giftCount: value.giftCount
      })
    case 'like':
      return normalizeReplayPayload({
        ...base,
        type: 'like',
        likeCount: value.likeCount,
        totalLikes: value.totalLikes
      })
    case 'raid':
      return normalizeReplayPayload({ ...base, type: 'raid', viewerCount: value.viewerCount })
    case 'subscription':
      return normalizeReplayPayload({
        ...base,
        type: value.user?.isFanClubMember ? 'superfan' : 'subscription',
        months: value.months
      })
    case 'follow':
    case 'share':
    case 'join':
      return normalizeReplayPayload(base)
    default:
      return null
  }
}

export function normalizeReplayPayload(payload: EventLabSimulationPayload): EventLabSimulationPayload {
  return {
    ...payload,
    platform: isPlatform(payload.platform) ? payload.platform : 'tiktok',
    username: cleanText(payload.username, 'event_replay_test', 48).replace(/\s+/g, '_'),
    displayName: cleanText(payload.displayName, payload.username || 'Event Replay Test', 64)
  }
}

export function normalizeReplaySession(value: unknown): EventReplaySession {
  const raw = value as Partial<EventReplaySession>
  if (!raw || !Array.isArray(raw.events)) {
    throw new Error('That replay file does not contain an events array.')
  }

  return createReplaySession(
    raw.events
      .map(normalizeReplayEvent)
      .filter((event): event is EventReplayEvent => Boolean(event)),
    {
      id: typeof raw.id === 'string' ? raw.id : undefined,
      name: raw.name,
      description: raw.description,
      createdAt: raw.createdAt
    }
  )
}

export function loadReplaySessions(): EventReplaySession[] {
  if (typeof localStorage === 'undefined') return []

  try {
    const raw = localStorage.getItem(EVENT_REPLAY_SESSIONS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeReplaySession).filter((session) => session.events.length > 0)
  } catch {
    return []
  }
}

export function saveReplaySessions(sessions: EventReplaySession[]): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(EVENT_REPLAY_SESSIONS_KEY, JSON.stringify(sessions))
}

export function formatReplayDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function normalizeReplayEvents(events: EventReplayEvent[]): EventReplayEvent[] {
  return events
    .map(normalizeReplayEvent)
    .filter((event): event is EventReplayEvent => Boolean(event))
    .sort((left, right) => left.offsetMs - right.offsetMs)
    .map((event, index) => ({ ...event, id: event.id || createReplayId(`event-${index}`) }))
}

function normalizeReplayEvent(value: unknown): EventReplayEvent | null {
  const event = value as Partial<EventReplayEvent>
  if (!event?.payload?.type) return null

  return {
    id: typeof event.id === 'string' ? event.id : createReplayId('event'),
    offsetMs: Math.max(0, Math.floor(Number(event.offsetMs) || 0)),
    capturedAt: normalizeDateString(event.capturedAt),
    sourceKind: isEntryKind(event.sourceKind) ? event.sourceKind : 'stream',
    title: cleanText(event.title, 'Replayed event', 100),
    detail: cleanText(event.detail, 'Event replay payload', 180),
    payload: normalizeReplayPayload(event.payload)
  }
}

function normalizeDateString(value: unknown): string {
  const timestamp = parseTimestamp(value)
  return new Date(Number.isFinite(timestamp) ? timestamp : Date.now()).toISOString()
}

function parseTimestamp(value: unknown): number {
  if (value instanceof Date) return value.getTime()
  const timestamp = Date.parse(String(value ?? ''))
  return Number.isFinite(timestamp) ? timestamp : Number.NaN
}

function cleanText(value: unknown, fallback: string, maxLength: number): string {
  const text = String(value ?? '').trim()
  return (text || fallback).slice(0, maxLength)
}

function createReplayId(prefix: string): string {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function isEntryKind(value: unknown): value is EventLabEntryKind {
  return typeof value === 'string' && [
    'stream',
    'overlay',
    'performance',
    'device',
    'automation',
    'alert',
    'sound',
    'tts',
    'spotify',
    'status',
    'system'
  ].includes(value)
}

function isPlatform(value: unknown): value is Platform {
  return typeof value === 'string' && [
    'tiktok',
    'twitch',
    'youtube',
    'kick',
    'x',
    'discord',
    'facebook',
    'instagram',
    'restream',
    'linkedin',
    'telegram'
  ].includes(value)
}
