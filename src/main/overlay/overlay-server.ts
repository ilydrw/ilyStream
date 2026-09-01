import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { EventEmitter } from 'events'
import { randomBytes } from 'crypto'
import { networkInterfaces } from 'os'
import type { AnyStreamEvent } from '../platforms/types'
import type { OverlayRuntimeStatus } from '../../shared/overlay'
import { Database } from '../db/database'
import { AssetService } from '../system/asset-service'
import { RemoteAuthService } from '../services/remote-auth-service'
import type { NowPlayingPayload } from '../../shared/widgets'
import { SSEManager } from './sse-manager'
import { OverlayRouter } from './overlay-router'
import { OverlayWebSocketManager } from './overlay-websocket-manager'
import { ChatManager } from './managers/chat-manager'
import { AlertManager } from './managers/alert-manager'
import { GoalManager } from './managers/goal-manager'
import { NowPlayingManager } from './managers/now-playing-manager'
import { LikesTracker, type AcceptedLikeProgress } from './managers/likes-tracker'
import { DEFAULT_PORT, type OverlayChannel } from './types'
import { shouldBroadcastParticleEvent } from './overlay-payloads'
import { renderWidgetPreviewContent } from './widget-renderers'
import {
  getWidgetEventChannel,
  WIDGET_RUNTIME_REGISTRY,
  type Widget,
  type WidgetType
} from '../../shared/widgets'
import type { UISettings } from '../../shared/app-settings'
import { resolveAppThemePalette } from '../../shared/app-themes'
import type { DeviceThemeState } from '../../shared/device-api'

// Browser-source routes stay on their local listener. Companion pairing starts a
// separate deny-by-default listener that admits only the device API namespace.
// Power users can still explicitly override the local listener through
// ILYSTREAM_OVERLAY_HOST; pairing itself never widens that listener.
const DEFAULT_LISTEN_HOST = '127.0.0.1'
const DEVICE_LISTEN_HOST = '0.0.0.0'
const DEVICE_PORT_SEARCH_LIMIT = 20
const ALLOWED_LISTEN_HOSTS = new Set(['0.0.0.0', '127.0.0.1', 'localhost', '::1', '::'])

function resolveListenHost(): string {
  const requested = (process.env.ILYSTREAM_OVERLAY_HOST || DEFAULT_LISTEN_HOST).trim()
  if (!requested) return DEFAULT_LISTEN_HOST
  if (ALLOWED_LISTEN_HOSTS.has(requested)) return requested
  console.warn(`[OverlayServer] Using non-loopback overlay host from ILYSTREAM_OVERLAY_HOST: ${requested}`)
  return requested
}

function getLanIPv4Addresses(): string[] {
  const addresses = new Set<string>()
  for (const [name, entries] of Object.entries(networkInterfaces())) {
    if (isVirtualNetworkInterface(name)) continue

    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal && isUsableLanIPv4(entry.address)) {
        addresses.add(entry.address)
      }
    }
  }
  return [...addresses]
}

function isUsableLanIPv4(address: string): boolean {
  if (
    address.startsWith('127.') ||
    address.startsWith('169.254.') ||
    address === '0.0.0.0'
  ) {
    return false
  }

  return (
    address.startsWith('10.') ||
    address.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(address)
  )
}

function isVirtualNetworkInterface(name: string): boolean {
  return /\b(vmware|virtualbox|vbox|hyper-v|vethernet|docker|wsl|loopback)\b/i.test(name)
}

