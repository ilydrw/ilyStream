import type { AnyStreamEvent } from '../../platforms/types'
import type { OverlayFeedItem } from '../../../shared/overlay'
import { eventToOverlayFeedItem, limitHistory } from '../overlay-payloads'
import { CHAT_HISTORY_LIMIT } from '../types'
import type { SSEManager } from '../sse-manager'

const DUPLICATE_WINDOW_MS = 2_500

export class ChatManager {
  private history: OverlayFeedItem[] = []
  private sse: SSEManager
  private deviceApi: any | null = null

  constructor(sse: SSEManager) {
    this.sse = sse
  }

  setDeviceApi(deviceApi: any): void {
    this.deviceApi = deviceApi
  }

  getHistory(): OverlayFeedItem[] {
    return this.history
  }

  handleEvent(event: AnyStreamEvent): void {
    const feedItem = eventToOverlayFeedItem(event)
    if (!feedItem) return

    // Likes are high-volume telemetry; keep them on dedicated like widgets/stats,
    // not in chat-style feeds.
    const allowedKinds = ['chat', 'gift', 'follow', 'subscription', 'raid', 'share']
    if (allowedKinds.includes(feedItem.kind)) {
      if (isDuplicateFeedItem(this.history, feedItem)) return

      this.history = limitHistory([...this.history, feedItem], CHAT_HISTORY_LIMIT)
      this.sse.broadcast('chat', { type: 'append', payload: feedItem })
      this.sse.broadcast('chat-unified', { type: 'append', payload: feedItem })

      // RELAY to DeskThing / LAN devices
      this.deviceApi?.appendChatItem(feedItem)
    }
  }

  broadcastRelay(payload: any): void {
    this.sse.broadcast('chat', { type: 'relay-broadcast', payload })
  }

  broadcastFeature(payload: any): void {
    this.sse.broadcast('chat', { type: 'feature-broadcast', payload })
    this.sse.broadcast('chat-unified', { type: 'feature', payload })
  }

  clearHistory(): void {
    this.history = []
  }
}

function isDuplicateFeedItem(history: OverlayFeedItem[], next: OverlayFeedItem): boolean {
  if (history.some((existing) => existing.id === next.id)) {
    return true
  }

  if (next.kind !== 'chat') {
    return false
  }

  const nextTime = feedItemTime(next)
  const nextFingerprint = feedItemFingerprint(next)

  for (let i = history.length - 1; i >= 0; i--) {
    const existing = history[i]
    if (existing.kind !== 'chat') continue

    const existingTime = feedItemTime(existing)
    if (nextTime - existingTime > DUPLICATE_WINDOW_MS) {
      break
    }

    if (
      Math.abs(nextTime - existingTime) <= DUPLICATE_WINDOW_MS &&
      feedItemFingerprint(existing) === nextFingerprint
    ) {
      return true
    }
  }

  return false
}

function feedItemFingerprint(item: OverlayFeedItem): string {
  return [
    item.kind,
    item.platform,
    item.displayName.trim().toLowerCase(),
    item.message.replace(/\s+/g, ' ').trim()
  ].join('\u001f')
}

function feedItemTime(item: OverlayFeedItem): number {
  const time = Date.parse(item.timestamp)
  return Number.isFinite(time) ? time : Date.now()
}
