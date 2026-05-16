import type { IncomingMessage, ServerResponse } from 'http'
import { SSE_PING_INTERVAL_MS, type OverlayChannel, type SseClient } from './types'

export class SSEManager {
  private channels = new Map<OverlayChannel, Set<SseClient>>()
  private pingTimer: NodeJS.Timeout | null = null
  private onCountsChanged?: () => void

  constructor(onCountsChanged?: () => void) {
    this.onCountsChanged = onCountsChanged
  }

  attachClient(channel: OverlayChannel, request: IncomingMessage, response: ServerResponse): void {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
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
    if (!clients) return

    const data = `data: ${JSON.stringify(payload)}\n\n`
    for (const client of [...clients]) {
      try {
        client.write(data)
      } catch {
        clients.delete(client)
      }
    }
    this.onCountsChanged?.()
  }

  broadcastToAll(payload: unknown): void {
    const data = `data: ${JSON.stringify(payload)}\n\n`
    for (const clients of this.channels.values()) {
      for (const client of [...clients]) {
        try {
          client.write(data)
        } catch {
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
          try {
            client.write(': ping\n\n')
          } catch {
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

  getClientCount(channel: OverlayChannel): number {
    return this.channels.get(channel)?.size || 0
  }

  private getOrCreateChannel(channel: OverlayChannel): Set<SseClient> {
    let clients = this.channels.get(channel)
    if (!clients) {
      clients = new Set()
      this.channels.set(channel, clients)
    }
    return clients
  }
}
