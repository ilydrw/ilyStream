import type { OverlayAlertItem } from '../../../shared/overlay'
import { createOverlayAlertItem, limitHistory } from '../overlay-payloads'
import { ALERT_HISTORY_LIMIT } from '../types'
import type { SSEManager } from '../sse-manager'
import { EventEmitter } from 'events'

type OverlayAlertPayload = Parameters<typeof createOverlayAlertItem>[0]

// OBS and StreamElements keep browser-source media cached across page refreshes.
// Give local alert media a fresh identity on every ilyStream launch so an old
// failed response or replaced user asset cannot survive an app restart.
const LOCAL_ALERT_MEDIA_VERSION = Date.now().toString(36)

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

  pushAlert(payload: Partial<OverlayAlertPayload>, platform: string): void {
    const finalPayload = { ...payload }

    if (finalPayload.audioUrl && !finalPayload.audioUrl.startsWith('http') && !finalPayload.audioUrl.startsWith('data:')) {
      if (!finalPayload.audioUrl.startsWith('/')) {
        if (/^(alerts|board|join)\//.test(finalPayload.audioUrl)) {
          finalPayload.audioUrl = `/sounds/${finalPayload.audioUrl}`
        } else {
          finalPayload.audioUrl = `/sounds/alerts/${finalPayload.audioUrl}`
        }
      }
      finalPayload.audioUrl = versionLocalAlertMediaUrl(finalPayload.audioUrl)
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
  if (/^(https?:|data:|blob:)/i.test(trimmed)) return trimmed
  if (trimmed.startsWith('/')) return versionLocalAlertMediaUrl(trimmed)

  const assetId = extractAssetId(trimmed)
  if (!assetId) return trimmed

  return versionLocalAlertMediaUrl(`/assets/${encodeURIComponent(assetId)}`)
}

function versionLocalAlertMediaUrl(url: string): string {
  if (!url.startsWith('/assets/') && !url.startsWith('/sounds/')) return url

  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}v=${LOCAL_ALERT_MEDIA_VERSION}`
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