function formatHostPort(host: string, port: number): string {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]:${port}` : `${host}:${port}`
}

function getDevicePortCandidates(overlayPort: number): number[] {
  const candidates: number[] = []
  let offset = 1

  while (candidates.length < DEVICE_PORT_SEARCH_LIMIT) {
    let candidate = overlayPort + offset
    if (candidate > 65535) candidate = 1024 + (candidate - 65536)
    offset += 1
    if (candidate === overlayPort || candidates.includes(candidate)) continue
    candidates.push(candidate)
  }

  return candidates
}

export class OverlayServer extends EventEmitter {
  private db: Database | null = null
  private assetService: AssetService | null = null
  private authService: RemoteAuthService | null = null
  private deviceApi: any | null = null
  private obsService: any | null = null
  private platformManager: any | null = null
  private soundboardService: any | null = null
  private statsService: any | null = null
  private economyService: any | null = null
  private server: Server | null = null
  private deviceServer: Server | null = null
  private webSockets: OverlayWebSocketManager | null = null
  private readonly webSocketCapability = randomBytes(32).toString('base64url')
  private devicePort: number | null = null
  private listenHost = DEFAULT_LISTEN_HOST
  private deviceLanEnabled = false

  private sse: SSEManager
  private router: OverlayRouter
  private chat: ChatManager
  private alerts: AlertManager
  private goals: GoalManager
  private nowPlaying: NowPlayingManager
  private likes: LikesTracker

  private status: OverlayRuntimeStatus = {
    running: false,
    port: null,
    requestedPort: null,
    listenHost: null,
    devicePort: null,
    deviceListenHost: null,
    deviceLastError: null,
    deviceHost: null,
    deviceHosts: [],
    devicePairUrl: null,
    devicePairUrls: [],
    lastError: null,
    startedAt: null,
    chatUrl: null,
    alertsUrl: null,
    goalsUrl: null,
    healthUrl: null,
    webSocketCapability: this.webSocketCapability,
    chatClientCount: 0,
    alertClientCount: 0,
    goalClientCount: 0
  }

  private operationQueue: Promise<unknown> = Promise.resolve()
  private widgetConfigRevision = 0

  constructor() {
    super()
    this.sse = new SSEManager(
      () => this.updateClientCounts(),
      (channel, payload, clientCount, eventId) => {
        this.webSockets?.broadcast(channel, payload, eventId)
        const totalClientCount = clientCount + (this.webSockets?.getSubscriptionCount(channel) || 0)
        this.emit('overlay-broadcast', {
          channel,
          payload,
          clientCount: totalClientCount,
          at: new Date().toISOString()
        })
      }
    )
    this.chat = new ChatManager(this.sse)
    this.alerts = new AlertManager(this.sse)
    this.goals = new GoalManager(this.sse, null)
    this.nowPlaying = new NowPlayingManager(this.sse, null)
    this.likes = new LikesTracker(this.sse)

    this.alerts.on('show-alert', (alert) => this.emit('show-alert', alert))

    this.router = new OverlayRouter(
      () => this.db,
      () => this.assetService,
      () => this.soundboardService,
      () => this.authService,
      () => this.deviceApi,
      this.sse,
      this.chat,
      this.alerts,
      this.goals,
      this.nowPlaying,
      this.likes,
      () => this.getStatus(),
      () => this.obsService?.getStatus() || null,
      () => this.platformManager?.getViewerCounts() || {},
      (event) => this.handleStreamEvent(event),
      (action) => this.emit('deck-action', action),
      () => this.statsService,
      () => this.economyService?.getLeaderboardSnapshot?.() || [],
      () => this.platformManager?.getDiscordCallState?.() || null,
      () => this.webSocketCapability
    )
  }

  setDatabase(db: Database): void { this.db = db }
  setAssetService(assetService: AssetService): void { this.assetService = assetService }
  setAuthService(authService: RemoteAuthService): void { this.authService = authService }
  setSoundboardService(soundboardService: any): void { this.soundboardService = soundboardService }
  setDeviceApi(deviceApi: any): void {
    this.deviceApi = deviceApi
    if (typeof deviceApi?.setDiagnosticsSink === 'function') {
      deviceApi.setDiagnosticsSink((packet: unknown) => this.emit('device-broadcast', packet))
    }
    this.chat.setDeviceApi(deviceApi)
    this.goals.setDeviceApi(deviceApi)
    this.nowPlaying.setDeviceApi(deviceApi)
  }
  setObsService(obsService: any): void { this.obsService = obsService }
  setPlatformManager(platformManager: any): void { this.platformManager = platformManager }
  setStatsService(statsService: any): void { this.statsService = statsService }
  setEconomyService(economyService: any): void { this.economyService = economyService }

  async ensureLanAccess(): Promise<OverlayRuntimeStatus> {
    this.deviceLanEnabled = true
    const port = this.status.port || this.status.requestedPort || DEFAULT_PORT

    if (this.status.running && this.deviceServer) {
      return this.getStatus()
    }

    return this.enqueue(async () => {
      if (!this.status.running) {
        await this.startInternal(port)
      } else if (!this.deviceServer) {
        try {
          await this.startDeviceServer(this.status.port || port)
          this.status.deviceLastError = null
          this.updateDeviceStatus()
          this.emit('status', this.getStatus())
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          this.status.deviceLastError = message
          this.updateDeviceStatus()
          this.emit('status', this.getStatus())
          throw error
        }
      }

      if (!this.status.running) {
        throw new Error(this.status.lastError || 'Overlay server is unavailable')
      }
      if (!this.deviceServer) {
        throw new Error(this.status.deviceLastError || 'Device API listener is unavailable')
      }
      return this.getStatus()
    })
  }

  getStatus(): OverlayRuntimeStatus {
    return {
      ...this.status,
      webSocketCapability: this.webSocketCapability,
      chatClientCount: this.getOverlayClientCount('chat'),
      alertClientCount: this.getOverlayClientCount('alerts'),
      goalClientCount: this.getOverlayClientCount('goals'),
      followerGoalClientCount: this.getOverlayClientCount('follower-goal'),
      textWidgetClientCount: this.getOverlayClientCount('text'),
      socialsClientCount: this.getOverlayClientCount('socials'),
      borderClientCount: this.getOverlayClientCount('screen-border'),
      particleClientCount: this.getOverlayClientCount('event-particles'),
      roseClientCount: this.getOverlayClientCount('falling-roses'),
      likesClientCount: this.getOverlayClientCount('likes'),
      discordCallClientCount: this.getOverlayClientCount('discord-call'),
      leaderboardClientCount: this.getOverlayClientCount('leaderboard'),
      webSocketClientCount: this.webSockets?.getClientCount() || 0,
      dualVerticalClientCount: this.router.getDualVerticalClientCount()
    }
  }

  getGoalState() { return this.goals.getState() }

  createWidgetPreviewSession(widgetId: string): string {
    return this.router.createWidgetPreviewSession(widgetId)
  }

  releaseWidgetPreviewSession(previewToken: string): void {
    this.router.releaseWidgetPreviewSession(previewToken)
  }

  /**
   * Render capability-bound preview HTML using the same context as the HTTP
   * overlay route. The session is scoped to the widget so a renderer cannot
   * reuse a token to render or control a different preview.
   */
  renderWidgetPreview(widget: Widget, previewToken: string): string | null {
    if (!this.router.validateWidgetPreviewSession(previewToken, widget.id)) return null

    return renderWidgetPreviewContent(widget, {
      settings: this.db?.getAllSettings() || {},
      boardSounds: this.soundboardService?.getAllSounds('board') || [],
      deckActions: this.db?.getAllDeckActions() || []
    }, this.webSocketCapability)
  }

  start(port: number = DEFAULT_PORT, options?: { preferLan?: boolean }): Promise<OverlayRuntimeStatus> {
    return this.enqueue(async () => {
      // Persisted pairing starts the companion listener across app restarts;
      // the browser-source listener remains unchanged.
      if (options?.preferLan) this.deviceLanEnabled = true
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

  setNowPlaying(payload: NowPlayingPayload): void {
    this.nowPlaying.setState(payload)
  }

  broadcastSpeechState(isSpeaking: boolean, isAI: boolean): void {
    this.sse.broadcast('node-network', { type: 'speech-state', isSpeaking, isAI })
    this.deviceApi?.broadcast('ttsState', { isSpeaking, isAI })
  }

  broadcastRecordingState(isRecording: boolean, path?: string): void {
    this.deviceApi?.broadcast('recordingState', { isRecording, path })
  }

  broadcastAppTheme(settings: UISettings): void {
    const payload: DeviceThemeState = {
      theme: settings.theme,
      ...resolveAppThemePalette(settings)
    }
    this.deviceApi?.broadcast('appTheme', payload)
  }

  broadcast(channel: any, payload: any): void {
    // Skip the per-broadcast log for leaderboard/deck — those are emitted in
    // tight bursts by the like pipeline and JSON.stringify on the full
    // leaderboard payload is the most expensive per-like log we have.
    const payloadType = (payload as any)?.type
    const isHotChannel = channel === 'leaderboard' || channel === 'deck' || payloadType === 'leaderboard'
    if (!isHotChannel) {
      console.log(`[OverlayServer] Broadcasting to channel ${channel}:`, JSON.stringify(payload).slice(0, 100))
    }
    this.sse.broadcast(channel, payload)
  }

  broadcastPhysicsSpawn(payload: any): void {
    console.log(`[OverlayServer] Broadcasting physics spawn`)
    this.sse.broadcast('physics', { type: 'spawn', payload })
  }

  broadcastDeckNotification(message: string, level: 'info' | 'error' = 'info'): void {
    console.log(`[OverlayServer] Deck notification (${level}): ${message}`)
    this.sse.broadcast('deck', { type: 'notification', message, level })
  }

  broadcastRelayMessage(payload: any): void {
    this.chat.broadcastRelay(payload)
  }

  broadcastFeatureMessage(payload: any): void {
    this.chat.broadcastFeature(payload)
  }

  handleStreamEvent(event: AnyStreamEvent): { likeProgress?: AcceptedLikeProgress } {
    const result: { likeProgress?: AcceptedLikeProgress } = {}

    this.runStreamEventStage('chat', () => {
      this.chat.handleEvent(event)
    })
    this.runStreamEventStage('goals', () => {
      this.goals.handleEvent(event)
    })

    // Broadcast to specific widget channels for reactive updates
    this.runStreamEventStage('particles', () => {
      if (!shouldBroadcastParticleEvent(event)) return
      this.sse.broadcast('particles', { type: 'event', payload: event })
      this.sse.broadcast('event-particles', { type: 'event', payload: event })
    })

    if (event.type === 'gift') {
      this.runStreamEventStage('latest gifter', () => {
        const gift = event as any
        const gifterData = {
          username: gift.user?.displayName || gift.user?.username || 'Anonymous',
          avatarUrl: gift.user?.profilePictureUrl
        }
        this.sse.broadcast('latest-gifter', { type: 'update', data: gifterData })

        // Persist to DB for initial load of the widget
        if (this.db) {
          this.db.setSetting('last_gifter_v1', JSON.stringify(gifterData))
        }
      })
    }

    if (event.type === 'like') {
      this.runStreamEventStage('likes', () => {
        const like = event as any
        const feedItem = like._feedItem || {
          id: like.id,
          type: 'like',
          displayName: like.user?.displayName || like.user?.username || 'Fan',
          profilePictureUrl: like.user?.profilePictureUrl,
          amount: like.likeCount || 1,
          totalLikes: like.totalLikes,
          timestamp: like.timestamp || new Date()
        }
        const updatedState = this.likes.updateState(like, feedItem)
        if (updatedState) {
          result.likeProgress = {
            acceptedAmount: updatedState.acceptedAmount,
            viewerTotal: updatedState.viewerTotal
          }
          this.deviceApi?.broadcast('likes', { total: updatedState.totalLikes, recent: updatedState })
        }
      })
    }

    if (event.type === 'viewer-count') {
      this.runStreamEventStage('viewer count', () => {
        const viewerCounts = this.platformManager?.getViewerCounts() || {}
        const total = Object.values(viewerCounts).reduce((a, b) => (a as number) + (b as number), 0)
        this.sse.broadcast('node-network', { type: 'viewer-count', payload: { total, breakdown: viewerCounts } })
        // For DeskThing's direct event listener which seems to listen to all channels but expects 'viewer-count' type
        this.sse.broadcast('deck', { type: 'viewer-count', payload: { total, breakdown: viewerCounts } })
        this.deviceApi?.broadcast('viewerCount', { total, breakdown: viewerCounts })
      })
    }

    return result
  }

  pushAlert(payload: any, platform: string): void {
    this.alerts.pushAlert(payload, platform)
  }

  broadcastWidgetUpdate(widget: Widget): void
  broadcastWidgetUpdate(type: string, id: string): void
  broadcastWidgetUpdate(widgetOrType: Widget | string, id?: string): void {
    if (typeof widgetOrType !== 'string') {
      const widget = widgetOrType
      const definition = WIDGET_RUNTIME_REGISTRY[widget.type]
      if (!definition) return
      this.sse.broadcast(getWidgetEventChannel(widget.type) as OverlayChannel, {
        type: 'widget-config',
        widgetId: widget.id,
        widgetType: widget.type,
        generation: this.router.getRuntimeGeneration(),
        revision: ++this.widgetConfigRevision,
        config: widget.config
      })
      return
    }

    // Non-widget surfaces such as Deck still use their existing reload signal.
    const definition = WIDGET_RUNTIME_REGISTRY[widgetOrType as WidgetType]
    const channel = definition?.eventChannel || (widgetOrType === 'deck' ? 'deck' : null)
    if (channel) this.sse.broadcast(channel as OverlayChannel, { type: 'reload', id })
  }

  broadcastWidgetDispose(widget: Widget): void {
    if (!WIDGET_RUNTIME_REGISTRY[widget.type]) return
    this.sse.broadcast(getWidgetEventChannel(widget.type) as OverlayChannel, {
      type: 'widget-dispose',
      widgetId: widget.id,
      widgetType: widget.type,
      generation: this.router.getRuntimeGeneration(),
      revision: ++this.widgetConfigRevision
    })
  }

  resetWidgetRuntimeState(): void {
    const resetChannels: OverlayChannel[] = ['chat', 'chat-unified', 'alerts', 'goals', 'likes', 'leaderboard', 'discord-call']

    this.chat.clearHistory()
    this.alerts.clearHistory()
    this.goals.reset()
    this.likes.reset()
    this.economyService?.resetLikeathon?.()
    this.sse.clearState(resetChannels)

    this.sse.broadcast('chat', { type: 'snapshot', payload: [] })
    this.sse.broadcast('chat-unified', { type: 'snapshot', payload: [] })
    this.sse.broadcast('alerts', { type: 'snapshot', payload: [] })
    this.sse.broadcast('goals', { type: 'snapshot', payload: this.goals.getState() })
    this.sse.broadcast('likes', { type: 'snapshot', payload: this.likes.getSnapshot() })
    this.sse.broadcast('leaderboard', { type: 'update', data: [] })
    this.sse.broadcast('discord-call', {
      type: 'snapshot',
      payload: this.platformManager?.getDiscordCallState?.() || null
    })
  }

  setDualVerticalFrame(frame: Buffer): void {
    this.router.setDualVerticalFrame(frame)
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operationQueue.then(operation, operation)
    this.operationQueue = next.catch(() => undefined)
    return next
  }

  private runStreamEventStage(stage: string, handler: () => void): void {
    try {
      handler()
    } catch (err) {
      console.error(`[OverlayServer] ${stage} stream handler failed:`, err)
    }
  }

  private async startInternal(port: number): Promise<void> {
    this.status.requestedPort = port
    try {
      this.listenHost = resolveListenHost()
      this.server = createServer((req, res) => this.router.handleRequest(req, res))
      this.webSockets = new OverlayWebSocketManager(
        this.server,
        (channel, options) => this.router.getEventReplay(channel, options),
        this.webSocketCapability,
        (receipt) => this.emit('overlay-performance', receipt),
        () => this.updateClientCounts()
      )
      await new Promise<void>((resolve, reject) => {
        this.server?.listen(port, this.listenHost, () => resolve())
        this.server?.once('error', reject)
      })
      const addr = this.server?.address()
      const actualPort = typeof addr === 'object' && addr ? addr.port : port

      if (this.deviceLanEnabled) {
        try {
          await this.startDeviceServer(actualPort)
          this.status.deviceLastError = null
        } catch (error) {
          this.status.deviceLastError = error instanceof Error ? error.message : String(error)
          console.error('[OverlayServer] Device API listener failed:', error)
        }
      }

      this.markRunning(actualPort)
      this.sse.startPingLoop()
    } catch (error: any) {
      this.webSockets?.close()
      this.webSockets = null
      if (!this.server?.listening) {
        this.status.running = false
        this.status.listenHost = null
        this.status.lastError = error.message
      }
      this.updateDeviceStatus()
    }
    this.emit('status', this.getStatus())
  }

  private async stopInternal(): Promise<void> {
    this.sse.closeAll()
    this.webSockets?.close()
    this.webSockets = null
    this.router.closeAllClients()
    this.deviceApi?.closeAllClients?.()
    if (this.deviceServer) {
      const deviceServer = this.deviceServer
      this.deviceServer = null
      await new Promise<void>((resolve) => deviceServer.close(() => resolve()))
    }
    this.devicePort = null
    if (this.server) {
      const s = this.server
      this.server = null
      await new Promise<void>(r => s.close(() => r()))
    }
    this.status.running = false
    this.status.listenHost = null
    this.updateDeviceStatus()
    this.emit('status', this.getStatus())
  }

  private markRunning(port: number): void {
    this.status.running = true
    this.status.port = port
    this.status.listenHost = this.listenHost
    this.status.lastError = null
    this.updateDeviceStatus()
    this.status.startedAt = this.status.startedAt || new Date().toISOString()
    const localHost = formatHostPort('127.0.0.1', port)
    const base = `http://${localHost}`
    this.status.chatUrl = `${base}/overlay/chat.html`
    this.status.alertsUrl = `${base}/overlay/alerts.html`
    this.status.goalsUrl = `${base}/overlay/goals.html`
    this.status.healthUrl = `${base}/overlay/health`
    this.status.deckUrl = `${base}/overlay/deck`
    this.status.particlesUrl = `${base}/overlay/particles.html`
    this.status.dualVerticalUrl = `${base}/overlay/dual-vertical.html`
  }

  private updateDeviceStatus(): void {
    const deviceHosts = this.getReachableDeviceHosts()
    const devicePairUrls = deviceHosts.map((host) => `http://${host}/api/v1/pair/complete`)

    this.status.devicePort = this.devicePort
    this.status.deviceListenHost = this.deviceServer ? DEVICE_LISTEN_HOST : null
    this.status.deviceHost = deviceHosts[0] || null
    this.status.deviceHosts = deviceHosts
    this.status.devicePairUrl = devicePairUrls[0] || null
    this.status.devicePairUrls = devicePairUrls
  }

  private getReachableDeviceHosts(): string[] {
    if (!this.deviceServer || !this.devicePort) return []
    const hosts = new Set<string>()

    for (const address of getLanIPv4Addresses()) {
      hosts.add(formatHostPort(address, this.devicePort))
    }
    hosts.add(formatHostPort('127.0.0.1', this.devicePort))

    return [...hosts]
  }

  private async startDeviceServer(overlayPort: number): Promise<void> {
    if (this.deviceServer) return

    let lastError: unknown = null
    for (const candidatePort of getDevicePortCandidates(overlayPort)) {
      const server = createServer((request, response) => {
        void this.handleDeviceRequest(request, response).catch((error) => {
          console.error('[OverlayServer] Device boundary request failed:', error)
          if (!response.headersSent) {
            writeBoundaryJson(response, 500, { error: 'Internal error' })
          } else {
            response.destroy(error instanceof Error ? error : undefined)
          }
        })
      })

      try {
        await listen(server, candidatePort, DEVICE_LISTEN_HOST)
        this.deviceServer = server
        this.devicePort = candidatePort
        return
      } catch (error: any) {
        lastError = error
        server.removeAllListeners()
        if (error?.code !== 'EADDRINUSE' && error?.code !== 'EACCES') throw error
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('No companion API port is available')
  }

  private async handleDeviceRequest(
    request: IncomingMessage,
    response: ServerResponse<IncomingMessage>
  ): Promise<void> {
    const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`)
    const pathname = url.pathname

    if (!pathname.startsWith('/api/v1/')) {
      writeBoundaryJson(response, 404, { error: 'Device API route not found' })
      return
    }

    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
        'Cache-Control': 'no-store'
      })
      response.end()
      return
    }

    if (!this.deviceApi) {
      writeBoundaryJson(response, 503, { error: 'Device API unavailable' })
      return
    }

    const handled = await this.deviceApi.handleRequest(request, response, pathname)
    if (!handled) writeBoundaryJson(response, 404, { error: 'Device API route not found' })
  }

  private updateClientCounts(): void {
    this.emit('status', this.getStatus())
  }

  private getOverlayClientCount(channel: OverlayChannel): number {
    return this.sse.getClientCount(channel) + (this.webSockets?.getSubscriptionCount(channel) || 0)
  }
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error)
    server.once('error', onError)
    server.listen(port, host, () => {
      server.off('error', onError)
      resolve()
    })
  })
}

function writeBoundaryJson(
  response: ServerResponse<IncomingMessage>,
  statusCode: number,
  payload: Record<string, unknown>
): void {
  if (response.writableEnded) return
  const json = JSON.stringify(payload)
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'Cache-Control': 'no-store'
  })
  response.end(json)
}

