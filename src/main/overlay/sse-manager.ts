import type { IncomingMessage, ServerResponse } from 'http'
import { SSE_EVENT_HISTORY_LIMIT, SSE_PING_INTERVAL_MS, type OverlayChannel, type SseClient } from './types'
import { writeToSseClient } from './sse-backpressure'

export interface SseEventHistoryEntry {
  id: number
  payload: unknown
  at: number
}

export class SSEManager {
  private channels = new Map<OverlayChannel, Set<SseClient>>()
  private lastPayloads = new Map<OverlayChannel, unknown>()
  private histories = new Map<OverlayChannel, SseEventHistoryEntry[]>()
  private eventSequence = 0
  private pingTimer: NodeJS.Timeout | null = null
  private onCountsChanged?: () => void
  private onBroadcast?: (
    channel: OverlayChannel,
    payload: unknown,
    clientCount: number,
    eventId: number
  ) => void

  constructor(
    onCountsChanged?: () => void,
    onBroadcast?: (
      channel: OverlayChannel,
      payload: unknown,
      clientCount: number,
      eventId: number
    ) => void
  ) {
    this.onCountsChanged = onCountsChanged
    this.onBroadcast = onBroadcast
  }

  attachClient(
    channel: OverlayChannel,
    request: IncomingMessage,
    response: ServerResponse,
    headers: Record<string, string> = {}
  ): void {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      ...headers
    })

    response.write(': connected\n\n')

    const clients = this.getOrCreateChannel(channel)
    clients.add(response)
    this.onCountsChanged?.()

    request.on('close', () => {
      clients.delete(response)
      this.onCountsChanged?.()
      try { response.end() } catch {}
    })
  }

  broadcast(channel: OverlayChannel, payload: unknown): void {
    const clients = this.channels.get(channel)
    const clientCount = clients?.size || 0
    const serialized = serializeSsePayload(payload)
    const eventId = ++this.eventSequence
    this.lastPayloads.set(channel, serialized.payload)
    this.recordHistory(channel, {
      id: eventId,
      payload: serialized.payload,
      at: Date.now()
    })

    try {
      this.onBroadcast?.(channel, serialized.payload, clientCount, eventId)
    } catch (err) {
      console.warn('[SSEManager] overlay broadcast diagnostics failed:', err instanceof Error ? err.message : String(err))
    }

    if (!clients) return

    const data = `id: ${eventId}\ndata: ${serialized.json}\n\n`
    for (const client of [...clients]) {
      if (!writeToSseClient(client, data, `channel:${channel}`)) {
        clients.delete(client)
      }
    }
    this.onCountsChanged?.()
  }

  broadcastToAll(payload: unknown): void {
    const data = `data: ${serializeSsePayload(payload).json}\n\n`
    for (const [channel, clients] of this.channels) {
      for (const client of [...clients]) {
        if (!writeToSseClient(client, data, `channel:${channel}`)) {
          clients.delete(client)
        }
      }
    }
    this.onCountsChanged?.()
  }

  startPingLoop(): void {
    this.stopPingLoop()
    this.pingTimer = setInterval(() => {
      for (const [channel, clients] of this.channels) {
        for (const client of [...clients]) {
          if (!writeToSseClient(client, ': ping\n\n', `channel:${channel}`)) {
            clients.delete(client)
          }
        }
      }
      this.onCountsChanged?.()
    }, SSE_PING_INTERVAL_MS)
  }

  stopPingLoop(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  closeAll(): void {
    this.stopPingLoop()
    for (const clients of this.channels.values()) {
      for (const client of clients) {
        try { client.end() } catch {}
      }
      clients.clear()
    }
    this.onCountsChanged?.()
  }

  clearState(channels?: OverlayChannel[]): void {
    if (!channels) {
      this.lastPayloads.clear()
      this.histories.clear()
      return
    }

    for (const channel of channels) {
      this.lastPayloads.delete(channel)
      this.histories.delete(channel)
    }
  }

  getClientCount(channel: OverlayChannel): number {
    return this.channels.get(channel)?.size || 0
  }

  getLastPayload(channel: OverlayChannel): unknown {
    return this.lastPayloads.get(channel) ?? null
  }

  getLastEventId(channel: OverlayChannel): number {
    const history = this.histories.get(channel)
    return history?.[history.length - 1]?.id ?? 0
  }

  getFirstEventId(channel: OverlayChannel): number {
    const history = this.histories.get(channel)
    return history?.[0]?.id ?? 0
  }

  getEventsSince(channel: OverlayChannel, afterId: number, limit = 50): SseEventHistoryEntry[] {
    const safeAfterId = Number.isFinite(afterId) ? Math.max(0, Math.floor(afterId)) : 0
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(120, Math.floor(limit))) : 50
    const history = this.histories.get(channel) || []
    // Return the oldest unseen page. Taking the newest page silently skipped
    // events whenever more than `safeLimit` entries accumulated during an
    // outage, because the caller advanced its cursor past the omitted tail.
    return history.filter((entry) => entry.id > safeAfterId).slice(0, safeLimit)
  }

  private getOrCreateChannel(channel: OverlayChannel): Set<SseClient> {
    let clients = this.channels.get(channel)
    if (!clients) {
      clients = new Set()
      this.channels.set(channel, clients)
    }
    return clients
  }

  private recordHistory(channel: OverlayChannel, entry: SseEventHistoryEntry): void {
    const history = this.histories.get(channel) || []
    history.push(entry)
    if (history.length > SSE_EVENT_HISTORY_LIMIT) {
      history.splice(0, history.length - SSE_EVENT_HISTORY_LIMIT)
    }
    this.histories.set(channel, history)
  }
}

function serializeSsePayload(payload: unknown): { json: string; payload: unknown } {
  try {
    const json = JSON.stringify(payload, createOverlayJsonReplacer()) ?? 'null'
    return { json, payload: JSON.parse(json) }
  } catch (err) {
    const fallback = {
      type: 'serialization-error',
      message: err instanceof Error ? err.message : String(err)
    }
    return { json: JSON.stringify(fallback), payload: fallback }
  }
}

function createOverlayJsonReplacer(): (key: string, value: unknown) => unknown {
  const seen = new WeakSet<object>()

  return (key: string, value: unknown) => {
    if (key === 'raw') return undefined
    if (typeof value === 'bigint') return value.toString()
    if (typeof value === 'function' || typeof value === 'symbol') return undefined
    if (value instanceof Error) {
      return { name: value.name, message: value.message, stack: value.stack }
    }
    if (value && typeof value === 'object') {
      if (seen.has(value)) return undefined
      seen.add(value)
    }
    return value
  }
}
