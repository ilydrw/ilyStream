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

    if (finalPayload.imageUrl) {
      finalPayload.imageUrl = normalizeAlertImageUrl(finalPayload.imageUrl)
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

function normalizeAlertImageUrl(imageUrl: string): string {
  const trimmed = imageUrl.trim()
  if (!trimmed) return ''
  if (/^(https?:|data:|blob:)/i.test(trimmed) || trimmed.startsWith('/')) return trimmed

  const assetId = extractAssetId(trimmed)
  if (!assetId) return trimmed

  return `/assets/${encodeURIComponent(assetId)}`
}

function extractAssetId(value: string): string {
  let candidate = value

  if (candidate.startsWith('asset://')) {
    try {
      const url = new URL(candidate)
      candidate = `${url.hostname}${url.pathname}`
    } catch {
      candidate = candidate.slice('asset://'.length)
    }

    candidate = candidate.replace(/^\/+/, '').replace(/\/+$/, '')
    if (candidate.startsWith('app/')) candidate = candidate.slice(4)
    if (candidate.startsWith('image/')) candidate = candidate.slice(6)
  }

  const assetId = candidate.split(/[\\/]+/).filter(Boolean).pop() || ''
  return safeDecodeURIComponent(assetId)
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
