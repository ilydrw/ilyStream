import type { IncomingMessage, Server } from 'http'
import { WebSocket, WebSocketServer, type RawData } from 'ws'
import { isOverlayChannel, SSE_EVENT_HISTORY_LIMIT, type OverlayChannel } from './types'

const MAX_CLIENTS = 64
const MAX_MESSAGE_BYTES = 32 * 1024
const MAX_BUFFERED_BYTES = 2 * 1024 * 1024
const HEARTBEAT_INTERVAL_MS = 15_000

interface ReplayResult {
  events: Array<{ id: number; data: unknown }>
  cursor: number
  generation: string
  reset: boolean
}

interface ClientState {
  socket: WebSocket
  subscriptions: Map<string, OverlayChannel>
  alive: boolean
}

type ReplayProvider = (
  channel: OverlayChannel,
  options: { after?: number; sinceAt?: number; limit?: number }
) => ReplayResult

export interface OverlayPaintReceipt {
  kind: 'paint'
  channel: OverlayChannel
  eventId: number
  subscriptionId: string
  transport: string
  widgetId?: string
  widgetType?: string
  sourceKind?: string
  broadcastAt: string
  receivedAt: string
  paintedAt: string
  acknowledgedAt: string
  deliveryMs: number
  paintMs: number
  roundTripMs: number
}

/**
 * Multiplexed low-latency overlay transport. It is deliberately additive:
 * browser runtimes fall back to the existing SSE/history/polling stack when a
 * WebSocket or SharedWorker is unavailable.
 */
export class OverlayWebSocketManager {
  private readonly server: Server
  private readonly webSocketServer = new WebSocketServer({
    noServer: true,
    clientTracking: false,
    maxPayload: MAX_MESSAGE_BYTES
  })
  private readonly clients = new Set<ClientState>()
  private readonly getReplay: ReplayProvider
  private readonly onReceipt?: (receipt: OverlayPaintReceipt) => void
  private readonly onCountsChanged?: () => void
  private readonly measuredBroadcasts = new Map<string, number>()
  private readonly channelBroadcastCounts = new Map<OverlayChannel, number>()
  private heartbeatTimer: NodeJS.Timeout | null = null

  constructor(
    server: Server,
    getReplay: ReplayProvider,
    onReceipt?: (receipt: OverlayPaintReceipt) => void,
    onCountsChanged?: () => void
  ) {
    this.server = server
    this.getReplay = getReplay
    this.onReceipt = onReceipt
    this.onCountsChanged = onCountsChanged
    this.server.on('upgrade', this.handleUpgrade)
    this.webSocketServer.on('connection', this.handleConnection)
    this.heartbeatTimer = setInterval(() => this.heartbeat(), HEARTBEAT_INTERVAL_MS)
    this.heartbeatTimer.unref?.()
  }

  getClientCount(): number {
    return this.clients.size
  }

  getSubscriptionCount(channel: OverlayChannel): number {
    let count = 0
    for (const client of this.clients) {
      for (const subscribedChannel of client.subscriptions.values()) {
        if (subscribedChannel === channel) count += 1
      }
    }
    return count
  }

  broadcast(channel: OverlayChannel, payload: unknown, eventId: number): void {
    if (!this.hasSubscribers(channel)) return
    const count = (this.channelBroadcastCounts.get(channel) || 0) + 1
    this.channelBroadcastCounts.set(channel, count)
    const hotChannel = channel === 'likes' || channel === 'chat' ||
      channel === 'chat-unified' || channel === 'leaderboard' || channel === 'deck'
    const measure = !hotChannel || count === 1 || count % 10 === 0
    if (measure) this.rememberMeasuredBroadcast(channel, eventId)
    const data = JSON.stringify({
      type: 'event',
      channel,
      id: eventId,
      data: payload,
      measure
    })
    for (const client of this.clients) {
      if (!this.clientHasChannel(client, channel)) continue
      this.send(client, data)
    }
  }

  close(): void {
    this.server.off('upgrade', this.handleUpgrade)
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    for (const client of this.clients) {
      try { client.socket.close(1001, 'overlay server stopping') } catch {}
      try { client.socket.terminate() } catch {}
    }
    this.clients.clear()
    this.onCountsChanged?.()
    try { this.webSocketServer.close() } catch {}
  }

