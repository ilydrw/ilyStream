import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { EventEmitter } from 'events'
import { URL } from 'url'
import type { AnyStreamEvent, LikeEvent } from '../platforms/types'
import type {
  OverlayAlertItem,
  OverlayFeedItem,
  OverlayGoalState,
  OverlayRuntimeStatus
} from '../../shared/overlay'
import {
  createOverlayAlertItem,
  eventToOverlayFeedItem,
  limitHistory,
  shouldBroadcastParticleEvent
} from './overlay-payloads'
import { Database } from '../db/database'
import { AssetService } from '../system/asset-service'
import { RemoteAuthService } from '../services/remote-auth-service'
import {
  type NowPlayingPayload,
  EMPTY_NOW_PLAYING,
  type Widget,
  type WidgetType
} from '../../shared/widgets'
import { buildDeckHtml } from './templates/deck'
import {
  buildOverlayDirectoryHtml,
  generateOverlayHtml,
  getDefaultWidgetConfig,
  WIDGET_ALIAS_MAP
} from './widget-renderers'

type OverlayChannel = 'chat' | 'alerts' | 'goals' | 'now-playing' | 'follower-goal' | 'socials' | 'screen-border' | 'event-particles' | 'falling-roses' | 'gift-overlays' | 'particles' | 'discord-promo' | 'node-network' | 'latest-gifter' | 'physics' | 'deck' | 'leaderboard' | 'timer' | 'likes'
type LikesTrackerUser = {
  key: string
  displayName: string
  profilePictureUrl?: string
  count: number
}

const CHAT_HISTORY_LIMIT = 80
const ALERT_HISTORY_LIMIT = 20
const SSE_PING_INTERVAL_MS = 15000
const DEFAULT_PORT = 8899

import { readFile } from 'fs/promises'
import { join, extname, basename } from 'path'

export class OverlayServer extends EventEmitter {
  private db: Database | null = null
  private assetService: AssetService | null = null
  private authService: RemoteAuthService | null = null
  private soundboardService: any | null = null
  private deviceApi: import('./device-api').DeviceApi | null = null
  private server: Server | null = null
  private chatClients = new Set<ServerResponse<IncomingMessage>>()
  private alertClients = new Set<ServerResponse<IncomingMessage>>()
  private goalClients = new Set<ServerResponse<IncomingMessage>>()
  private nowPlayingClients = new Set<ServerResponse<IncomingMessage>>()
  private followerGoalClients = new Set<ServerResponse<IncomingMessage>>()
  private socialsClients = new Set<ServerResponse<IncomingMessage>>()
  private borderClients = new Set<ServerResponse<IncomingMessage>>()
  private particleClients = new Set<ServerResponse<IncomingMessage>>()
  private roseClients = new Set<ServerResponse<IncomingMessage>>()
  private particlesClients = new Set<ServerResponse<IncomingMessage>>()
  private discordPromoClients = new Set<ServerResponse<IncomingMessage>>()
  private nodeNetworkClients = new Set<ServerResponse<IncomingMessage>>()
  private latestGifterClients = new Set<ServerResponse<IncomingMessage>>()
  private physicsClients = new Set<ServerResponse<IncomingMessage>>()
  private deckClients = new Set<ServerResponse<IncomingMessage>>()
  private likesClients = new Set<ServerResponse<IncomingMessage>>()
  private likeTrackerUsers = new Map<string, LikesTrackerUser>()
  private likeTrackerTotalLikes = 0
  private nowPlayingState: NowPlayingPayload = { ...EMPTY_NOW_PLAYING }
  private chatHistory: OverlayFeedItem[] = []
  private alertHistory: OverlayAlertItem[] = []
  private goalState: OverlayGoalState = {
    totalLikes: 0,
    totalGiftCount: 0,
    totalGiftValueCents: 0,
    totalSubscriptions: 0,
    totalFollows: 0,
    totalShares: 0,
    totalRaids: 0,
    currentViewerCount: 0,
    lastUpdatedAt: null
  }
  private lastGifter: { username: string; amount: number; giftName: string } | null = null
  private status: OverlayRuntimeStatus = {
    running: false,
    port: null,
    requestedPort: null,
    lastError: null,
    startedAt: null,
    chatUrl: null,
    alertsUrl: null,
    goalsUrl: null,
    healthUrl: null,
    chatClientCount: 0,
    alertClientCount: 0,
    goalClientCount: 0
  }
  private pingTimer: NodeJS.Timeout | null = null
  private operationQueue: Promise<unknown> = Promise.resolve()
 
