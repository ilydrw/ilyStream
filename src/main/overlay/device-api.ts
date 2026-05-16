import type { IncomingMessage, ServerResponse } from 'http'
import { randomInt } from 'crypto'
import type { Database } from '../db/database'
import type { SoundboardService } from '../soundboard/soundboard-service'
import type { RemoteAuthService } from '../services/remote-auth-service'
import type {
  DeviceCatalog,
  DeviceCatalogAction,
  DeviceCatalogSound,
  PairCode,
  PairedDevice
} from '../../shared/device-api'

const PAIR_CODE_TTL_MS = 5 * 60_000 // 5 minutes (increased from 60s)
const SERVER_VERSION = '1'
const MAX_BODY_BYTES = 64 * 1024
const SSE_PING_INTERVAL_MS = 25_000
const PAIR_RATE_LIMIT_WINDOW_MS = 5 * 60_000
const PAIR_RATE_LIMIT_MAX_ATTEMPTS = 10

interface PendingPairCode {
  code: string
  expiresAt: number
}

/** Live state event types pushed to /api/v1/events subscribers. */
export type DeviceEventType =
  | 'nowPlaying'
  | 'ttsState'
  | 'soundPlayed'
  | 'goals'
  | 'chatAppend'
  | 'chatBacklog'
  | 'recordingState'
  | 'viewerCount'
  | 'likes'

interface DeviceEventEnvelope {
  type: DeviceEventType
  payload: unknown
}

/** Cap on the chat backlog replayed to newly-connected devices. */
const CHAT_BUFFER_LIMIT = 50

/**
 * Handles the /api/v1/* HTTP surface used by the DeskThing client and any
 * future LAN device clients. Owned by the OverlayServer, but kept in its own
 * module so the routing logic doesn't bloat overlay-server.ts further.
 */
export class DeviceApi {
  /**
   * Pending pair codes are stored only in memory — they're short-lived (60s)
   * and never need to survive a restart. Kept as an array because there will
   * usually be 0 or 1 active codes at a time.
   */
  private pendingCodes: PendingPairCode[] = []
  private pairAttempts = new Map<string, { count: number; resetAt: number }>()

  /** SSE subscribers for `/api/v1/events`. */
  private eventClients = new Set<ServerResponse<IncomingMessage>>()

  /** Latest snapshot of each event type, replayed to new SSE subscribers. */
  private latestState: Partial<Record<DeviceEventType, unknown>> = {}

  /**
   * Rolling buffer of the most recent chat-feed items, sent verbatim as a
   * `chatBacklog` snapshot to new subscribers so they have context the moment
   * they connect. Individual messages still arrive as `chatAppend` events.
   */
  private chatBuffer: unknown[] = []

  private pingTimer: NodeJS.Timeout | null = null

  constructor(
    private db: Database,
    private soundboardService: SoundboardService,
    private authService: RemoteAuthService,
    /** Emits 'deck-action' to forward to the EventOrchestrator. */
    private emitDeckAction: (action: { type: string; payload?: unknown }) => void
  ) {}

  /**
   * Push a live state event to every connected device. Called by OverlayServer
   * (now-playing, TTS state, sound-played) so devices stay in sync without
   * polling the catalog.
   */
  broadcast(type: DeviceEventType, payload: unknown): void {
    // chatAppend is high-volume — we don't store it in `latestState` because
    // replay happens through the chatBacklog buffer instead.
    if (type !== 'chatAppend') {
      this.latestState[type] = payload
    }
    const envelope: DeviceEventEnvelope = { type, payload }
    const data = `data: ${JSON.stringify(envelope)}\n\n`
    for (const client of [...this.eventClients]) {
      try {
        client.write(data)
      } catch {
        this.eventClients.delete(client)
      }
    }
  }

  /**
   * Buffer + broadcast a single chat-feed item. The buffer is replayed as a
   * `chatBacklog` snapshot when a new device subscribes.
   */
  appendChatItem(item: unknown): void {
    this.chatBuffer.push(item)
    if (this.chatBuffer.length > CHAT_BUFFER_LIMIT) {
      this.chatBuffer = this.chatBuffer.slice(-CHAT_BUFFER_LIMIT)
    }
    this.broadcast('chatAppend', item)
  }

  // --- Pairing (called from the desktop UI via IPC) ---

  startPairCode(): PairCode {
    this.pruneCodes()
    const code = generatePairCode()
    const expiresAt = Date.now() + PAIR_CODE_TTL_MS
    this.pendingCodes.push({ code, expiresAt })
    return { code, expiresAt: new Date(expiresAt).toISOString() }
  }

