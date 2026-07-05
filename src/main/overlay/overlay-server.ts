import { createServer, type Server } from 'http'
import { EventEmitter } from 'events'
import { networkInterfaces } from 'os'
import type { AnyStreamEvent } from '../platforms/types'
import type { OverlayRuntimeStatus } from '../../shared/overlay'
import { Database } from '../db/database'
import { AssetService } from '../system/asset-service'
import { RemoteAuthService } from '../services/remote-auth-service'
import type { NowPlayingPayload } from '../../shared/widgets'
import { SSEManager } from './sse-manager'
import { OverlayRouter } from './overlay-router'
import { ChatManager } from './managers/chat-manager'
import { AlertManager } from './managers/alert-manager'
import { GoalManager } from './managers/goal-manager'
import { NowPlayingManager } from './managers/now-playing-manager'
import { LikesTracker } from './managers/likes-tracker'
import { DEFAULT_PORT, type OverlayChannel } from './types'
import { shouldBroadcastParticleEvent } from './overlay-payloads'
import { renderWidgetPreviewHtml } from './widget-renderers'
import type { Widget } from '../../shared/widgets'

// Secure by default: bind to loopback so the overlay/state/deck/device endpoints
// are NOT exposed to the whole LAN unless the user opts in. LAN access is enabled
// explicitly when a device is paired (ensureLanAccess) or, at startup, when paired
// devices already exist (see ServiceRegistry). Power users can still override via
// ILYSTREAM_OVERLAY_HOST.
const DEFAULT_LISTEN_HOST = '127.0.0.1'
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

function isWildcardHost(host: string): boolean {
  return host === '0.0.0.0' || host === '::'
}

function isLoopbackHost(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1'
}