  setDatabase(db: Database): void {
    this.db = db
  }

  setAssetService(assetService: AssetService): void {
    this.assetService = assetService
  }

  setAuthService(authService: RemoteAuthService): void {
    this.authService = authService
  }

  setSoundboardService(soundboardService: any): void {
    this.soundboardService = soundboardService
  }

  setDeviceApi(deviceApi: import('./device-api').DeviceApi): void {
    this.deviceApi = deviceApi
  }

  getDeviceApi(): import('./device-api').DeviceApi | null {
    return this.deviceApi
  }

  getStatus(): OverlayRuntimeStatus {
    return { ...this.status }
  }

  getGoalState(): OverlayGoalState {
    return { ...this.goalState }
  }

  start(port: number = DEFAULT_PORT): Promise<OverlayRuntimeStatus> {
    return this.enqueue(async () => {
      await this.startInternal(port)
      return this.getStatus()
    })
  }

  setPort(port: number): Promise<OverlayRuntimeStatus> {
    return this.enqueue(async () => {
      if (this.status.running && this.status.port === port && !this.status.lastError) {
        return this.getStatus()
      }

      await this.stopInternal()
      await this.startInternal(port)
      return this.getStatus()
    })
  }

  stop(): Promise<void> {
    return this.enqueue(async () => {
      await this.stopInternal()
    })
  }

  /** Called by SpotifyService whenever the current track changes. */
  setNowPlaying(payload: NowPlayingPayload): void {
    this.nowPlayingState = payload
    this.broadcast('now-playing', { type: 'snapshot', payload })
    this.deviceApi?.broadcast('nowPlaying', payload)
  }

  broadcastSpeechState(isSpeaking: boolean, isAI: boolean): void {
    this.broadcast('node-network', {
      type: 'speech-state',
      isSpeaking,
      isAI
    })
    this.deviceApi?.broadcast('ttsState', { isSpeaking, isAI })
  }

  broadcastRelayMessage(payload: any): void {
    this.broadcast('chat', { type: 'relay-broadcast', payload })
  }

  broadcastFeatureMessage(payload: any): void {
    this.broadcast('chat', { type: 'feature-broadcast', payload })
    // Also broadcast to the unified widget if it exists
    this.broadcast('chat-unified' as any, { type: 'feature', payload })
  }

  handleStreamEvent(event: AnyStreamEvent): void {
    const feedItem = eventToOverlayFeedItem(event)
    if (feedItem) {
      // FILTER: Only allow chat, gift, follow, subscription, and raid in the main feed
      // This ensures 'likes' and 'shares' don't clutter the unified chat
      const allowedKinds = ['chat', 'gift', 'follow', 'subscription', 'raid']
      if (allowedKinds.includes(feedItem.kind)) {
        this.chatHistory = limitHistory([...this.chatHistory, feedItem], CHAT_HISTORY_LIMIT)
        this.broadcast('chat', { type: 'append', payload: feedItem })
        this.deviceApi?.appendChatItem(feedItem)
      }
      
      if (feedItem.kind === 'like') {
        const likePayload = this.updateLikeTrackerState(event as LikeEvent, feedItem)
        console.log('[overlay] Broadcasting like event:', feedItem.displayName, feedItem.amount);
        this.broadcast('likes', { type: 'append', payload: likePayload })
      }
    }
    this.updateGoalState(event)
    if (shouldBroadcastParticleEvent(event)) {
      this.broadcast('event-particles', { type: 'event', payload: event })
      this.broadcast('falling-roses', { type: 'event', payload: event })
      this.broadcast('particles', { type: 'event', payload: event })
    }

    if (event.type === 'gift') {
      this.lastGifter = {
        username: event.user.displayName,
        avatarUrl: event.user.profilePictureUrl || '',
        amount: event.giftCount || 1,
        giftName: event.giftName || 'Gift'
      }
      this.broadcast('latest-gifter', { type: 'update', data: this.lastGifter })
    }
  }