  /** Returns paired devices in a UI-friendly shape. */
  listPairedDevices(): PairedDevice[] {
    const rows = this.authService.getAllTokens() as Array<{
      token: string
      label: string | null
      created_at: string
      last_used: string | null
    }>
    return rows.map((row) => ({
      token: row.token,
      label: row.label || 'Unnamed device',
      createdAt: row.created_at,
      lastUsed: row.last_used
    }))
  }

  revokeDevice(token: string): void {
    this.authService.revokeToken(token)
  }

  // --- HTTP routing (called from OverlayServer.handleRequest) ---

  /**
   * Returns true if the request was for a /api/v1/* endpoint and was handled
   * (success or error). False means the caller should keep routing.
   */
  async handleRequest(
    request: IncomingMessage,
    response: ServerResponse<IncomingMessage>,
    pathname: string
  ): Promise<boolean> {
    if (!pathname.startsWith('/api/v1/')) return false

    const route = pathname.slice('/api/v1/'.length)
    const method = request.method || 'GET'

    try {
      // --- Pairing endpoints (no token required) ---
      if (route === 'pair/complete' && method === 'POST') {
        await this.handlePairComplete(request, response)
        return true
      }

      // --- All other endpoints require a valid token ---
      if (!this.authorize(request)) {
        writeJson(response, { error: 'Unauthorized' }, 401)
        return true
      }

      if (route === 'catalog' && method === 'GET') {
        writeJson(response, this.buildCatalog())
        return true
      }

      if (route === 'events' && method === 'GET') {
        this.attachEventClient(request, response)
        return true
      }

      if (route === 'sound/play' && method === 'POST') {
        await this.handleSoundPlay(request, response)
        return true
      }

      if (route === 'deck/action' && method === 'POST') {
        await this.handleDeckAction(request, response)
        return true
      }

      writeJson(response, { error: 'Unknown endpoint', route }, 404)
      return true
    } catch (err) {
      console.error('[device-api] Handler error:', err)
      writeJson(response, { error: 'Internal error' }, 500)
      return true
    }
  }

  // --- Endpoint handlers ---

  private buildCatalog(): DeviceCatalog {
    const sounds: DeviceCatalogSound[] = this.soundboardService.getAllSounds().map((s) => ({
      id: s.id,
      name: s.name.replace(/\.(mp3|wav)$/i, ''),
      category: s.id.startsWith('alerts/') ? 'alerts' : 'board',
      emoji: s.emoji
    }))

    const actionRows = this.db.getAllDeckActions() as Array<{
      id: string
      name: string
      icon: string
      color: string | null
      type: string
    }>
    const actions: DeviceCatalogAction[] = actionRows.map((row) => ({
      id: row.id,
      name: row.name,
      icon: row.icon,
      color: row.color,
      type: row.type
    }))

    return { sounds, actions, serverVersion: SERVER_VERSION }
  }

  private async handlePairComplete(
    request: IncomingMessage,
    response: ServerResponse<IncomingMessage>
  ): Promise<void> {
    const body = await readJsonBody<{ code?: string | number; label?: string }>(request)
    const code = String(body.code ?? '').trim().padStart(6, '0')
    const label = (body.label || 'DeskThing').trim().slice(0, 64)
    const attemptKey = this.getRateLimitKey(request)

    if (this.isPairRateLimited(attemptKey)) {
      writeJson(response, { error: 'Too many pairing attempts' }, 429)
      return
    }

    console.log(`[device-api] Attempting to pair device label: "${label}"`)

    if (!code) {
      writeJson(response, { error: 'Missing code' }, 400)
      return
    }

    this.pruneCodes()

    const idx = this.pendingCodes.findIndex((c) => c.code === code)
    if (idx === -1) {
      this.recordPairFailure(attemptKey)
      console.warn('[device-api] Pair failed: invalid or expired code.')
      writeJson(response, { error: 'Invalid or expired code' }, 401)
      return
    }
    // Single-use: drop the code as soon as it's consumed.
    this.pendingCodes.splice(idx, 1)
    this.pairAttempts.delete(attemptKey)

    const token = this.authService.generateToken(`deskthing:${label}`)
    writeJson(response, { token })
  }

