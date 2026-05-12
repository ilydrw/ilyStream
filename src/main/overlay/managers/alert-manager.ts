import type { OverlayAlertItem } from '../../../shared/overlay'
import { createOverlayAlertItem, limitHistory } from '../overlay-payloads'
import { ALERT_HISTORY_LIMIT } from '../types'
import type { SSEManager } from '../sse-manager'
import { EventEmitter } from 'events'

export class AlertManager extends EventEmitter {
  private history: OverlayAlertItem[] = []
  private sse: SSEManager

  constructor(sse: SSEManager) {
    super()
    this.sse = sse
  }

  getHistory(): OverlayAlertItem[] {
    return this.history
  }

  pushAlert(payload: Partial<OverlayAlertItem>, platform: string): void {
    const finalPayload = { ...payload }

    if (finalPayload.audioUrl && !finalPayload.audioUrl.startsWith('http') && !finalPayload.audioUrl.startsWith('data:')) {
      if (!finalPayload.audioUrl.startsWith('/')) {
        if (finalPayload.audioUrl.startsWith('alerts/') || finalPayload.audioUrl.startsWith('board/')) {
          finalPayload.audioUrl = `/sounds/${finalPayload.audioUrl}`
        } else {
          finalPayload.audioUrl = `/sounds/alerts/${finalPayload.audioUrl}`
        }
      }
    }

    const alertItem = createOverlayAlertItem(finalPayload as any, platform)
    this.history = limitHistory([...this.history, alertItem], ALERT_HISTORY_LIMIT)
    this.sse.broadcast('alerts', { type: 'append', payload: alertItem })
    this.emit('show-alert', alertItem)
  }

  clearHistory(): void {
    this.history = []
  }
}