  /** Send a toast notification to the Deck (Car Thing) or other deck clients. */
  broadcastDeckNotification(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info'): void {
    this.broadcast('deck', { type: 'notification', payload: { message, type } })
    this.deviceApi?.broadcast('notification', { message, type })
  }

  broadcastPhysicsSpawn(payload: any): void {
    this.broadcast('physics', { type: 'spawn', payload })
  }

  pushAlert(
    payload: {
      id?: string
      template: string
      imageUrl?: string
      durationMs: number
      animationIn: 'fade' | 'slide' | 'bounce' | 'zoom'
      animationOut: 'fade' | 'slide' | 'tv-warp'
      textColor?: string
      backgroundColor?: string
      borderColor?: string
      fontSize?: number
      audioUrl?: string
      audioVolume?: number
      imageTop?: number
      imageLeft?: number
      alertTop?: number
      alertLeft?: number
    },
    platform: string
  ): void {
    const finalPayload = { ...payload }

    // Resolve local asset IDs to data URLs or HTTP paths
    if (this.assetService && finalPayload.imageUrl && !finalPayload.imageUrl.startsWith('http') && !finalPayload.imageUrl.startsWith('data:')) {
      const dataUrl = this.assetService.getAssetDataUrl(finalPayload.imageUrl)
      if (dataUrl) {
        finalPayload.imageUrl = dataUrl
      } else {
        // Fallback to HTTP path
        finalPayload.imageUrl = `/assets/${finalPayload.imageUrl}`
      }
    }

    if (this.assetService && finalPayload.audioUrl && !finalPayload.audioUrl.startsWith('http') && !finalPayload.audioUrl.startsWith('data:')) {
      const dataUrl = this.assetService.getAssetDataUrl(finalPayload.audioUrl)
      if (dataUrl) {
        finalPayload.audioUrl = dataUrl
      } else {
        // Fallback to HTTP path
        // Check if it already has a category prefix
        if (finalPayload.audioUrl.startsWith('alerts/') || finalPayload.audioUrl.startsWith('board/')) {
          finalPayload.audioUrl = `/sounds/${finalPayload.audioUrl}`
        } else {
          finalPayload.audioUrl = `/sounds/alerts/${finalPayload.audioUrl}`
        }
      }
    }

    const alertItem = createOverlayAlertItem(finalPayload as any, platform)
    this.alertHistory = limitHistory([...this.alertHistory, alertItem], ALERT_HISTORY_LIMIT)
    this.broadcast('alerts', { type: 'append', payload: alertItem })
    this.emit('show-alert', alertItem)
  }
  