  private handleUpgrade = (request: IncomingMessage, socket: any, head: Buffer): void => {
    let pathname = ''
    try { pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname } catch {}
    if (pathname !== '/overlay/ws') {
      socket.destroy()
      return
    }
    if (this.clients.size >= MAX_CLIENTS) {
      socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    this.webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      this.webSocketServer.emit('connection', webSocket, request)
    })
  }

  private handleConnection = (socket: WebSocket): void => {
    const client: ClientState = {
      socket,
      subscriptions: new Map(),
      alive: true
    }
    this.clients.add(client)
    this.onCountsChanged?.()
    socket.on('pong', () => { client.alive = true })
    socket.on('message', (data) => this.handleMessage(client, data))
    socket.on('close', () => this.removeClient(client))
    socket.on('error', () => this.removeClient(client))
    this.send(client, JSON.stringify({ type: 'hello', protocol: 1 }))
  }

  private handleMessage(client: ClientState, raw: RawData): void {
    let message: any
    try {
      const text = typeof raw === 'string' ? raw : raw.toString()
      if (Buffer.byteLength(text) > MAX_MESSAGE_BYTES) return
      message = JSON.parse(text)
    } catch {
      return
    }

    if (message?.type === 'unsubscribe') {
      const subscriptionId = normalizeSubscriptionId(message.subscriptionId)
      if (subscriptionId && client.subscriptions.delete(subscriptionId)) this.onCountsChanged?.()
      return
    }
    if (message?.type === 'receipt') {
      this.handleReceipt(client, message)
      return
    }
    if (message?.type !== 'subscribe') return

    const subscriptionId = normalizeSubscriptionId(message.subscriptionId)
    const channel = typeof message.channel === 'string' ? message.channel.trim() : ''
    if (!subscriptionId || !isOverlayChannel(channel)) return
    const previousChannel = client.subscriptions.get(subscriptionId)
    client.subscriptions.set(subscriptionId, channel)
    if (previousChannel !== channel) this.onCountsChanged?.()

    const replay = this.getReplay(channel, {
      after: Number(message.after) || 0,
      sinceAt: Number(message.sinceAt) || 0,
      // A WebSocket subscription receives one synchronous replay before live
      // fan-out starts, so include the complete bounded history. Polling can
      // page; a live socket cannot safely leave a partial tail behind.
      limit: SSE_EVENT_HISTORY_LIMIT
    })
    this.send(client, JSON.stringify({
      type: 'subscribed',
      subscriptionId,
      channel,
      cursor: replay.cursor,
      generation: replay.generation,
      reset: replay.reset
    }))
    for (const event of replay.events) {
      this.send(client, JSON.stringify({
        type: 'event',
        subscriptionId,
        channel,
        id: event.id,
        data: event.data,
        generation: replay.generation,
        reset: replay.reset
      }))
    }
  }

  private heartbeat(): void {
    for (const client of this.clients) {
      if (!client.alive) {
        try { client.socket.terminate() } catch {}
        this.removeClient(client)
        continue
      }
      client.alive = false
      try { client.socket.ping() } catch {
        try { client.socket.terminate() } catch {}
        this.removeClient(client)
      }
    }
  }

  private rememberMeasuredBroadcast(channel: OverlayChannel, eventId: number): void {
    this.measuredBroadcasts.set(`${channel}:${eventId}`, Date.now())
    while (this.measuredBroadcasts.size > 512) {
      const oldest = this.measuredBroadcasts.keys().next().value
      if (typeof oldest !== 'string') break
      this.measuredBroadcasts.delete(oldest)
    }
  }

  private handleReceipt(client: ClientState, message: any): void {
    const channel = typeof message.channel === 'string' ? message.channel : ''
    const eventId = Math.max(0, Math.floor(Number(message.eventId) || 0))
    const subscriptionId = normalizeSubscriptionId(message.subscriptionId)
    if (!isOverlayChannel(channel) || !eventId || !subscriptionId) return
    if (client.subscriptions.get(subscriptionId) !== channel) return
    const key = `${channel}:${eventId}`
    const broadcastAtMs = this.measuredBroadcasts.get(key)
    if (!broadcastAtMs) return

    const acknowledgedAtMs = Date.now()
    const receivedAtMs = normalizeReceiptTime(message.receivedAt, broadcastAtMs, acknowledgedAtMs)
    const paintedAtMs = normalizeReceiptTime(message.paintedAt, receivedAtMs, acknowledgedAtMs + 1_000)
    try {
      this.onReceipt?.({
        kind: 'paint',
        channel,
        eventId,
        subscriptionId,
        transport: String(message.transport || 'websocket').slice(0, 64),
        widgetId: cleanOptionalText(message.widgetId),
        widgetType: cleanOptionalText(message.widgetType),
        sourceKind: cleanOptionalText(message.sourceKind),
        broadcastAt: new Date(broadcastAtMs).toISOString(),
        receivedAt: new Date(receivedAtMs).toISOString(),
        paintedAt: new Date(paintedAtMs).toISOString(),
        acknowledgedAt: new Date(acknowledgedAtMs).toISOString(),
        deliveryMs: Math.max(0, receivedAtMs - broadcastAtMs),
        paintMs: Math.max(0, paintedAtMs - broadcastAtMs),
        roundTripMs: Math.max(0, acknowledgedAtMs - broadcastAtMs)
      })
    } catch {}
  }

  private send(client: ClientState, data: string): boolean {
    if (client.socket.readyState !== WebSocket.OPEN) return false
    if (client.socket.bufferedAmount > MAX_BUFFERED_BYTES) {
      try { client.socket.terminate() } catch {}
      this.removeClient(client)
      return false
    }
    try {
      client.socket.send(data)
      return true
    } catch {
      try { client.socket.terminate() } catch {}
      this.removeClient(client)
      return false
    }
  }

  private hasSubscribers(channel: OverlayChannel): boolean {
    for (const client of this.clients) {
      if (this.clientHasChannel(client, channel)) return true
    }
    return false
  }

  private clientHasChannel(client: ClientState, channel: OverlayChannel): boolean {
    for (const subscribedChannel of client.subscriptions.values()) {
      if (subscribedChannel === channel) return true
    }
    return false
  }

  private removeClient(client: ClientState): void {
    if (!this.clients.delete(client)) return
    this.onCountsChanged?.()
  }
}

function normalizeSubscriptionId(value: unknown): string | null {
  const id = typeof value === 'string' ? value.trim() : ''
  return id && id.length <= 96 ? id : null
}

function normalizeReceiptTime(value: unknown, min: number, max: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.floor(parsed))) : min
}

function cleanOptionalText(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim().slice(0, 128) : ''
  return text || undefined
}
