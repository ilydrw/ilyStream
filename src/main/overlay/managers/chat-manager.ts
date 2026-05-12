import type { AnyStreamEvent } from '../../platforms/types'
import type { OverlayFeedItem } from '../../../shared/overlay'
import { eventToOverlayFeedItem, limitHistory } from '../overlay-payloads'
import { CHAT_HISTORY_LIMIT } from '../types'
import type { SSEManager } from '../sse-manager'

export class ChatManager {
  private history: OverlayFeedItem[] = []
  private sse: SSEManager

  constructor(sse: SSEManager) {
    this.sse = sse
  }

  getHistory(): OverlayFeedItem[] {
    return this.history.filter(i => !['like', 'share'].includes(i.kind))
  }

  handleEvent(event: AnyStreamEvent): void {
    const feedItem = eventToOverlayFeedItem(event)
    if (!feedItem) return

    // FILTER: Only allow chat, gift, follow, subscription, and raid in the main feed
    const allowedKinds = ['chat', 'gift', 'follow', 'subscription', 'raid']
    if (allowedKinds.includes(feedItem.kind)) {
      this.history = limitHistory([...this.history, feedItem], CHAT_HISTORY_LIMIT)
      this.sse.broadcast('chat', { type: 'append', payload: feedItem })
      this.sse.broadcast('chat-unified', { type: 'append', payload: feedItem })
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