  broadcastWidgetUpdate(type: string, id: string): void {
    const channelMap: Record<string, OverlayChannel> = {
      'chat': 'chat',
      'alerts': 'alerts',
      'now-playing': 'now-playing',
      'spotify': 'now-playing',
      'follower-goal': 'follower-goal',
      'socials': 'socials',
      'screen-border': 'screen-border',
      'event-particles': 'event-particles',
      'gift-overlays': 'event-particles',
      'falling-roses': 'falling-roses',
      'particles': 'particles',
      'discord-promo': 'discord-promo',
      'node-network': 'node-network',
      'latest-gifter': 'latest-gifter',
      'physics': 'physics',
      'deck': 'deck'
    }
    const channel = channelMap[type]
    if (channel) {
      this.broadcast(channel, { type: 'reload', id })
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operationQueue.then(operation, operation)
    this.operationQueue = next.catch(() => undefined)
    return next
  }

  private async startInternal(port: number): Promise<void> {
    console.log(`[overlay] startInternal on port ${port}...`)
    this.status.requestedPort = port
    this.status.lastError = null

    const existingServer = this.server
    const existingPort = this.getServerPort(existingServer)
    if (existingServer && existingPort === port) {
      this.markRunning(port)
      this.emitStatusChanged()
      return
    }

    try {
      const { server, actualPort } = await this.createListeningServer(port)
      this.server = server
      this.markRunning(actualPort)
      this.startPingLoop()
      this.updateClientCounts()
      console.log(`[overlay] Server successfully started on port ${actualPort}`)
      console.log(`[overlay] Alert URL: ${this.status.alertsUrl}`)
    } catch (error) {
      const recoveredPort = this.getServerPort(existingServer)
      if (existingServer && recoveredPort) {
        this.server = existingServer
        this.markRunning(recoveredPort)
        this.updateClientCounts()
        console.warn(
          `[overlay] Duplicate start failed, preserving existing server on port ${recoveredPort}:`,
          error instanceof Error ? error.message : error
        )
        this.emitStatusChanged()
        return
      }

      this.server = null
      this.status.running = false
      this.status.port = null
      this.status.startedAt = null
      this.status.chatUrl = null
      this.status.alertsUrl = null
      this.status.goalsUrl = null
      this.status.healthUrl = null
      this.status.lastError = error instanceof Error ? error.message : String(error)
    }

    this.emitStatusChanged()
  }

  private async stopInternal(): Promise<void> {
    this.stopPingLoop()
    this.closeClients(this.chatClients)
    this.closeClients(this.alertClients)
    this.closeClients(this.goalClients)
    this.closeClients(this.nowPlayingClients)
    this.closeClients(this.followerGoalClients)
    this.closeClients(this.socialsClients)
    this.closeClients(this.borderClients)
    this.closeClients(this.particleClients)
    this.closeClients(this.roseClients)
    this.closeClients(this.particlesClients)
    this.closeClients(this.discordPromoClients)
    this.closeClients(this.nodeNetworkClients)
    this.closeClients(this.latestGifterClients)
    this.closeClients(this.physicsClients)
    this.closeClients(this.deckClients)
    this.closeClients(this.likesClients)
    this.chatClients.clear()
    this.alertClients.clear()
    this.goalClients.clear()
    this.nowPlayingClients.clear()
    this.followerGoalClients.clear()
    this.socialsClients.clear()
    this.borderClients.clear()
    this.particleClients.clear()
    this.roseClients.clear()
    this.particlesClients.clear()
    this.physicsClients.clear()
    this.deckClients.clear()
    this.likesClients.clear()
    this.updateClientCounts()

    if (!this.server) {
      this.status.running = false
      this.status.port = null
      this.status.startedAt = null
      this.status.chatUrl = null
      this.status.alertsUrl = null
      this.status.goalsUrl = null
      this.status.healthUrl = null
      this.emitStatusChanged()
      return
    }

    const server = this.server
    this.server = null

    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })

