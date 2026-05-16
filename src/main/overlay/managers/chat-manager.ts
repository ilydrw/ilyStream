import type { AnyStreamEvent } from '../../platforms/types'
import type { OverlayFeedItem } from '../../../shared/overlay'
import { eventToOverlayFeedItem, limitHistory } from '../overlay-payloads'
import { CHAT_HISTORY_LIMIT } from '../types'
import type { SSEManager } from '../sse-manager'

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

    // FILTER: Allow common stream events in the main feed
    const allowedKinds = ['chat', 'gift', 'follow', 'subscription', 'raid', 'like', 'share']
    if (allowedKinds.includes(feedItem.kind)) {
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
