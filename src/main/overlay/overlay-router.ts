import type { IncomingMessage, ServerResponse } from 'http'
import { URL } from 'url'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { join, extname } from 'path'
import { randomBytes, timingSafeEqual } from 'crypto'
import { createRequire } from 'module'
import { app } from 'electron'
import { resolveAppSettings } from '../../shared/app-settings'
import { AvatarFetchError, loadAvatar } from '../lib/avatar-cache'
import { buildDeckHtml } from './templates/deck'
import { buildCompanionHtml } from './templates/companion'
import {
  buildOverlayDirectoryHtml,
  generateOverlayHtml,
  getDefaultWidgetConfig,
  injectOverlayRuntimeBootstrap,
  injectPreviewBootstrap,
  WIDGET_ALIAS_MAP
} from './widget-renderers'
import type { Widget, WidgetType } from '../../shared/widgets'
import type { Database } from '../db/database'
import type { AssetService } from '../system/asset-service'
import type { RemoteAuthService } from '../services/remote-auth-service'
import type { SSEManager } from './sse-manager'
import type { ChatManager } from './managers/chat-manager'
import type { AlertManager } from './managers/alert-manager'
import type { GoalManager } from './managers/goal-manager'
import type { NowPlayingManager } from './managers/now-playing-manager'
import type { LikesTracker } from './managers/likes-tracker'
import type { DeviceApi } from './device-api'
import { isOverlayChannel, SSE_EVENT_HISTORY_LIMIT, type OverlayChannel } from './types'
import { OVERLAY_SHARED_WORKER_SCRIPT } from './overlay-shared-worker'

const TEST_ENDPOINTS_ENABLED = process.env.ILYSTREAM_ENABLE_TEST_ENDPOINTS === '1'
const MAX_DECK_ACTION_BODY_BYTES = 64 * 1024
const PREVIEW_SESSION_TTL_MS = 30 * 60_000
const MAX_PREVIEW_SESSIONS = 64
const require = createRequire(import.meta.url)
const MATTER_JS_PATH = require.resolve('matter-js/build/matter.min.js')
const COMPANION_EMOJI_PATH_PREFIX = '/overlay/companion/emoji/'
const COMPANION_EMOJI_FILE_RE = /^emoji_u[0-9a-f]+(?:_[0-9a-f]+)*\.svg$/