function formatHostPort(host: string, port: number): string {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]:${port}` : `${host}:${port}`
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
  private listenHost = DEFAULT_LISTEN_HOST
  private forceLanBinding = false

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
    chatClientCount: 0,
    alertClientCount: 0,
    goalClientCount: 0
  }

  private operationQueue: Promise<unknown> = Promise.resolve()

  constructor() {
    super()
    this.sse = new SSEManager(
      () => this.updateClientCounts(),
      (channel, payload, clientCount) => {
        this.emit('overlay-broadcast', {
          channel,
          payload,
          clientCount,
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
      () => this.economyService?.getLeaderboardSnapshot?.() || []
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
    this.forceLanBinding = true
    const port = this.status.port || this.status.requestedPort || DEFAULT_PORT

    if (this.status.running && isWildcardHost(this.listenHost)) {
      return this.getStatus()
    }

    return this.enqueue(async () => {
      await this.stopInternal()
      await this.startInternal(port)
      return this.getStatus()
    })
  }

  getStatus(): OverlayRuntimeStatus {
    return {
      ...this.status,
      chatClientCount: this.sse.getClientCount('chat'),
      alertClientCount: this.sse.getClientCount('alerts'),
      goalClientCount: this.sse.getClientCount('goals'),
      followerGoalClientCount: this.sse.getClientCount('follower-goal'),
      socialsClientCount: this.sse.getClientCount('socials'),
      borderClientCount: this.sse.getClientCount('screen-border'),
      particleClientCount: this.sse.getClientCount('event-particles'),
      roseClientCount: this.sse.getClientCount('falling-roses'),
      likesClientCount: this.sse.getClientCount('likes'),
      leaderboardClientCount: this.sse.getClientCount('leaderboard'),
      dualVerticalClientCount: this.router.getDualVerticalClientCount()
    }
  }

  getGoalState() { return this.goals.getState() }

  /**
   * Render a widget's preview HTML (with the preview-bootstrap script injected)
   * using the same context the HTTP overlay route uses. The renderer-side
   * WidgetEditorModal pushes the result over postMessage to the live iframe,
   * which lets config tweaks apply in-place without reloading the page.
   */
  renderWidgetPreview(widget: Widget): string | null {
    return renderWidgetPreviewHtml(widget, {
      settings: this.db?.getAllSettings() || {},
      boardSounds: this.soundboardService?.getAllSounds('board') || [],
      deckActions: this.db?.getAllDeckActions() || []
    })
  }

  start(port: number = DEFAULT_PORT, options?: { preferLan?: boolean }): Promise<OverlayRuntimeStatus> {
    return this.enqueue(async () => {
      // Persisted LAN opt-in: if the user already has paired devices, keep LAN
      // binding across restarts (otherwise DeskThing/Car Thing would be unable to
      // reach the server after every launch until re-paired).
      if (options?.preferLan) this.forceLanBinding = true
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

  handleStreamEvent(event: AnyStreamEvent): void {
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
  }

  pushAlert(payload: any, platform: string): void {
    this.alerts.pushAlert(payload, platform)
  }

  broadcastWidgetUpdate(type: string, id: string): void {
    const channelMap: Record<string, any> = {
      'chat': 'chat', 'chat-unified': 'chat-unified', 'likes-tracker': 'likes',
      'alerts': 'alerts', 'now-playing': 'now-playing', 'spotify': 'now-playing',
      'follower-goal': 'follower-goal', 'socials': 'socials', 'screen-border': 'screen-border',
      'event-particles': 'event-particles', 'gift-overlays': 'event-particles',
      'falling-roses': 'falling-roses', 'particles': 'particles', 'discord-promo': 'discord-promo',
      'node-network': 'node-network', 'latest-gifter': 'latest-gifter', 'physics': 'physics',
      'leaderboard': 'leaderboard', 'deck': 'deck'
    }
    const channel = channelMap[type]
    if (channel) this.sse.broadcast(channel, { type: 'reload', id })
  }

  resetWidgetRuntimeState(): void {
    const resetChannels: OverlayChannel[] = ['chat', 'chat-unified', 'alerts', 'goals', 'likes', 'leaderboard']

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
      this.listenHost = this.forceLanBinding ? '0.0.0.0' : resolveListenHost()
      this.server = createServer((req, res) => this.router.handleRequest(req, res))
      await new Promise<void>((resolve, reject) => {
        this.server?.listen(port, this.listenHost, () => resolve())
        this.server?.once('error', reject)
      })
      const addr = this.server?.address()
      const actualPort = typeof addr === 'object' && addr ? addr.port : port
      this.markRunning(actualPort)
      this.sse.startPingLoop()
    } catch (error: any) {
      this.status.running = false
      this.status.listenHost = null
      this.status.deviceHost = null
      this.status.deviceHosts = []
      this.status.devicePairUrl = null
      this.status.devicePairUrls = []
      this.status.lastError = error.message
    }
    this.emit('status', this.getStatus())
  }

  private async stopInternal(): Promise<void> {
    this.sse.closeAll()
    this.router.closeAllClients()
    if (this.server) {
      const s = this.server
      this.server = null
      await new Promise<void>(r => s.close(() => r()))
    }
    this.status.running = false
    this.status.listenHost = null
    this.status.deviceHost = null
    this.status.deviceHosts = []
    this.status.devicePairUrl = null
    this.status.devicePairUrls = []
    this.emit('status', this.getStatus())
  }

  private markRunning(port: number): void {
    const deviceHosts = this.getReachableDeviceHosts(port)
    const devicePairUrls = deviceHosts.map((host) => `http://${host}/api/v1/pair/complete`)

    this.status.running = true
    this.status.port = port
    this.status.listenHost = this.listenHost
    this.status.deviceHost = deviceHosts[0] || null
    this.status.deviceHosts = deviceHosts
    this.status.devicePairUrl = devicePairUrls[0] || null
    this.status.devicePairUrls = devicePairUrls
    this.status.startedAt = this.status.startedAt || new Date().toISOString()
    const localHost = formatHostPort('127.0.0.1', port)
    const overlayHost = deviceHosts.includes(localHost) ? localHost : (deviceHosts[0] || localHost)
    const base = `http://${overlayHost}`
    this.status.chatUrl = `${base}/overlay/chat.html`
    this.status.alertsUrl = `${base}/overlay/alerts.html`
    this.status.goalsUrl = `${base}/overlay/goals.html`
    this.status.healthUrl = `${base}/overlay/health`
    this.status.deckUrl = `${base}/overlay/deck`
    this.status.particlesUrl = `${base}/overlay/particles.html`
    this.status.dualVerticalUrl = `${base}/overlay/dual-vertical.html`
  }

  private getReachableDeviceHosts(port: number): string[] {
    const hosts = new Set<string>()

    if (isWildcardHost(this.listenHost)) {
      for (const address of getLanIPv4Addresses()) {
        hosts.add(formatHostPort(address, port))
      }
      hosts.add(formatHostPort('127.0.0.1', port))
    } else if (isLoopbackHost(this.listenHost)) {
      hosts.add(formatHostPort('127.0.0.1', port))
    } else {
      hosts.add(formatHostPort(this.listenHost, port))
    }

    return [...hosts]
  }

  private updateClientCounts(): void {
    this.emit('status', this.getStatus())
  }
}
