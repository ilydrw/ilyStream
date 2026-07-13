import type { IncomingMessage, ServerResponse } from 'http'
import { URL } from 'url'
import { existsSync } from 'fs'
import { readFile, mkdir, stat, writeFile } from 'fs/promises'
import { join, extname } from 'path'
import { randomBytes, createHash } from 'crypto'
import { createRequire } from 'module'
import { app } from 'electron'
import { resolveAppSettings } from '../../shared/app-settings'
import { assertSafePublicHttpUrl, MAX_AVATAR_BYTES } from '../lib/ssrf-guard'
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
import type { OverlayChannel } from './types'

const ALLOWED_OVERLAY_CHANNELS = new Set<OverlayChannel>([
  'chat',
  'chat-unified',
  'alerts',
  'goals',
  'now-playing',
  'follower-goal',
  'socials',
  'screen-border',
  'event-particles',
  'falling-roses',
  'gift-overlays',
  'particles',
  'discord-promo',
  'node-network',
  'latest-gifter',
  'physics',
  'deck',
  'leaderboard',
  'timer',
  'likes'
])

const TEST_ENDPOINTS_ENABLED = process.env.ILYSTREAM_ENABLE_TEST_ENDPOINTS === '1'
const MAX_DECK_ACTION_BODY_BYTES = 64 * 1024
const require = createRequire(import.meta.url)
const MATTER_JS_PATH = require.resolve('matter-js/build/matter.min.js')

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
    private getLeaderboard: () => Array<{ username: string; score: number }> = () => []
  ) {}

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
          chat: this.sse.getClientCount('chat'),
          alerts: this.sse.getClientCount('alerts'),
          goals: this.sse.getClientCount('goals')
        }
      }, 200, request)
      return
    }

    if (pathname === '/overlay/health' || pathname === '/health') {
      this.writeJson(response, pathname === '/health' ? 'OK' : this.getStatus(), 200, request)
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
    const stateMap: Record<string, any> = {
      '/overlay/chat/state': this.chat.getHistory(),
      '/overlay/goals/state': this.goals.getState(),
      '/overlay/now-playing/state': this.nowPlaying.getState(),
      '/overlay/state/latest-gifter': this.getLatestGifter(),
      '/overlay/likes/state': this.likes.getSnapshot(),
      '/overlay/likes/lifetime': this.getLikesLifetimeState(url),
      '/overlay/leaderboard/state': this.getLeaderboardState()
    }

    // Use `in`, not truthiness: a legitimately falsy state value (e.g. a null
    // latest-gifter) must still return JSON, not fall through to the widget
    // HTML catch-all below.
    if (pathname in stateMap) {
      this.writeJson(response, stateMap[pathname], 200, request)
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

      const afterRaw = Number(url.searchParams.get('after') || 0)
      const after = Number.isFinite(afterRaw) ? Math.max(0, Math.floor(afterRaw)) : 0
      const limitRaw = Number(url.searchParams.get('limit') || 80)
      const limit = Number.isFinite(limitRaw) ? limitRaw : 80

      const snapshot = this.computeChannelSnapshot(channel)
      if (after <= 0 && snapshot !== null && snapshot !== undefined) {
        // Full snapshot represents current state; skip incremental history so
        // the initial render isn't duplicated by already-reflected events.
        this.writeJson(
          response,
          { events: [{ id: 0, data: { type: 'snapshot', payload: snapshot } }], cursor: this.sse.getLastEventId(channel) },
          200,
          request
        )
        return
      }

      const since = this.sse.getEventsSince(channel, after, limit)
      const events = since.map((entry) => ({ id: entry.id, data: entry.payload }))
      const cursor = events.length ? events[events.length - 1].id : after
      this.writeJson(response, { events, cursor }, 200, request)
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
      response.write(`data: ${JSON.stringify(snapshotPayload)}\n\n`)
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
        latestAlerts: this.alerts.getHistory().slice(0, 5),
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
      const handled = await this.serveOverlay(pathname, url, response)
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
      const soundId = subDir && (subDir === 'alerts' || subDir === 'board') ? `${subDir}/${fileName}` : fileName
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
          'Cache-Control': 'public, max-age=3600'
        })
        response.end(data)
        return
      } catch {}
    }
    this.writeJson(response, { error: 'Asset not found' }, 404, request)
  }

  private async serveOverlay(pathname: string, url: URL, response: ServerResponse): Promise<boolean> {
    const segments = pathname.split('/').filter(Boolean)
    let widgetId = segments[segments.length - 1]?.replace('.html', '').replace('.htm', '').toLowerCase().trim()

    if (!widgetId || widgetId === 'overlay' || widgetId === 'widget') return false

    const configRaw = url.searchParams.get('config')
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
      if (!widget || !configOverride) return widget
      return {
        ...widget,
        config: { ...(widget.config as any), ...(configOverride as any) }
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
      const html = generateOverlayHtml(widget, isPreview, {
        settings: db?.getAllSettings() || {},
        boardSounds: this.getSoundboardService()?.getAllSounds('board') || [],
        deckActions: db?.getAllDeckActions() || []
      })
      if (html) {
        // Browser sources get the SSE-with-polling-fallback runtime. Preview
        // requests (widget cards + editor modal iframes) need BOTH bootstraps:
        // the runtime, because templates reference it for state/subscriptions
        // even when IS_PREVIEW swaps in demo data, and the preview bootstrap,
        // which posts `ilystream:preview-ready` and accepts postMessage HTML
        // swaps from the editor modal. Serving bare HTML here left every
        // preview iframe blank and the modal waiting forever on READY.
        this.writeHtml(
          response,
          isPreview
            ? injectPreviewBootstrap(injectOverlayRuntimeBootstrap(html))
            : injectOverlayRuntimeBootstrap(html)
        )
        return true
      }
    }
    this.writeHtml(response, buildOverlayDirectoryHtml(widgetId), 404)
    return true
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
    const channel = value.split(',')[0]?.trim() as OverlayChannel
    return ALLOWED_OVERLAY_CHANNELS.has(channel) ? channel : null
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
    this.writeCorsHeaders(response, statusCode, 'application/json', request)
    response.end(json)
  }

  private writeHtml(response: ServerResponse, html: string, statusCode = 200, request?: IncomingMessage): void {
    // Overlay widget pages are dynamic and updated with the app. Without an
    // explicit no-cache, OBS/TikTok Live Studio's embedded Chromium caches the
    // page indefinitely and keeps rendering a stale (possibly broken) build even
    // after the app is updated — the classic "works in a browser, blank in OBS".
    this.writeCorsHeaders(response, statusCode, 'text/html; charset=utf-8', request, {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0'
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

  private async handleAvatarRequest(pathname: string, request: IncomingMessage, response: ServerResponse) {
    const base64Url = pathname.replace('/avatar/', '')
    if (!base64Url) {
      this.writeJson(response, { error: 'Missing avatar hash' }, 400, request)
      return
    }

    try {
      let b64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
      while (b64.length % 4) {
        b64 += '='
      }
      const decodedUrl = Buffer.from(b64, 'base64').toString('utf-8')
      if (!decodedUrl.startsWith('http')) {
        this.writeJson(response, { error: 'Invalid URL' }, 400, request)
        return
      }

      // Block SSRF: this route is reachable from the LAN, so reject any target
      // that is (or resolves to) a private/loopback/link-local address.
      try {
        await assertSafePublicHttpUrl(decodedUrl)
      } catch (err) {
        console.warn('[OverlayRouter] Blocked avatar URL:', err instanceof Error ? err.message : err)
        this.writeJson(response, { error: 'Blocked URL' }, 400, request)
        return
      }

      const hash = createHash('sha256').update(decodedUrl).digest('hex')
      const cachePath = join(this.avatarCacheDir, hash)

      try {
        await mkdir(this.avatarCacheDir, { recursive: true })
      } catch (e) {
        // Ignore
      }

      try {
        const fileStats = await stat(cachePath)
        if (fileStats.isFile()) {
          const data = await readFile(cachePath)
          this.writeCorsHeaders(response, 200, 'image/jpeg', request)
          response.end(data)
          return
        }
      } catch {
        // Does not exist
      }

      const res = await fetch(decodedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.tiktok.com/'
        }
      })

      if (!res.ok) {
        this.writeJson(response, { error: 'Failed to fetch avatar' }, res.status, request)
        return
      }

      const contentType = res.headers.get('Content-Type') || 'image/jpeg'
      if (!contentType.toLowerCase().startsWith('image/')) {
        this.writeJson(response, { error: 'Not an image' }, 415, request)
        return
      }
      const arrayBuffer = await res.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      if (buffer.byteLength > MAX_AVATAR_BYTES) {
        this.writeJson(response, { error: 'Avatar too large' }, 413, request)
        return
      }

      writeFile(cachePath, buffer).catch(err => console.error('[OverlayRouter] Failed to cache avatar', err))

      this.writeCorsHeaders(response, 200, contentType, request)
      response.setHeader('Cache-Control', 'public, max-age=31536000')
      response.end(buffer)
    } catch (err) {
      console.error('[OverlayRouter] Avatar proxy error:', err)
      this.writeJson(response, { error: 'Internal server error' }, 500, request)
    }
  }
}
