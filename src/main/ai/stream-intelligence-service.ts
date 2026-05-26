import type { AnyStreamEvent, ChatEvent, Platform } from '../platforms/types'
import type {
  StreamInsightPlatformBreakdown,
  StreamInsightSnapshot,
  StreamInsightTopChatter
} from '../../shared/stream-insights'

const DEFAULT_WINDOW_MS = 5 * 60 * 1000
const MAX_BUFFERED_EVENTS = 1500
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'you', 'are', 'but', 'with', 'that', 'this', 'was', 'have',
  'just', 'what', 'when', 'where', 'why', 'how', 'can', 'get', 'got', 'lol', 'lmao',
  'im', 'i', 'me', 'my', 'we', 'us', 'our', 'it', 'is', 'to', 'of', 'in', 'on'
])

interface BufferedEvent {
  event: AnyStreamEvent
  timestampMs: number
}

export class StreamIntelligenceService {
  private events: BufferedEvent[] = []

  recordEvent(event: AnyStreamEvent): void {
    const timestampMs = normalizeTimestamp(event.timestamp)
    this.events.push({ event, timestampMs })
    this.prune(Date.now())
  }

  getInsights(windowMs = DEFAULT_WINDOW_MS): StreamInsightSnapshot {
    const now = Date.now()
    this.prune(now)

    const windowStart = now - windowMs
    const recent = this.events.filter((entry) => entry.timestampMs >= windowStart)
    const chatEvents = recent
      .map((entry) => entry.event)
      .filter((event): event is ChatEvent => event.type === 'chat')
    const chatCount = chatEvents.length
    const chatPerMinute = roundToOne(chatCount / Math.max(1, windowMs / 60_000))
    const activeViewers = countUniqueUsers(recent.map((entry) => entry.event))
    const topTerms = getTopTerms(chatEvents)
    const topChatters = getTopChatters(chatEvents)
    const platformBreakdown = getPlatformBreakdown(recent.map((entry) => entry.event))
    const trend = chatPerMinute >= 12 ? 'busy' : chatPerMinute >= 3 ? 'steady' : 'quiet'

    return {
      generatedAt: new Date(now).toISOString(),
      windowSeconds: Math.round(windowMs / 1000),
      eventCount: recent.length,
      chatCount,
      chatPerMinute,
      activeViewers,
      topTerms,
      topChatters,
      platformBreakdown,
      recommendation: buildRecommendation({ chatCount, chatPerMinute, topTerms, topChatters, recent }),
      trend
    }
  }

  private prune(now: number): void {
    const cutoff = now - DEFAULT_WINDOW_MS * 2
    if (this.events.length > MAX_BUFFERED_EVENTS) {
      this.events = this.events.slice(-MAX_BUFFERED_EVENTS)
    }
    this.events = this.events.filter((entry) => entry.timestampMs >= cutoff)
  }
}

function normalizeTimestamp(value: Date | string | number): number {
  const timestampMs = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(timestampMs) ? timestampMs : Date.now()
}

function countUniqueUsers(events: AnyStreamEvent[]): number {
  const users = new Set<string>()
  for (const event of events) {
    if ('user' in event) {
      users.add(`${event.platform}:${event.user.username.toLowerCase()}`)
    }
  }
  return users.size
}

function getTopTerms(chatEvents: ChatEvent[]): string[] {
  const counts = new Map<string, number>()

  for (const event of chatEvents) {
    const words = event.message
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[^a-z0-9_! ]/g, ' ')
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 3 && !word.startsWith('!') && !STOP_WORDS.has(word))

    for (const word of words) {
      counts.set(word, (counts.get(word) || 0) + 1)
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([word]) => word)
}

function getTopChatters(chatEvents: ChatEvent[]): StreamInsightTopChatter[] {
  const counts = new Map<string, StreamInsightTopChatter>()

  for (const event of chatEvents) {
    const key = `${event.platform}:${event.user.username.toLowerCase()}`
    const existing = counts.get(key)
    if (existing) {
      existing.count += 1
    } else {
      counts.set(key, {
        username: event.user.username,
        displayName: event.user.displayName || event.user.username,
        platform: event.platform,
        count: 1
      })
    }
  }

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count || a.displayName.localeCompare(b.displayName))
    .slice(0, 5)
}

function getPlatformBreakdown(events: AnyStreamEvent[]): StreamInsightPlatformBreakdown[] {
  const counts = new Map<Platform, number>()

  for (const event of events) {
    counts.set(event.platform, (counts.get(event.platform) || 0) + 1)
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([platform, count]) => ({ platform, count }))
}

function buildRecommendation(input: {
  chatCount: number
  chatPerMinute: number
  topTerms: string[]
  topChatters: StreamInsightTopChatter[]
  recent: BufferedEvent[]
}): string {
  const giftCount = input.recent.filter((entry) => entry.event.type === 'gift').length
  const followCount = input.recent.filter((entry) => entry.event.type === 'follow').length

  if (input.chatCount === 0) {
    return 'Chat is quiet. Ask a simple either-or question and pin the next response as a callout.'
  }

  if (input.chatPerMinute >= 12) {
    return 'Chat is moving fast. Hold AI replies back and surface the top chatter or most repeated topic.'
  }

  if (giftCount > 0) {
    return 'Recent gifts landed. Trigger a short thank-you loop or highlight the sender before the moment fades.'
  }

  if (followCount > 0) {
    return 'New follows are coming in. A lightweight welcome recipe would keep the room warm without crowding chat.'
  }

  if (input.topTerms[0]) {
    return `People are circling "${input.topTerms[0]}". Ask a follow-up or let AI draft a one-line prompt about it.`
  }

  if (input.topChatters[0]) {
    return `${input.topChatters[0].displayName} is carrying chat. Consider a direct shoutout or points bonus.`
  }

  return 'Engagement is steady. Keep automations sparse and save the big effects for gifts, raids, or level-ups.'
}

function roundToOne(value: number): number {
  return Math.round(value * 10) / 10
}