    this.status.running = false
    this.status.port = null
    this.status.startedAt = null
    this.status.chatUrl = null
    this.status.alertsUrl = null
    this.status.goalsUrl = null
    this.status.healthUrl = null
    this.status.particlesUrl = this.makeUrl('/overlay/particles.html')
    this.emitStatusChanged()
  }

  private async createListeningServer(
    port: number
  ): Promise<{ server: Server; actualPort: number }> {
    return await new Promise((resolve, reject) => {
      const server = createServer((request, response) => {
        console.log(`[overlay] Incoming Request: ${request.method} ${request.url}`)
        void this.handleRequest(request, response)
      })

      server.once('error', (error) => {
        reject(error)
      })

      server.listen(port, () => {
        server.removeAllListeners('error')
        server.on('error', (error) => {
          this.status.lastError = error instanceof Error ? error.message : String(error)
          this.emitStatusChanged()
        })

        const address = server.address()
        const actualPort =
          typeof address === 'object' && address ? address.port : port
        resolve({ server, actualPort })
      })
    })
  }

  private async handleRequest(
    request: IncomingMessage,
    response: ServerResponse<IncomingMessage>
  ): Promise<void> {
    try {
      const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`)
      const pathname = url.pathname
      console.log(`[overlay-request] ${request.method} ${pathname}`)

      // CORS Preflight
      if (request.method === 'OPTIONS') {
        response.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400'
        })
        response.end()
        return
      }

      if (request.method === 'HEAD') {
        response.writeHead(200, {
          'Content-Type': 'text/html',
          'Access-Control-Allow-Origin': '*'
        })
        response.end()
        return
      }

      // DeskThing / device LAN API
      if (this.deviceApi && pathname.startsWith('/api/v1/')) {
        const handled = await this.deviceApi.handleRequest(request, response, pathname)
        if (handled) return
      }

      if (pathname === '/overlay/deck') {
        const sounds = this.soundboardService?.getAllSounds('board') || []
        this.writeHtml(response, buildDeckHtml(sounds))
        return
      }

    // Test Alert Endpoint
    if (pathname === '/test/alert') {
      const type = url.searchParams.get('type') || 'follow'
      const label =
        type === 'gift' ? 'Test User sent 1x Rose!' :
        type === 'subscription' || type === 'superfan' ? 'Test User just subscribed!' :
        'Test User is now following!'

      this.pushAlert(
        {
          id: `test-alert-${Date.now()}`,
          template: label,
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
        },
        'tiktok'
      )
      this.writeJson(response, { success: true, message: 'Test alert sent' })
      return
    }

    // Test Like Endpoint
    if (pathname === '/test/like') {
      const testEvent = {
        id: 'test-' + Date.now(),
        platform: 'tiktok',
        type: 'like' as const,
        timestamp: new Date(),
        user: {
          username: 'tester',
          displayName: 'Test User',
          profilePictureUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=test'
        },
        likeCount: 100,
        totalLikes: 5000,
        raw: {}
      };
      this.handleStreamEvent(testEvent);
      this.writeJson(response, { success: true, message: 'Test like sent' });
      return;
    }

    // Debug Endpoint
    if (pathname === '/debug/server') {
      this.writeJson(response, {
        status: 'UP',
        port: this.status.port,
        running: this.status.running,
        uptime: this.status.startedAt ? Math.floor((Date.now() - Date.parse(this.status.startedAt)) / 1000) : 0,
        clients: {
          chat: this.chatClients.size,
          alerts: this.alertClients.size,
          goals: this.goalClients.size
        }
      })
      return
    }

    // Consolidated Overlay HTML Resolution below

    // Health Check
    if (pathname === '/overlay/health' || pathname === '/health') {
      this.writeJson(response, pathname === '/health' ? 'OK' : this.getStatus())
      return
    }

    // State Endpoints
    if (pathname === '/overlay/alerts/state') {
      const since = Number(url.searchParams.get('since') || 0)
      const alerts = Number.isFinite(since) && since > 0
        ? this.alertHistory.filter((alert) => Date.parse(alert.createdAt) > since)
        : this.alertHistory
      this.writeJson(response, alerts)
      return
    }

    const stateMap: Record<string, any> = {
      '/overlay/chat/state': this.chatHistory.filter(i => !['like', 'share'].includes(i.kind)),
      '/overlay/goals/state': this.goalState,
      '/overlay/now-playing/state': this.nowPlayingState,
      '/overlay/state/latest-gifter': this.lastGifter
    }

    if (stateMap[pathname]) {
      this.writeJson(response, stateMap[pathname])
      return
    }

    // SSE Endpoint
    if (pathname === '/overlay/events') {
      const channel = (url.searchParams.get('channel') as OverlayChannel) || 'chat'
      const validChannels: OverlayChannel[] = [
        'chat', 'alerts', 'goals', 'now-playing', 'follower-goal',
        'socials', 'screen-border', 'event-particles', 'falling-roses', 'particles',
        'discord-promo', 'node-network', 'latest-gifter', 'physics', 'deck', 'likes'
      ]

      if (!validChannels.includes(channel) && channel !== 'gift-overlays') {
        this.writeJson(response, { error: 'Missing or invalid overlay channel.' }, 400)
        return
      }

      this.attachSseClient(channel, request, response)
      return
    }

    // Deck Action POST Handler
    if (pathname === '/overlay/deck/action' && request.method === 'POST') {
      const token = url.searchParams.get('token')
      const isLocal = request.socket.remoteAddress === '::1' || 
                     request.socket.remoteAddress === '127.0.0.1' || 
                     request.socket.remoteAddress === '::ffff:127.0.0.1'

      if (!isLocal && (!token || !this.authService?.verifyToken(token))) {
        this.writeJson(response, { error: 'Unauthorized' }, 401)
        return
      }

      let body = ''
      request.on('data', chunk => { body += chunk })
      request.on('end', () => {
        try {
          const action = JSON.parse(body)
          this.emit('deck-action', action)
          this.writeJson(response, { success: true })
        } catch (e) {
          this.writeJson(response, { error: 'Invalid body' }, 400)
        }
      })
      return
    }

    // Asset Serving (Images/Sounds)
    if (pathname.startsWith('/assets/') || pathname.startsWith('/sounds/')) {
      const isSound = pathname.startsWith('/sounds/')
      const fileName = decodeURIComponent(pathname.split('/').pop() || '')
      const subDir = pathname.split('/')[2] || '' // For /sounds/alerts/...
      
      let filePath: string | null = null
      
      if (isSound) {
        // Handle /sounds/alerts/name.mp3 or /sounds/board/name.mp3 or /sounds/name.mp3
        if (this.soundboardService) {
          const soundId = subDir && (subDir === 'alerts' || subDir === 'board') 
            ? `${subDir}/${fileName}` 
            : fileName
          filePath = this.soundboardService.getSoundPath(soundId)
        }
      } else {
        // Handle /assets/name.png
        if (this.assetService) {
          filePath = this.assetService.getAssetPath(fileName)
        }
      }

      if (filePath && existsSync(filePath)) {
        try {
          const data = await readFile(filePath)
          const ext = extname(filePath).toLowerCase()
          const mimeTypes: Record<string, string> = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml',
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.ogg': 'audio/ogg'
          }
          response.writeHead(200, {
            'Content-Type': mimeTypes[ext] || 'application/octet-stream',
            'Content-Length': data.length,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=3600'
          })
          response.end(data)
          return
        } catch (err) {
          console.error('[overlay] Asset Read Error:', err)
        }
      }
      
      this.writeJson(response, { error: 'Asset not found' }, 404)
      return
    }


    // Overlay HTML Endpoints
    const lowerPath = pathname.toLowerCase();
    if (lowerPath.startsWith('/overlay/') || lowerPath.startsWith('/widget/')) {
      const segments = pathname.split('/').filter(Boolean);
      // More robust widgetId resolution: handle .html, trailing slashes, and common suffixes
      let widgetId = segments[segments.length - 1]
        ?.replace('.html', '')
        ?.replace('.htm', '')
        ?.toLowerCase()
        ?.trim();
      
      console.log(`[overlay] Resolving widgetId: "${widgetId}" from path: "${pathname}"`)
      
      if (widgetId && widgetId !== 'overlay' && widgetId !== 'widget') {
        // Config Override (base64 json)
        const configRaw = url.searchParams.get('config')
        let configOverride: any = null
        if (configRaw) {
          try {
            configOverride = JSON.parse(Buffer.from(configRaw, 'base64').toString('utf8'))
          } catch (e) {
            console.warn('[overlay] Failed to parse config override:', e)
          }
        }

        const applyOverride = (widget: Widget | undefined): Widget | undefined => {
          if (!widget || !configOverride) return widget
          return { ...widget, config: { ...widget.config, ...configOverride } }
        }

        const typeFromAlias = WIDGET_ALIAS_MAP[widgetId]
        let widget: Widget | undefined

        const getWidgetById = (id: string): Widget | undefined => {
          const db = this.db as any
          return db?.getWidget?.(id) || db?.getAllWidgets?.().find((w: Widget) => w.id === id)
        }

        if (typeFromAlias) {
          const base = this.db?.getAllWidgets().find(w => w.type === typeFromAlias)
          widget = applyOverride(base || {
            id: 'default',
            name: 'Default',
            type: typeFromAlias as WidgetType,
            config: getDefaultWidgetConfig(typeFromAlias as WidgetType)
          })
        } else {
          // Fallback to ID lookup
          widget = applyOverride(getWidgetById(widgetId))
        }

        if (widget) {
          const isPreview = url.searchParams.get('preview') === '1' || url.searchParams.has('preview')
          const html = generateOverlayHtml(widget, isPreview, {
            settings: this.db?.getAllSettings() || {},
            boardSounds: this.soundboardService?.getAllSounds('board') || [],
            deckActions: this.db?.getAllDeckActions() || []
          })
          if (html) {
            this.writeHtml(response, html)
            return
          }
        }

        this.writeHtml(response, buildOverlayDirectoryHtml(widgetId), 404)
        return
      }
    }

    this.writeJson(response, { error: 'Overlay route not found.' }, 404)
    } catch (err) {
      console.error('[overlay] Critical Request Error:', err)
      this.writeJson(response, { error: 'Internal Server Error', message: err instanceof Error ? err.message : String(err) }, 500)
    }
  }

  private attachSseClient(
    channel: OverlayChannel,
    request: IncomingMessage,
    response: ServerResponse<IncomingMessage>
  ): void {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    })

    response.write(': connected\n\n')

    const clients = this.clientsFor(channel)
    clients.add(response)
    this.updateClientCounts()

    const snapshot =
      channel === 'chat'
        ? this.chatHistory.filter(i => !['like', 'share'].includes(i.kind))
        : channel === 'alerts'
          ? []
          : channel === 'goals'
            ? this.goalState
            : channel === 'likes'
              ? this.getLikesTrackerSnapshot()
              : this.nowPlayingState
    this.writeSse(response, { type: 'snapshot', payload: snapshot })

    request.on('close', () => {
      clients.delete(response)
      this.updateClientCounts()
      // Ensure the socket is fully severed
      try { response.end() } catch {}
    })
  }

  private broadcast(channel: OverlayChannel, payload: unknown): void {
    const clients = this.clientsFor(channel)

    for (const client of [...clients]) {
      try {
        this.writeSse(client, payload)
      } catch {
        clients.delete(client)
      }
    }

    this.updateClientCounts()
  }

  private updateLikeTrackerState(event: LikeEvent, feedItem: OverlayFeedItem): OverlayFeedItem & { totalLikes: number } {
    const amount = Math.max(1, Math.floor(event.likeCount || feedItem.amount || 1))
    this.likeTrackerTotalLikes += amount

    if (Number.isFinite(event.totalLikes) && event.totalLikes > this.likeTrackerTotalLikes) {
      this.likeTrackerTotalLikes = event.totalLikes
    }

    const key = `${event.platform}:${event.user.username || event.user.id || feedItem.displayName}`.toLowerCase()
    const existing = this.likeTrackerUsers.get(key) ?? {
      key,
      displayName: event.user.displayName || event.user.username || feedItem.displayName,
      profilePictureUrl: event.user.profilePictureUrl || feedItem.profilePictureUrl,
      count: 0
    }

    existing.displayName = event.user.displayName || event.user.username || existing.displayName
    existing.profilePictureUrl = event.user.profilePictureUrl || existing.profilePictureUrl
    existing.count += amount
    this.likeTrackerUsers.set(key, existing)

    return {
      ...feedItem,
      displayName: existing.displayName,
      profilePictureUrl: existing.profilePictureUrl,
      amount,
      meta: this.likeTrackerTotalLikes > 0 ? `${this.likeTrackerTotalLikes.toLocaleString()} total` : undefined,
      totalLikes: this.likeTrackerTotalLikes
    }
  }

  private getLikesTrackerSnapshot(): { totalLikes: number; users: LikesTrackerUser[] } {
    return {
      totalLikes: this.likeTrackerTotalLikes,
      users: Array.from(this.likeTrackerUsers.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 50)
    }
  }

  private clientsFor(channel: OverlayChannel): Set<ServerResponse<IncomingMessage>> {
    switch (channel) {
      case 'chat':
        return this.chatClients
      case 'alerts':
        return this.alertClients
      case 'goals':
        return this.goalClients
      case 'now-playing':
        return this.nowPlayingClients
      case 'follower-goal':
        return this.followerGoalClients
      case 'socials':
        return this.socialsClients
      case 'screen-border':
        return this.borderClients
      case 'event-particles':
        return this.particleClients
      case 'falling-roses':
        return this.roseClients
      case 'particles':
        return this.particlesClients
      case 'discord-promo':
        return this.discordPromoClients
      case 'node-network':
        return this.nodeNetworkClients
      case 'physics':
        return this.physicsClients
      case 'deck':
        return this.deckClients
      case 'leaderboard':
        return this.alertClients 
      case 'chat-unified':
        return this.chatClients 
      case 'likes':
        return this.likesClients
    }
    return this.chatClients
  }

  private writeSse(response: ServerResponse<IncomingMessage>, payload: unknown): void {
    response.write(`data: ${JSON.stringify(payload)}\n\n`)
  }

  private writeJson(response: ServerResponse<IncomingMessage>, data: any, statusCode = 200): void {
    const json = JSON.stringify(data)
    response.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(json),
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    })
    response.end(json)
  }

  private writeHtml(response: ServerResponse<IncomingMessage>, html: string): void {
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    })
    response.end(html)
  }

  private closeClients(clients: Set<ServerResponse<IncomingMessage>>): void {
    for (const client of clients) {
      try {
        client.end()
      } catch {
        // Ignore shutdown noise from stale sockets.
      }
    }
  }

  private startPingLoop(): void {
    this.stopPingLoop()
    this.pingTimer = setInterval(() => {
      for (const client of [
        ...this.chatClients,
        ...this.alertClients,
        ...this.goalClients,
        ...this.nowPlayingClients,
        ...this.followerGoalClients,
        ...this.socialsClients,
        ...this.borderClients,
        ...this.particleClients,
        ...this.roseClients,
        ...this.particlesClients,
        ...this.nodeNetworkClients,
        ...this.latestGifterClients,
        ...this.physicsClients
      ]) {
        try {
          client.write(': ping\n\n')
        } catch {
          this.chatClients.delete(client)
          this.alertClients.delete(client)
          this.goalClients.delete(client)
          this.nowPlayingClients.delete(client)
          this.followerGoalClients.delete(client)
          this.socialsClients.delete(client)
          this.borderClients.delete(client)
          this.particleClients.delete(client)
          this.roseClients.delete(client)
          this.particlesClients.delete(client)
          this.nodeNetworkClients.delete(client)
          this.latestGifterClients.delete(client)
          this.physicsClients.delete(client)
        }
      }

      this.updateClientCounts()
    }, SSE_PING_INTERVAL_MS)
  }

  private stopPingLoop(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  private updateClientCounts(): void {
    this.status.chatClientCount = this.chatClients.size
    this.status.alertClientCount = this.alertClients.size
    this.status.goalClientCount = this.goalClients.size
    this.status.followerGoalClientCount = this.followerGoalClients.size
    this.status.socialsClientCount = this.socialsClients.size
    this.status.borderClientCount = this.borderClients.size
    this.status.particleClientCount = this.particleClients.size
    this.status.roseClientCount = this.roseClients.size
    this.status.likesClientCount = this.likesClients.size
  }

  private emitStatusChanged(): void {
    this.emit('status', this.getStatus())
  }

  private markRunning(port: number): void {
    this.status.running = true
    this.status.port = port
    this.status.startedAt = this.status.startedAt || new Date().toISOString()
    this.status.chatUrl = this.makeUrl('/overlay/chat.html')
    this.status.alertsUrl = this.makeUrl('/overlay/alerts.html')
    this.status.goalsUrl = this.makeUrl('/overlay/goals.html')
    this.status.healthUrl = this.makeUrl('/overlay/health')
    this.status.deckUrl = this.makeUrl('/overlay/deck')
    this.status.particlesUrl = this.makeUrl('/overlay/particles.html')
    this.status.lastError = null
  }

  private getServerPort(server: Server | null): number | null {
    const address = server?.address()
    return typeof address === 'object' && address !== null ? address.port : null
  }

  private makeUrl(pathname: string): string | null {
    if (!this.status.port) return null
    return `http://127.0.0.1:${this.status.port}${pathname}`
  }

  private updateGoalState(event: AnyStreamEvent): void {
    switch (event.type) {
      case 'like':
        this.goalState.totalLikes += event.likeCount
        break
      case 'gift':
        if (event.isCombo) return
        this.goalState.totalGiftCount += event.giftCount
        this.goalState.totalGiftValueCents += event.monetaryValue
        break
      case 'subscription':
        this.goalState.totalSubscriptions += 1
        break
      case 'follow':
        this.goalState.totalFollows += 1
        break
      case 'share':
        this.goalState.totalShares += 1
        break
      case 'raid':
        this.goalState.totalRaids += 1
        break
      case 'viewer-count':
        this.goalState.currentViewerCount = event.count
        break
      default:
        return
    }

    this.goalState.lastUpdatedAt = new Date().toISOString()
    this.broadcast('goals', { type: 'snapshot', payload: this.goalState })
    this.deviceApi?.broadcast('goals', this.goalState)
  }
}

/** Convert "#rrggbb" + 0..1 alpha to "rgba(r,g,b,a)". Falls back to a sensible default. */
function hexToRgba(hex: string, alpha: number): string {
  const cleaned = (hex || '').replace('#', '').trim()
  if (cleaned.length !== 6) return `rgba(11,13,16,${alpha})`
  const r = parseInt(cleaned.slice(0, 2), 16)
  const g = parseInt(cleaned.slice(2, 4), 16)
  const b = parseInt(cleaned.slice(4, 6), 16)
  if ([r, g, b].some((n) => Number.isNaN(n))) return `rgba(11,13,16,${alpha})`
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
