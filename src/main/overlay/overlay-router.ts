import type { IncomingMessage, ServerResponse } from 'http'
import { URL } from 'url'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { join, extname } from 'path'
import { randomBytes } from 'crypto'
import { resolveAppSettings } from '../../shared/app-settings'
import { buildDeckHtml } from './templates/deck'
import { buildCompanionHtml } from './templates/companion'
import {
  buildOverlayDirectoryHtml,
  generateOverlayHtml,
  getDefaultWidgetConfig,
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
    private emitDeckAction: (action: { type: string; payload?: unknown }) => void
  ) {}

  async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`)
    const pathname = url.pathname

    if (request.method === 'OPTIONS') {
      this.writeCorsHeaders(response, 204, 'application/json', request)
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
      const sounds = this.getSoundboardService()?.getAllSounds('board') || []
      const actions = this.getDb()?.getAllDeckActions() || []
      this.writeHtml(response, buildDeckHtml(sounds, actions, this.deckCsrfToken), 200, request)
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
        user: { username: 'tester', displayName: 'Test User', profilePictureUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=test' },
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
      '/overlay/state/latest-gifter': this.getLatestGifter()
    }

    if (stateMap[pathname]) {
      this.writeJson(response, stateMap[pathname], 200, request)
      return
    }

    if (pathname === '/overlay/events') {
      const channel = this.parseOverlayChannel(url.searchParams.get('channel') || 'chat')
      if (!channel) {
        this.writeJson(response, { error: 'Invalid overlay channel' }, 400, request)
        return
      }
      this.sse.attachClient(channel, request, response)

      const snapshot = (channel === 'chat' || channel === 'chat-unified') ? this.chat.getHistory() :
                      channel === 'alerts' ? [] :
                      channel === 'goals' ? this.goals.getState() :
                      channel === 'likes' ? this.likes.getSnapshot() :
                      channel === 'latest-gifter' ? this.getLatestGifter() :
                      channel === 'now-playing' ? this.nowPlaying.getState() :
                      null

      const snapshotPayload = { type: 'snapshot', payload: snapshot }
      console.log(`[overlay] SSE Snapshot for channel ${channel}:`, JSON.stringify(snapshotPayload))
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

  private getLatestGifter(): any {
    const db = this.getDb()
    if (!db) return null
    try {
      const saved = db.getSetting('last_gifter_v1')
      return saved ? JSON.parse(saved) : null
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

    let body = ''
    request.on('data', chunk => { body += chunk })
    request.on('end', () => {
      try {
        const action = JSON.parse(body)
        if (!action || typeof action.type !== 'string' || !action.type.trim()) {
          this.writeJson(response, { error: 'Invalid action' }, 400, request)
          return
        }
        this.emitDeckAction({ type: action.type.trim(), payload: action.payload })
        this.writeJson(response, { success: true }, 200, request)
      } catch (e) {
        this.writeJson(response, { error: 'Invalid body' }, 400, request)
      }
    })
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
      try { configOverride = JSON.parse(Buffer.from(configRaw, 'base64').toString('utf8')) } catch {}
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
        this.writeHtml(response, html)
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
    const deckToken = request.headers['x-ilystream-deck-token']
    if (deckToken === this.deckCsrfToken && this.isSameOriginRequest(request)) return true
    return this.authorizeRemoteControl(request, url)
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
    if (!origin) return true
    const host = request.headers.host
    if (!host) return false
    try {
      const parsed = new URL(origin)
      return parsed.host === host && (parsed.protocol === 'http:' || parsed.protocol === 'https:')
    } catch {
      return false
    }
  }

  private parseOverlayChannel(value: string): OverlayChannel | null {
    const channel = value.split(',')[0]?.trim() as OverlayChannel
    return ALLOWED_OVERLAY_CHANNELS.has(channel) ? channel : null
  }

  private writeCorsHeaders(response: ServerResponse, statusCode: number, contentType = 'application/json', request?: IncomingMessage): void {
    response.writeHead(statusCode, {
      'Content-Type': contentType,
      ...this.corsHeaders(request),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-ilyStream-Deck-Token',
      'Access-Control-Max-Age': '86400'
    })
  }

  private writeJson(response: ServerResponse, data: any, statusCode = 200, request?: IncomingMessage): void {
    const json = JSON.stringify(data)
    this.writeCorsHeaders(response, statusCode, 'application/json', request)
    response.end(json)
  }

  private writeHtml(response: ServerResponse, html: string, statusCode = 200, request?: IncomingMessage): void {
    this.writeCorsHeaders(response, statusCode, 'text/html; charset=utf-8', request)
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
}