  private async handleSoundPlay(
    request: IncomingMessage,
    response: ServerResponse<IncomingMessage>
  ): Promise<void> {
    const body = await readJsonBody<{ id?: string; volume?: number }>(request)
    const id = (body.id || '').trim()
    if (!id) {
      writeJson(response, { error: 'Missing sound id' }, 400)
      return
    }

    const volume = typeof body.volume === 'number' ? body.volume : 1
    this.soundboardService.playSound(id, volume)

    // Surface a visual confirmation on every connected device. We look up the
    // catalog row so the device can show the human-readable name + emoji.
    const sound = this.soundboardService
      .getAllSounds()
      .find((s) => s.id === id)
    this.broadcast('soundPlayed', {
      id,
      name: sound?.name?.replace(/\.(mp3|wav)$/i, '') ?? id,
      emoji: sound?.emoji,
      at: new Date().toISOString()
    })

    writeJson(response, { success: true })
  }

  private async handleDeckAction(
    request: IncomingMessage,
    response: ServerResponse<IncomingMessage>
  ): Promise<void> {
    const body = await readJsonBody<{ type?: string; payload?: unknown }>(request)
    const type = (body.type || '').trim()
    if (!type) {
      writeJson(response, { error: 'Missing action type' }, 400)
      return
    }

    this.emitDeckAction({ type, payload: body.payload })
    writeJson(response, { success: true })
  }

  // --- SSE ---

  private attachEventClient(
    request: IncomingMessage,
    response: ServerResponse<IncomingMessage>
  ): void {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    })
    response.write(': connected\n\n')

    // Replay the most recent value of each event so a freshly-connected device
    // immediately gets a usable picture (now-playing, TTS state, etc.) without
    // waiting for the next state change.
    for (const [type, payload] of Object.entries(this.latestState)) {
      if (payload === undefined) continue
      response.write(`data: ${JSON.stringify({ type, payload })}\n\n`)
    }

    // Chat is replayed as a single backlog snapshot rather than per-item
    // appends, so devices that connect mid-stream see recent context all at
    // once instead of nothing.
    if (this.chatBuffer.length > 0) {
      response.write(
        `data: ${JSON.stringify({ type: 'chatBacklog', payload: this.chatBuffer })}\n\n`
      )
    }

    this.eventClients.add(response)
    this.startPingLoop()

    request.on('close', () => {
      this.eventClients.delete(response)
      if (this.eventClients.size === 0) this.stopPingLoop()
      try {
        response.end()
      } catch {
        /* socket already closed */
      }
    })
  }

  private startPingLoop(): void {
    if (this.pingTimer) return
    this.pingTimer = setInterval(() => {
      for (const client of [...this.eventClients]) {
        try {
          client.write(': ping\n\n')
        } catch {
          this.eventClients.delete(client)
        }
      }
    }, SSE_PING_INTERVAL_MS)
  }

  private stopPingLoop(): void {
    if (!this.pingTimer) return
    clearInterval(this.pingTimer)
    this.pingTimer = null
  }

  // --- Auth ---

  private authorize(request: IncomingMessage): boolean {
    const header = request.headers['authorization']
    const token =
      typeof header === 'string' && header.startsWith('Bearer ')
        ? header.slice('Bearer '.length).trim()
        : null

    return !!token && this.authService.verifyToken(token)
  }

  private getRateLimitKey(request: IncomingMessage): string {
    return request.socket.remoteAddress || 'unknown'
  }

  private isPairRateLimited(key: string): boolean {
    const now = Date.now()
    const entry = this.pairAttempts.get(key)
    if (!entry || entry.resetAt <= now) return false
    return entry.count >= PAIR_RATE_LIMIT_MAX_ATTEMPTS
  }

  private recordPairFailure(key: string): void {
    const now = Date.now()
    const entry = this.pairAttempts.get(key)
    if (!entry || entry.resetAt <= now) {
      this.pairAttempts.set(key, { count: 1, resetAt: now + PAIR_RATE_LIMIT_WINDOW_MS })
      return
    }
    entry.count += 1
  }

  private pruneCodes(): void {
    const now = Date.now()
    this.pendingCodes = this.pendingCodes.filter((c) => c.expiresAt > now)
  }
}

// --- Helpers ---

function generatePairCode(): string {
  return randomInt(0, 1_000_000)
    .toString()
    .padStart(6, '0')
}

function writeJson(
  response: ServerResponse<IncomingMessage>,
  data: unknown,
  statusCode = 200
): void {
  const json = JSON.stringify(data)
  response.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  })
  response.end(json)
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    let raw = ''
    let total = 0
    request.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'))
        request.destroy()
        return
      }
      raw += chunk.toString('utf8')
    })
    request.on('end', () => {
      if (raw.length === 0) {
        resolve({} as T)
        return
      }
      try {
        resolve(JSON.parse(raw) as T)
      } catch {
        reject(new Error('Invalid JSON'))
      }
    })
    request.on('error', reject)
  })
}