const DUAL_VERTICAL_VIEWER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>ilyStream — Dual Vertical Overlay</title>
<style>
  html, body { margin: 0; padding: 0; background: #000; height: 100%; overflow: hidden; }
  body { display: flex; align-items: center; justify-content: center; }
  img { width: 100%; height: 100%; object-fit: contain; display: block; }
</style>
</head>
<body>
<img src="/overlay/dual-vertical/stream.mjpeg" alt="" />
</body>
</html>`

export class OverlayRouter {
  private dualVerticalClients = new Set<ServerResponse>()
  private dualVerticalLastFrame: Buffer | null = null
  private deckCsrfToken = randomBytes(32).toString('base64url')
  private runtimeGeneration = randomBytes(16).toString('base64url')
  private previewSessions = new Map<string, { widgetId: string; expiresAt: number }>()
  private avatarCacheDir = join(app.getPath('userData'), 'avatar_cache')

  constructor(
    private getDb: () => Database | null,
    private getAssetService: () => AssetService | null,
    private getSoundboardService: () => any | null,
    private getAuthService: () => RemoteAuthService | null,
    private getDeviceApi: () => DeviceApi | null,
    private sse: SSEManager,
    private chat: ChatManager,
    private alerts: AlertManager,
    private goals: GoalManager,
    private nowPlaying: NowPlayingManager,
    private likes: LikesTracker,
    private getStatus: () => any,
    private getObsStatus: () => any,
    private getViewerCounts: () => Record<string, number>,
    private handleStreamEvent: (event: any) => void,
    private emitDeckAction: (action: { type: string; payload?: unknown }) => void,
    private getStatsService: () => any = () => null,
    private getLeaderboard: () => Array<{ username: string; score: number }> = () => [],
    private getDiscordCallState: () => any = () => null,
    private getWebSocketCapability: () => string = () => ''
  ) {}

  createWidgetPreviewSession(widgetId: string): string {
    const normalizedWidgetId = widgetId.trim()
    if (!normalizedWidgetId) throw new Error('Widget id is required for a preview session')

    this.pruneExpiredPreviewSessions()
    while (this.previewSessions.size >= MAX_PREVIEW_SESSIONS) {
      const oldestToken = this.previewSessions.keys().next().value as string | undefined
      if (!oldestToken) break
      this.previewSessions.delete(oldestToken)
    }

    const previewToken = randomBytes(32).toString('base64url')
    this.previewSessions.set(previewToken, {
      widgetId: normalizedWidgetId,
      expiresAt: Date.now() + PREVIEW_SESSION_TTL_MS
    })
    return previewToken
  }

  releaseWidgetPreviewSession(previewToken: string): void {
    this.previewSessions.delete(previewToken)
  }

  validateWidgetPreviewSession(previewToken: string | null | undefined, widgetId: string): boolean {
    if (!previewToken) return false
    const session = this.previewSessions.get(previewToken)
    if (!session) return false
    if (session.expiresAt <= Date.now()) {
      this.previewSessions.delete(previewToken)
      return false
    }
    if (session.widgetId !== widgetId) return false

    // Keep an actively edited preview alive while preserving a hard idle expiry.
    this.previewSessions.delete(previewToken)
    this.previewSessions.set(previewToken, {
      ...session,
      expiresAt: Date.now() + PREVIEW_SESSION_TTL_MS
    })
    return true
  }

  private pruneExpiredPreviewSessions(): void {
    const now = Date.now()
    for (const [previewToken, session] of this.previewSessions) {
      if (session.expiresAt <= now) this.previewSessions.delete(previewToken)
    }
  }

  async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`)
    const pathname = url.pathname
    const isDeviceApiPath = pathname.startsWith('/api/v1/')

    if (request.method === 'OPTIONS') {
      if (isDeviceApiPath) {
        this.writeOpenCorsHeaders(response, 204, 'application/json')
      } else {
        this.writeCorsHeaders(response, 204, 'application/json', request)
      }
      response.end()
      return
    }

    if (request.method === 'HEAD') {
      this.writeCorsHeaders(response, 200, 'text/html', request)
      response.end()
      return
    }

    const deviceApi = this.getDeviceApi()
    if (deviceApi && pathname.startsWith('/api/v1/')) {
      const handled = await deviceApi.handleRequest(request, response, pathname)
      if (handled) return
    }

    if (pathname === '/overlay/deck') {
      if (!this.authorizeDeckPage(request, url)) {
        this.writeJson(response, { error: 'Unauthorized' }, 401, request)
        return
      }
      const sounds = this.getSoundboardService()?.getAllSounds('board') || []
      const actions = this.getDb()?.getAllDeckActions() || []
      this.writeHtml(response, buildDeckHtml(sounds, actions, this.deckCsrfToken), 200, request)
      return
    }

    if (pathname === '/overlay/vendor/matter.min.js') {
      const source = await readFile(MATTER_JS_PATH)
      this.writeCorsHeaders(response, 200, 'text/javascript; charset=utf-8', request, {
        'Cache-Control': 'public, max-age=31536000, immutable'
      })
      response.end(source)
      return
    }

    if (pathname === '/test/alert') {
      if (!this.authorizeRemoteControl(request, url) && !TEST_ENDPOINTS_ENABLED) {
        this.writeJson(response, { error: 'Unauthorized' }, 401, request)
        return
      }
      const type = url.searchParams.get('type') || 'follow'
      const label = type === 'gift' ? 'Test User sent 1x Rose!' :
                   type === 'subscription' || type === 'superfan' ? 'Test User just subscribed!' :
                   'Test User is now following!'

      this.alerts.pushAlert({
        id: `test-alert-${Date.now()}`,
        html: label,
        imageUrl: '',
        durationMs: 5000,
        animationIn: 'bounce',
        animationOut: 'fade',
        textColor: '#ffffff',
        backgroundColor: 'rgba(10, 10, 15, 0.85)',
        borderColor: 'gradient',
        fontSize: 54,
        fontWeight: 900,
        textShadow: '0 4px 15px rgba(0,0,0,0.6)',
        layout: 'text-only'
      }, 'tiktok')
      this.writeJson(response, { success: true, message: 'Test alert sent' }, 200, request)
      return
    }

    if (pathname.startsWith('/avatar/')) {
      await this.handleAvatarRequest(pathname, request, response)
      return
    }

    if (pathname === '/overlay/runtime/shared-worker.js') {
      this.writeCorsHeaders(response, 200, 'text/javascript; charset=utf-8', request, {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff'
      })
      response.end(OVERLAY_SHARED_WORKER_SCRIPT)
      return
    }

    if (pathname.startsWith(COMPANION_EMOJI_PATH_PREFIX)) {
      await this.handleCompanionEmojiRequest(pathname, request, response)
      return
    }

    if (pathname === '/test/like') {
      if (!this.authorizeRemoteControl(request, url) && !TEST_ENDPOINTS_ENABLED) {
        this.writeJson(response, { error: 'Unauthorized' }, 401, request)
        return
      }
      this.handleStreamEvent({
        id: 'test-' + Date.now(),
        platform: 'tiktok',
        type: 'like',
        timestamp: new Date(),
        user: { username: 'tester', displayName: 'Test User', profilePictureUrl: '' },
        likeCount: 100,
        totalLikes: 5000,
        raw: {}
      })
      this.writeJson(response, { success: true, message: 'Test like sent' }, 200, request)
      return
    }

    if (pathname === '/debug/server') {
      const status = this.getStatus()
      this.writeJson(response, {
        status: 'UP',
        port: status.port,
        running: status.running,
        uptime: status.startedAt ? Math.floor((Date.now() - Date.parse(status.startedAt)) / 1000) : 0,
        clients: {
          chat: status.chatClientCount,
          alerts: status.alertClientCount,
          goals: status.goalClientCount,
          webSockets: status.webSocketClientCount || 0
        }
      }, 200, request)
      return
    }

    if (pathname === '/overlay/health' || pathname === '/health') {
      const status = this.getStatus()
      const { webSocketCapability: _webSocketCapability, ...publicStatus } = status
      this.writeJson(response, pathname === '/health' ? 'OK' : publicStatus, 200, request)
      return
    }

    if (pathname === '/overlay/alerts/state') {
      const since = Number(url.searchParams.get('since') || 0)
      const alertHistory = this.alerts.getHistory()
      const filtered = Number.isFinite(since) && since > 0
        ? alertHistory.filter((alert) => Date.parse(alert.createdAt) > since)
        : alertHistory
      this.writeJson(response, filtered, 200, request)
      return
    }
    // Thunks, not values: every overlay request passes through here, and
    // building the map eagerly ran all of these — including the lifetime
    // leaderboard's table scan and join — for requests that wanted none of them.
    const stateMap: Record<string, () => any> = {
      '/overlay/chat/state': () => this.chat.getHistory(),
      '/overlay/goals/state': () => this.goals.getState(),
      '/overlay/now-playing/state': () => this.nowPlaying.getState(),
      '/overlay/state/latest-gifter': () => this.getLatestGifter(),
      '/overlay/likes/state': () => this.likes.getSnapshot(),
      '/overlay/likes/lifetime': () => this.getLikesLifetimeState(url),
      '/overlay/leaderboard/state': () => this.getLeaderboardState(),
      '/overlay/discord-call/state': () => this.getDiscordCallState()
    }

    // Use `in`, not truthiness: a legitimately falsy state value (e.g. a null
    // latest-gifter) must still return JSON, not fall through to the widget
    // HTML catch-all below.
    if (pathname in stateMap) {
      this.writeJson(response, stateMap[pathname](), 200, request)
      return
    }

    // HTTP polling fallback for browser sources (e.g. TikTok Live Studio) whose
    // embedded Chromium drops or blocks SSE. Mirrors the SSE stream: the initial
    // poll (after<=0) returns the current snapshot; later polls return only the
    // events recorded since the client's cursor.
    if (pathname === '/overlay/events/poll') {
      const channel = this.parseOverlayChannel(url.searchParams.get('channel') || 'chat')
      if (!channel) {
        this.writeJson(response, { error: 'Invalid overlay channel' }, 400, request)
        return
      }

      this.writeJson(response, this.getEventReplay(channel, {
        after: Number(url.searchParams.get('after') || 0),
        sinceAt: Number(url.searchParams.get('since') || 0),
        limit: Number(url.searchParams.get('limit') || 80)
      }), 200, request)
      return
    }

    if (pathname === '/overlay/events') {
      const channel = this.parseOverlayChannel(url.searchParams.get('channel') || 'chat')
      if (!channel) {
        this.writeJson(response, { error: 'Invalid overlay channel' }, 400, request)
        return
      }
      this.sse.attachClient(channel, request, response)

      const snapshot = this.computeChannelSnapshot(channel)
      const snapshotPayload = { type: 'snapshot', payload: snapshot }
      // Seed the browser's cursor even when the channel has no state payload.
      // Reconciliation polling can then request only events that occurred
      // after this stream was attached instead of replaying retained history.
      response.write(`id: ${this.sse.getLastEventId(channel)}\ndata: ${JSON.stringify(snapshotPayload)}\n\n`)
      return
    }

    if (pathname === '/overlay/deck/action' && request.method === 'POST') {
      await this.handleDeckAction(request, response, url)
      return
    }

    if (pathname === '/overlay/dual-vertical.html' || pathname === '/overlay/dual-vertical') {
      this.writeHtml(response, DUAL_VERTICAL_VIEWER_HTML, 200, request)
      return
    }

    if (pathname === '/overlay/companion.html' || pathname === '/overlay/companion') {
      const db = this.getDb()
      const settings = db ? resolveAppSettings(db.getAllSettings()) : null

      const html = buildCompanionHtml({
        obsStatus: this.getObsStatus(),
        viewerCounts: this.getViewerCounts(),
        latestAlerts: this.alerts.getHistory().slice(-4).reverse(),
        nowPlaying: this.nowPlaying.getState(),
        ui: settings?.ui || null
      })
      this.writeHtml(response, html, 200, request)
      return
    }

    if (pathname === '/overlay/dual-vertical/stream.mjpeg') {
      this.attachDualVerticalClient(request, response)
      return
    }

    if (pathname.startsWith('/assets/') || pathname.startsWith('/sounds/')) {
      await this.serveAsset(pathname, request, response)
      return
    }

    if (pathname.toLowerCase().startsWith('/overlay/') || pathname.toLowerCase().startsWith('/widget/')) {
      const handled = await this.serveOverlay(pathname, url, request, response)
      if (handled) return
    }

    this.writeJson(response, { error: 'Overlay route not found.' }, 404, request)
  }

  setDualVerticalFrame(frame: Buffer): void {
    this.dualVerticalLastFrame = frame
    const data = `\r\n--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`
    for (const client of this.dualVerticalClients) {
      try {
        client.write(data)
        client.write(frame)
      } catch {
        this.dualVerticalClients.delete(client)
      }
    }
  }

  getDualVerticalClientCount(): number {
    return this.dualVerticalClients.size
  }

  getRuntimeGeneration(): string {
    return this.runtimeGeneration
  }

  /**
   * Canonical snapshot/history reconciliation used by polling and WebSocket
   * subscriptions. Keeping this logic transport-neutral prevents recovery
   * behavior from drifting as faster transports are added.
   */
  getEventReplay(
    channel: OverlayChannel,
    options: { after?: number; sinceAt?: number; limit?: number } = {}
  ): {
    events: Array<{ id: number; data: unknown }>
    cursor: number
    generation: string
    reset: boolean
  } {
    const after = Number.isFinite(options.after)
      ? Math.max(0, Math.floor(options.after || 0))
      : 0
    const sinceAt = Number.isFinite(options.sinceAt)
      ? Math.max(0, Math.floor(options.sinceAt || 0))
      : 0
    const limit = Number.isFinite(options.limit)
      ? Math.max(1, Math.min(120, Math.floor(options.limit || 80)))
      : 80
    const snapshot = this.computeChannelSnapshot(channel)
    const currentCursor = this.sse.getLastEventId(channel)
    const firstCursor = this.sse.getFirstEventId(channel)

    // Browser documents can outlive the ilyStream process. A relaunched server
    // starts event IDs from zero, so reset old cursors and reconcile state.
    if (after > currentCursor) {
      return this.buildResetReplay('overlay-server-restarted', snapshot, currentCursor)
    }

    // Bounded history cannot safely provide a partial event tail.
    if (after > 0 && firstCursor > 0 && after < firstCursor - 1) {
      return this.buildResetReplay('overlay-history-gap', snapshot, currentCursor)
    }

    if (after <= 0 && snapshot !== null && snapshot !== undefined) {
      return {
        events: [{ id: 0, data: { type: 'snapshot', payload: snapshot } }],
        cursor: currentCursor,
        generation: this.runtimeGeneration,
        reset: false
      }
    }

    if (after <= 0 && sinceAt > 0) {
      const events = this.sse.getEventsSince(channel, 0, SSE_EVENT_HISTORY_LIMIT)
        .filter((entry) => entry.at >= sinceAt)
        .slice(0, limit)
        .map((entry) => ({ id: entry.id, data: entry.payload }))
      return {
        events,
        // Only advance past data actually delivered. If the filtered tail is
        // larger than one polling page, the next request can continue it.
        cursor: events.length ? events[events.length - 1].id : currentCursor,
        generation: this.runtimeGeneration,
        reset: false
      }
    }

    const events = this.sse.getEventsSince(channel, after, limit)
      .map((entry) => ({ id: entry.id, data: entry.payload }))
    return {
      events,
      cursor: events.length ? events[events.length - 1].id : after,
      generation: this.runtimeGeneration,
      reset: false
    }
  }

  private buildResetReplay(
    reason: string,
    snapshot: unknown,
    cursor: number
  ): {
    events: Array<{ id: number; data: unknown }>
    cursor: number
    generation: string
    reset: boolean
  } {
    const events: Array<{ id: number; data: unknown }> = [
      { id: 0, data: { type: 'reload', reason } }
    ]
    if (snapshot !== null && snapshot !== undefined) {
      events.push({ id: 0, data: { type: 'snapshot', payload: snapshot } })
    }
    return { events, cursor, generation: this.runtimeGeneration, reset: true }
  }

  /**
   * Current state payload for a channel's initial snapshot, shared by the SSE
   * stream and the /overlay/events/poll fallback. Returns null for channels
   * that have no snapshot (they only receive live broadcast events).
   */
  private computeChannelSnapshot(channel: OverlayChannel): any {
    return (channel === 'chat' || channel === 'chat-unified') ? this.chat.getHistory() :
      channel === 'alerts' ? [] :
      channel === 'goals' ? this.goals.getState() :
      channel === 'likes' ? this.likes.getSnapshot() :
      channel === 'leaderboard' ? this.getLeaderboardState() :
      channel === 'discord-call' ? this.getDiscordCallState() :
      channel === 'latest-gifter' ? this.getLatestGifter() :
      channel === 'now-playing' ? this.nowPlaying.getState() :
      null
  }

  /**
   * Current leaderboard array for hydration. Prefers the most recent broadcast
   * (which the economy service emits on every update) and falls back to the
   * economy snapshot when nothing has been broadcast yet.
   */
  private getLeaderboardState(): Array<{ username: string; score: number }> {
    const last = this.sse.getLastPayload('leaderboard') as { data?: unknown } | null
    if (Array.isArray(last?.data)) return last!.data as Array<{ username: string; score: number }>
    const snapshot = this.getLeaderboard()
    return Array.isArray(snapshot) ? snapshot : []
  }

  private getLikesLifetimeState(url: URL): { totalLikes: number; users: Array<{ displayName: string; profilePictureUrl: string | null; count: number }> } {
    const limitRaw = Number(url.searchParams.get('limit') || 10)
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, Math.floor(limitRaw))) : 10
    const statsService = this.getStatsService?.()

    if (!statsService?.getTopIdentities || !statsService?.getGlobalStats) {
      // Loud on purpose: an unwired stats service turns the all-time leaderboard
      // into a permanently empty list, which looks like a widget bug rather than
      // a missing dependency.
      console.warn(
        '[OverlayRouter] likes lifetime requested without a stats service — serving an empty leaderboard'
      )
      return { totalLikes: 0, users: [] }
    }

    const globalStats = statsService.getGlobalStats()
    const identities = statsService.getTopIdentities({
      sortBy: 'totalLikes',
      platform: 'all',
      limit,
      offset: 0
    })

    return {
      totalLikes: Math.max(0, Math.floor(Number(globalStats?.totalLikes) || 0)),
      users: Array.isArray(identities)
        ? identities
            .filter((identity: any) => Number(identity?.totalLikes) > 0)
            .slice(0, limit)
            .map((identity: any) => ({
              displayName: String(identity.displayName || identity.primaryUsername || 'Viewer'),
              profilePictureUrl: identity.profilePictureUrl || null,
              count: Math.max(0, Math.floor(Number(identity.totalLikes) || 0))
            }))
        : []
    }
  }

  private getLatestGifter(): any {
    const db = this.getDb()
    if (!db) return null
    try {
      const saved = db.getSetting('last_gifter_v1')
      return typeof saved === 'string' && saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  }

  closeAllClients(): void {
    for (const client of this.dualVerticalClients) {
      try { client.end() } catch {}
    }
    this.dualVerticalClients.clear()
    this.dualVerticalLastFrame = null
  }

  private async handleDeckAction(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    if (!this.authorizeDeckAction(request, url)) {
      this.writeJson(response, { error: 'Unauthorized' }, 401, request)
      return
    }

    try {
      const action = await this.readJsonBody<{ type?: unknown; payload?: unknown }>(request)
      if (!action || typeof action.type !== 'string' || !action.type.trim()) {
        this.writeJson(response, { error: 'Invalid action' }, 400, request)
        return
      }
      this.emitDeckAction({ type: action.type.trim(), payload: action.payload })
      this.writeJson(response, { success: true }, 200, request)
    } catch (err) {
      const tooLarge = err instanceof Error && err.message === 'Request body too large'
      this.writeJson(response, { error: tooLarge ? 'Request body too large' : 'Invalid body' }, tooLarge ? 413 : 400, request)
    }
  }

  private async serveAsset(pathname: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
    const isSound = pathname.startsWith('/sounds/')
    const segments = pathname.split('/')
    const fileName = decodeURIComponent(segments.pop() || '')
    const subDir = segments[2] || ''

    let filePath: string | null = null
    if (isSound) {
      const soundId = subDir && (subDir === 'alerts' || subDir === 'board' || subDir === 'join')
        ? `${subDir}/${fileName}`
        : fileName
      filePath = this.getSoundboardService()?.getSoundPath(soundId)
    } else {
      filePath = this.getAssetService()?.getAssetPath(fileName) ?? null
    }

    if (filePath && existsSync(filePath)) {
      try {
        const data = await readFile(filePath)
        const ext = extname(filePath).toLowerCase()
        const mimeTypes: Record<string, string> = {
          '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
          '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
          '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg'
        }
        response.writeHead(200, {
          'Content-Type': mimeTypes[ext] || 'application/octet-stream',
          'Content-Length': data.length,
          ...this.corsHeaders(request),
          // User-managed alert media can be replaced without changing its
          // filename. Embedded browser sources must not retain stale bytes.
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0'
        })
        response.end(data)
        return
      } catch {}
    }
    this.writeJson(response, { error: 'Asset not found' }, 404, request)
  }

  private async serveOverlay(
    pathname: string,
    url: URL,
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<boolean> {
    const segments = pathname.split('/').filter(Boolean)
    let widgetId = segments[segments.length - 1]?.replace('.html', '').replace('.htm', '').toLowerCase().trim()

    if (!widgetId || widgetId === 'overlay' || widgetId === 'widget') return false

    const configRaw = url.searchParams.get('config')
    const dockModeRequested = url.searchParams.get('dock') === '1'
    let configOverride: any = null
    if (configRaw) {
      // Accept both base64url and legacy raw base64. Legacy URLs put '+' and
      // '/' straight into the query string, and URL parsing turns '+' into a
      // space — silently dropping the whole config override in OBS. Undo that
      // mangling before decoding.
      const normalized = configRaw.replace(/ /g, '+').replace(/-/g, '+').replace(/_/g, '/')
      try { configOverride = JSON.parse(Buffer.from(normalized, 'base64').toString('utf8')) } catch {}
    }

    const applyOverride = (widget: Widget | undefined): Widget | undefined => {
      if (!widget) return widget
      const dockOverride = dockModeRequested && widget.type === 'chat-unified'
        ? { dockMode: true }
        : null
      if (!configOverride && !dockOverride) return widget
      return {
        ...widget,
        config: { ...(widget.config as any), ...(configOverride || {}), ...(dockOverride || {}) }
      } as Widget
    }

    const typeFromAlias = WIDGET_ALIAS_MAP[widgetId]
    let widget: Widget | undefined
    const db = this.getDb()

    if (typeFromAlias) {
      const base = db?.getAllWidgets().find(w => w.type === typeFromAlias)
      widget = applyOverride(base || {
        id: 'default', name: 'Default', type: typeFromAlias as WidgetType,
        config: getDefaultWidgetConfig(typeFromAlias as WidgetType)
      })
    } else {
      widget = applyOverride(db?.getAllWidgets().find(w => w.id === widgetId))
    }

    if (widget) {
      const isPreview = url.searchParams.has('preview')
      const previewToken = url.searchParams.get('previewToken')
      const hasPreviewCapability = previewToken !== null
      if (isPreview && hasPreviewCapability && !this.validateWidgetPreviewSession(previewToken, widgetId)) {
        this.writeJson(response, { error: 'Invalid preview session' }, 403, request)
        return true
      }
      const html = generateOverlayHtml(widget, isPreview, {
        settings: db?.getAllSettings() || {},
        boardSounds: this.getSoundboardService()?.getAllSounds('board') || [],
        deckActions: db?.getAllDeckActions() || []
      })
      if (html) {
        const requestedCapability = url.searchParams.get('cap')
        const webSocketCapability = this.matchesWebSocketCapability(requestedCapability)
          ? this.getWebSocketCapability()
          : ''
        const runtimeHtml = injectOverlayRuntimeBootstrap(html, {
          widget,
          sourceKind: isPreview ? 'preview' : typeFromAlias ? 'alias' : 'id'
        }, webSocketCapability)
        // Browser sources and static card previews get the SSE-with-polling-
        // fallback runtime. Only a main-process-issued capability enables the
        // editor's executable postMessage bootstrap.
        this.writeHtml(
          response,
          isPreview && hasPreviewCapability
            ? injectPreviewBootstrap(runtimeHtml, previewToken!)
            : runtimeHtml,
          200,
          request,
          isPreview || webSocketCapability ? { 'Referrer-Policy': 'no-referrer' } : undefined
        )
        return true
      }
    }
    this.writeHtml(response, buildOverlayDirectoryHtml(widgetId), 404)
    return true
  }

  private matchesWebSocketCapability(candidate: string | null): boolean {
    if (!candidate) return false
    const expected = this.getWebSocketCapability()
    const candidateBytes = Buffer.from(candidate)
    const expectedBytes = Buffer.from(expected)
    return candidateBytes.length === expectedBytes.length && timingSafeEqual(candidateBytes, expectedBytes)
  }

  private attachDualVerticalClient(request: IncomingMessage, response: ServerResponse): void {
    response.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Connection: 'keep-alive',
      ...this.corsHeaders(request)
    })

    this.dualVerticalClients.add(response)
    if (this.dualVerticalLastFrame) {
      try {
        response.write(`\r\n--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${this.dualVerticalLastFrame.length}\r\n\r\n`)
        response.write(this.dualVerticalLastFrame)
      } catch {
        this.dualVerticalClients.delete(response)
      }
    }

    request.on('close', () => {
      this.dualVerticalClients.delete(response)
      try { response.end() } catch {}
    })
  }

  private authorizeDeckAction(request: IncomingMessage, url: URL): boolean {
    if (this.authorizeRemoteControl(request, url)) return true

    const deckToken = request.headers['x-ilystream-deck-token']
    return (
      deckToken === this.deckCsrfToken &&
      this.isLoopbackRequest(request) &&
      this.isSameOriginRequest(request)
    )
  }

  private authorizeDeckPage(request: IncomingMessage, url: URL): boolean {
    return this.isLoopbackRequest(request) || this.authorizeRemoteControl(request, url)
  }

  private authorizeRemoteControl(request: IncomingMessage, url: URL): boolean {
    const queryToken = url.searchParams.get('token')
    if (queryToken && this.getAuthService()?.verifyToken(queryToken)) return true

    const header = request.headers.authorization
    const bearer =
      typeof header === 'string' && header.startsWith('Bearer ')
        ? header.slice('Bearer '.length).trim()
        : null

    return !!bearer && !!this.getAuthService()?.verifyToken(bearer)
  }

  private isSameOriginRequest(request: IncomingMessage): boolean {
    const origin = request.headers.origin
    if (!origin) return false
    const host = request.headers.host
    if (!host) return false
    try {
      const parsed = new URL(origin)
      return parsed.host === host && (parsed.protocol === 'http:' || parsed.protocol === 'https:')
    } catch {
      return false
    }
  }

  private isLoopbackRequest(request: IncomingMessage): boolean {
    const address = request.socket.remoteAddress
    if (!address) return false
    return (
      address === '::1' ||
      address === '127.0.0.1' ||
      address.startsWith('127.') ||
      address === '::ffff:127.0.0.1' ||
      address.startsWith('::ffff:127.')
    )
  }

  private parseOverlayChannel(value: string): OverlayChannel | null {
    const channel = value.split(',')[0]?.trim()
    return isOverlayChannel(channel) ? channel : null
  }

  private writeCorsHeaders(
    response: ServerResponse,
    statusCode: number,
    contentType = 'application/json',
    request?: IncomingMessage,
    extraHeaders?: Record<string, string>
  ): void {
    response.writeHead(statusCode, {
      'Content-Type': contentType,
      ...this.corsHeaders(request),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-ilyStream-Deck-Token',
      'Access-Control-Max-Age': '86400',
      ...(extraHeaders || {})
    })
  }

  private writeOpenCorsHeaders(response: ServerResponse, statusCode: number, contentType = 'application/json'): void {
    response.writeHead(statusCode, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    })
  }

  private writeJson(response: ServerResponse, data: any, statusCode = 200, request?: IncomingMessage): void {
    const json = JSON.stringify(data)
    this.writeCorsHeaders(response, statusCode, 'application/json', request, {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0'
    })
    response.end(json)
  }

  private writeHtml(
    response: ServerResponse,
    html: string,
    statusCode = 200,
    request?: IncomingMessage,
    extraHeaders?: Record<string, string>
  ): void {
    // Overlay widget pages are dynamic and updated with the app. Without an
    // explicit no-cache, OBS/TikTok Live Studio's embedded Chromium caches the
    // page indefinitely and keeps rendering a stale (possibly broken) build even
    // after the app is updated — the classic "works in a browser, blank in OBS".
    this.writeCorsHeaders(response, statusCode, 'text/html; charset=utf-8', request, {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      ...(extraHeaders || {})
    })
    response.end(html)
  }

  private corsHeaders(request?: IncomingMessage): Record<string, string> {
    if (!request) return {}
    const origin = request.headers.origin
    if (typeof origin !== 'string' || !this.isAllowedLocalOrigin(origin)) return {}
    return {
      'Access-Control-Allow-Origin': origin,
      Vary: 'Origin'
    }
  }

  private isAllowedLocalOrigin(origin: string): boolean {
    try {
      const parsed = new URL(origin)
      return (
        (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(parsed.hostname)
      )
    } catch {
      return false
    }
  }

  private async readJsonBody<T>(request: IncomingMessage): Promise<T> {
    return await new Promise<T>((resolve, reject) => {
      let body = ''
      let total = 0

      request.on('data', (chunk: Buffer) => {
        total += chunk.length
        if (total > MAX_DECK_ACTION_BODY_BYTES) {
          reject(new Error('Request body too large'))
          request.destroy()
          return
        }
        body += chunk.toString('utf8')
      })
      request.on('end', () => {
        try {
          resolve((body ? JSON.parse(body) : {}) as T)
        } catch {
          reject(new Error('Invalid JSON'))
        }
      })
      request.on('error', reject)
    })
  }

  private writeAvatarError(
    response: ServerResponse,
    message: string,
    statusCode: number,
    request: IncomingMessage
  ): void {
    this.writeCorsHeaders(response, statusCode, 'application/json', request, {
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
      Expires: '0',
      'X-Content-Type-Options': 'nosniff'
    })
    response.end(JSON.stringify({ error: message }))
  }

  private async handleAvatarRequest(pathname: string, request: IncomingMessage, response: ServerResponse) {
    const base64Url = pathname.replace('/avatar/', '')
    if (!base64Url) {
      this.writeAvatarError(response, 'Missing avatar hash', 400, request)
      return
    }

    try {
      let b64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
      while (b64.length % 4) {
        b64 += '='
      }
      const decodedUrl = Buffer.from(b64, 'base64').toString('utf-8')
      if (!decodedUrl.startsWith('http')) {
        this.writeAvatarError(response, 'Invalid URL', 400, request)
        return
      }

      // Cache-first by stable image identity, with SSRF guarding and an
      // expired-signature retry inside loadAvatar. See lib/avatar-cache.ts.
      const avatar = await loadAvatar(this.avatarCacheDir, decodedUrl)
      const cacheHeaders = {
        'Cache-Control': 'no-cache, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
        ETag: avatar.etag,
        'X-Content-Type-Options': 'nosniff'
      }
      const ifNoneMatch = request.headers['if-none-match']
      if (typeof ifNoneMatch === 'string' && ifNoneMatch.split(',').some((value) => {
        const candidate = value.trim()
        return candidate === '*' || candidate === avatar.etag
      })) {
        this.writeCorsHeaders(response, 304, avatar.contentType, request, cacheHeaders)
        response.end()
        return
      }

      this.writeCorsHeaders(response, 200, avatar.contentType, request, cacheHeaders)
      response.end(avatar.data)
    } catch (err) {
      if (err instanceof AvatarFetchError) {
        if (err.status === 400) {
          console.warn('[OverlayRouter]', err.message)
        }
        this.writeAvatarError(response, err.message, err.status, request)
        return
      }
      console.error('[OverlayRouter] Avatar proxy error:', err)
      this.writeAvatarError(response, 'Internal server error', 500, request)
    }
  }

  private async handleCompanionEmojiRequest(
    pathname: string,
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    const fileName = pathname.slice(COMPANION_EMOJI_PATH_PREFIX.length)
    if (!COMPANION_EMOJI_FILE_RE.test(fileName)) {
      this.writeJson(response, { error: 'Invalid companion emoji asset' }, 400, request)
      return
    }

    const appPath = typeof app.getAppPath === 'function' ? app.getAppPath() : ''
    const candidates = [
      join(appPath, 'resources', 'companion-emojis', fileName),
      join(process.resourcesPath || '', 'companion-emojis', fileName),
      join(process.resourcesPath || '', 'resources', 'companion-emojis', fileName)
    ]
    const assetPath = candidates.find((candidate) => candidate && existsSync(candidate))
    if (!assetPath) {
      this.writeJson(response, { error: 'Companion emoji asset not found' }, 404, request)
      return
    }

    const source = await readFile(assetPath)
    this.writeCorsHeaders(response, 200, 'image/svg+xml; charset=utf-8', request, {
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff'
    })
    response.end(source)
  }
}
