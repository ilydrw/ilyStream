import type { IncomingMessage, ServerResponse } from 'http'
import { URL } from 'url'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { join, extname } from 'path'
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
    private handleStreamEvent: (event: any) => void
  ) {}

  async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`)
    const pathname = url.pathname

    if (request.method === 'OPTIONS') {
      this.writeCorsHeaders(response, 204)
      response.end()
      return
    }

    if (request.method === 'HEAD') {
      this.writeCorsHeaders(response, 200, 'text/html')
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
      this.writeHtml(response, buildDeckHtml(sounds))
      return
    }

    if (pathname === '/test/alert') {
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
      this.writeJson(response, { success: true, message: 'Test alert sent' })
      return
    }

    if (pathname === '/test/like') {
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
      this.writeJson(response, { success: true, message: 'Test like sent' })
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
      })
      return
    }

    if (pathname === '/overlay/health' || pathname === '/health') {
      this.writeJson(response, pathname === '/health' ? 'OK' : this.getStatus())
      return
    }

    if (pathname === '/overlay/alerts/state') {
      const since = Number(url.searchParams.get('since') || 0)
      const alertHistory = this.alerts.getHistory()
      const filtered = Number.isFinite(since) && since > 0
        ? alertHistory.filter((alert) => Date.parse(alert.createdAt) > since)
        : alertHistory
      this.writeJson(response, filtered)
      return
    }

    const stateMap: Record<string, any> = {
      '/overlay/chat/state': this.chat.getHistory(),
      '/overlay/goals/state': this.goals.getState(),
      '/overlay/now-playing/state': this.nowPlaying.getState(),
      '/overlay/state/latest-gifter': (this.getStatus() as any).lastGifter // Last gifter still in server for now
    }

    if (stateMap[pathname]) {
      this.writeJson(response, stateMap[pathname])
      return
    }

    if (pathname === '/overlay/events') {
      const channel = (url.searchParams.get('channel') as OverlayChannel) || 'chat'
      this.sse.attachClient(channel, request, response)

      const snapshot = channel === 'chat' ? this.chat.getHistory() :
                      channel === 'alerts' ? [] :
                      channel === 'goals' ? this.goals.getState() :
                      channel === 'likes' ? this.likes.getSnapshot() :
                      this.nowPlaying.getState()

      response.write(`data: ${JSON.stringify({ type: 'snapshot', payload: snapshot })}\n\n`)
      return
    }

    if (pathname === '/overlay/deck/action' && request.method === 'POST') {
      await this.handleDeckAction(request, response, url)
      return
    }

    if (pathname === '/overlay/dual-vertical.html' || pathname === '/overlay/dual-vertical') {
      this.writeHtml(response, DUAL_VERTICAL_VIEWER_HTML)
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
      this.writeHtml(response, html)
      return
    }

    if (pathname === '/overlay/dual-vertical/stream.mjpeg') {
      this.attachDualVerticalClient(request, response)
      return
    }

    if (pathname.startsWith('/assets/') || pathname.startsWith('/sounds/')) {
      await this.serveAsset(pathname, response)
      return
    }

    if (pathname.toLowerCase().startsWith('/overlay/') || pathname.toLowerCase().startsWith('/widget/')) {
      const handled = await this.serveOverlay(pathname, url, response)
      if (handled) return
    }

    this.writeJson(response, { error: 'Overlay route not found.' }, 404)
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

  closeAllClients(): void {
    for (const client of this.dualVerticalClients) {
      try { client.end() } catch {}
    }
    this.dualVerticalClients.clear()
    this.dualVerticalLastFrame = null
  }

  private async handleDeckAction(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    const token = url.searchParams.get('token')
    const isLocal = request.socket.remoteAddress === '::1' ||
                   request.socket.remoteAddress === '127.0.0.1' ||
                   request.socket.remoteAddress === '::ffff:127.0.0.1'

    if (!isLocal && (!token || !this.getAuthService()?.verifyToken(token))) {
      this.writeJson(response, { error: 'Unauthorized' }, 401)
      return
    }

    let body = ''
    request.on('data', chunk => { body += chunk })
    request.on('end', () => {
      try {
        const action = JSON.parse(body)
        this.chat.broadcastFeature({ type: 'deck-action', action }) // Reusing chat for deck action broadcast if needed
        // The actual emission happens in OverlayServer for now to avoid circular deps
        this.writeJson(response, { success: true })
      } catch (e) {
        this.writeJson(response, { error: 'Invalid body' }, 400)
      }
    })
  }

  private async serveAsset(pathname: string, response: ServerResponse): Promise<void> {
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
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600'
        })
        response.end(data)
        return
      } catch {}
    }
    this.writeJson(response, { error: 'Asset not found' }, 404)
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
      'Access-Control-Allow-Origin': '*'
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

  private writeCorsHeaders(response: ServerResponse, statusCode: number, contentType = 'application/json'): void {
    response.writeHead(statusCode, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    })
  }

  private writeJson(response: ServerResponse, data: any, statusCode = 200): void {
    const json = JSON.stringify(data)
    this.writeCorsHeaders(response, statusCode)
    response.end(json)
  }

  private writeHtml(response: ServerResponse, html: string, statusCode = 200): void {
    this.writeCorsHeaders(response, statusCode, 'text/html; charset=utf-8')
    response.end(html)
  }
}
