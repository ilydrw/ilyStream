import { EventEmitter } from 'events'
import WebSocket from 'ws'
import type { AnyStreamEvent } from '../platforms/types'
import type { AutomationRunReceipt } from '../../shared/automation-receipts'
import type { AppSettings } from '../../shared/app-settings'

const DEFAULT_ACTION_NAME = 'ilyStream Event'
const RECEIPT_ACTION_NAME = 'ilyStream Automation Receipt'
const MAX_PENDING_PAYLOADS = 50

export interface StreamerbotBridgeStatus {
  enabled: boolean
  connected: boolean
  wsUrl: string
  lastError?: string
}

type StreamerbotSettings = AppSettings['integrations']['streamerbot']

export class StreamerbotBridgeService extends EventEmitter {
  private socket: WebSocket | null = null
  private settings: StreamerbotSettings = { enabled: false, wsUrl: 'ws://127.0.0.1:8080' }
  private reconnectTimer: NodeJS.Timeout | null = null
  private pendingPayloads: unknown[] = []
  private status: StreamerbotBridgeStatus = {
    enabled: false,
    connected: false,
    wsUrl: 'ws://127.0.0.1:8080'
  }

  applySettings(settings: StreamerbotSettings): void {
    const nextSettings = {
      enabled: Boolean(settings?.enabled),
      wsUrl: normalizeWsUrl(settings?.wsUrl)
    }
    const changed = nextSettings.enabled !== this.settings.enabled || nextSettings.wsUrl !== this.settings.wsUrl
    this.settings = nextSettings
    this.setStatus({ enabled: nextSettings.enabled, wsUrl: nextSettings.wsUrl })

    if (!nextSettings.enabled) {
      this.disconnect()
      return
    }

    if (changed || !this.socket) {
      this.connect()
    }
  }

  getStatus(): StreamerbotBridgeStatus {
    return { ...this.status }
  }

  forwardEvent(event: AnyStreamEvent): void {
    this.sendPayload(createStreamerbotEventPayload(event))
  }

  forwardAutomationReceipt(receipt: AutomationRunReceipt): void {
    this.sendPayload(createStreamerbotReceiptPayload(receipt))
  }

  dispose(): void {
    this.settings = { ...this.settings, enabled: false }
    this.disconnect()
    this.removeAllListeners()
  }

  private connect(): void {
    this.disconnect()
    if (!this.settings.enabled) return

    try {
      const socket = new WebSocket(this.settings.wsUrl)
      this.socket = socket

      socket.on('open', () => {
        this.setStatus({ connected: true, lastError: undefined })
        this.flushPendingPayloads()
      })

      socket.on('error', (error) => {
        this.setStatus({ connected: false, lastError: error.message })
      })

      socket.on('close', () => {
        this.socket = null
        this.setStatus({ connected: false })
        if (this.settings.enabled) {
          this.scheduleReconnect()
        }
      })
    } catch (error) {
      this.setStatus({
        connected: false,
        lastError: error instanceof Error ? error.message : 'Could not connect to Streamer.bot.'
      })
      this.scheduleReconnect()
    }
  }

  private disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.socket) {
      const socket = this.socket
      this.socket = null
      try {
        socket.close()
      } catch {
        // Socket is already gone.
      }
    }
    this.setStatus({ connected: false })
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.settings.enabled) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, 5000)
  }

  private sendPayload(payload: unknown): void {
    if (!this.settings.enabled) return

    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.pendingPayloads.push(payload)
      if (this.pendingPayloads.length > MAX_PENDING_PAYLOADS) {
        this.pendingPayloads = this.pendingPayloads.slice(-MAX_PENDING_PAYLOADS)
      }
      if (!this.socket) this.connect()
      return
    }

    this.socket.send(JSON.stringify(payload))
  }

  private flushPendingPayloads(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
    const payloads = this.pendingPayloads.splice(0)
    for (const payload of payloads) {
      this.socket.send(JSON.stringify(payload))
    }
  }

  private setStatus(partial: Partial<StreamerbotBridgeStatus>): void {
    this.status = {
      ...this.status,
      ...partial,
      enabled: partial.enabled ?? this.settings.enabled,
      wsUrl: partial.wsUrl ?? this.settings.wsUrl
    }
    this.emit('status', this.getStatus())
  }
}

export function createStreamerbotEventPayload(event: AnyStreamEvent): unknown {
  const user = 'user' in event ? event.user : undefined

  return {
    request: 'DoAction',
    id: `ilystream-event-${event.id}`,
    action: { name: DEFAULT_ACTION_NAME },
    args: {
      source: 'ilyStream',
      eventId: event.id,
      eventType: event.type,
      platform: event.platform,
      username: user?.username,
      displayName: user?.displayName,
      message: 'message' in event ? event.message : undefined,
      giftName: 'giftName' in event ? event.giftName : undefined,
      giftCount: 'giftCount' in event ? event.giftCount : undefined,
      monetaryValue: 'monetaryValue' in event ? event.monetaryValue : undefined,
      viewerCount: 'viewerCount' in event ? event.viewerCount : undefined,
      timestamp: event.timestamp instanceof Date ? event.timestamp.toISOString() : event.timestamp
    }
  }
}

export function createStreamerbotReceiptPayload(receipt: AutomationRunReceipt): unknown {
  return {
    request: 'DoAction',
    id: `ilystream-automation-${receipt.id}`,
    action: { name: RECEIPT_ACTION_NAME },
    args: {
      source: 'ilyStream',
      receiptId: receipt.id,
      eventId: receipt.eventId,
      eventType: receipt.eventType,
      platform: receipt.platform,
      matchedRules: receipt.matchedRules,
      actionsRan: receipt.actionsRan,
      actionsFailed: receipt.actionsFailed,
      durationMs: receipt.durationMs
    }
  }
}

function normalizeWsUrl(value: unknown): string {
  const raw = String(value || '').trim()
  if (!raw) return 'ws://127.0.0.1:8080'
  if (raw.startsWith('ws://') || raw.startsWith('wss://')) return raw
  if (raw.startsWith('http://')) return raw.replace(/^http:\/\//, 'ws://')
  if (raw.startsWith('https://')) return raw.replace(/^https:\/\//, 'wss://')
  return `ws://${raw}`
}
