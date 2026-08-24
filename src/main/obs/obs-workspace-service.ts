import { app } from 'electron'
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import type { Database } from '../db/database'
import type { OverlayServer } from '../overlay/overlay-server'
import type { PlatformManager } from '../platforms/platform-manager'
import { isStreamPlatform, type AnyStreamEvent, type Platform, type UserInfo } from '../platforms/types'
import type { SoundboardService } from '../soundboard/soundboard-service'
import type { TTSEngine } from '../tts/tts-engine'
import type { OBSService } from './obs-service'
import {
  OBS_NATIVE_BRIDGE_CREDENTIAL_FILE,
  OBSNativeBridgeServer,
  type OBSProgramSubscribeRequest,
  type OBSProgramTransportRelease,
  type OBSProgramTransportLease
} from './obs-native-bridge'
import { ProgramAudioTransport } from '../audio/program-audio-transport'
import {
  acquireProgramVideoExport,
  describeProgramVideoExport,
  onProgramExportChanged,
  setProgramExportDemanded
} from '../engine/program-export-provider'
import type { AudioFramePayload } from '../services/streaming-types'
import { buildOBSWorkspaceHtml } from './obs-workspace-template'
import {
  OBS_WORKSPACE_DEFAULT_PORT,
  OBS_WORKSPACE_PROTOCOL_VERSION,
  type OBSWorkspaceAccess,
  type OBSWorkspaceAction,
  type OBSWorkspaceActionResult,
  type OBSWorkspacePlatformState,
  type OBSWorkspaceSnapshot,
  type OBSWorkspaceWidgetState
} from '../../shared/obs-workspace'
import type { OBSManagedBrowserSourceInspection, OBSWidgetBrowserSourceSpec } from '../../shared/obs'
import type { WidgetType } from '../../shared/widgets'

const HOST = '127.0.0.1'
const TOKEN_SETTING_KEY = 'obsWorkspacePairToken'
const PORT_SETTING_KEY = 'obsWorkspacePort'
const COOKIE_NAME = 'ily_obs_workspace'
const MAX_BODY_BYTES = 32 * 1024
const MAX_ACTIONS_PER_WINDOW = 50
const ACTION_WINDOW_MS = 10_000
const SOURCE_CACHE_MS = 4_000
const MAX_PORT_ATTEMPTS = 12

interface OBSWorkspaceDependencies {
  db: Database
  obsService: OBSService
  overlayServer: OverlayServer
  platformManager: PlatformManager
  soundboardService: SoundboardService
  ttsEngine: TTSEngine
}

interface WorkspaceUiHandlers {
  focusApp?: () => Promise<void> | void
  openControlCenter?: (pairUrl: string) => Promise<void> | void
}

export interface OBSWorkspaceServiceOptions {
  appVersion?: string
  defaultPort?: number
  nativeBridge?: boolean
  bridgeCredentialPath?: string
}

export class OBSWorkspaceService extends EventEmitter {
  private readonly dependencies: OBSWorkspaceDependencies
  private readonly appVersion: string
  private readonly defaultPort: number
  private readonly nativeBridgeEnabled: boolean
  private readonly nativeBridge: OBSNativeBridgeServer
  private server: Server | null = null
  private port: number | null = null
  private lastError: string | null = null
  private token = ''
  private uiHandlers: WorkspaceUiHandlers = {}
  private actionTimestamps: number[] = []
  private sourceCache: { expiresAt: number; value: OBSManagedBrowserSourceInspection } | null = null
  private snapshotInFlight: Promise<OBSWorkspaceSnapshot> | null = null
  private bridgeBroadcastTimer: ReturnType<typeof setTimeout> | null = null
  private lifecycleQueue: Promise<void> = Promise.resolve()
  private programRefreshQueue: Promise<void> = Promise.resolve()
  private readonly programAudio = new ProgramAudioTransport()
  private programSubscription: OBSProgramSubscribeRequest | null = null
  private programLease: OBSProgramTransportLease | null = null
  private removeProgramExportChanged: (() => void) | null = null

  constructor(dependencies: OBSWorkspaceDependencies, options: OBSWorkspaceServiceOptions = {}) {
    super()
    this.dependencies = dependencies
    this.appVersion = options.appVersion ?? app.getVersion()
    this.defaultPort = options.defaultPort ?? OBS_WORKSPACE_DEFAULT_PORT
    this.nativeBridgeEnabled = options.nativeBridge !== false
    this.nativeBridge = new OBSNativeBridgeServer({
      appVersion: this.appVersion,
      getSnapshot: () => this.getSnapshot(),
      onFocus: () => this.uiHandlers.focusApp?.(),
      onOpenControlCenter: () => {
        const pairUrl = this.getAccess().pairUrl
        if (!pairUrl) throw new Error('The ilyStream Control Center is offline.')
        return this.uiHandlers.openControlCenter?.(pairUrl)
      },
      credentialPath: options.bridgeCredentialPath
        ?? (this.nativeBridgeEnabled
          ? join(app.getPath('appData'), 'ilyStream', OBS_NATIVE_BRIDGE_CREDENTIAL_FILE)
          : OBS_NATIVE_BRIDGE_CREDENTIAL_FILE)
    })

    this.nativeBridge.on('status', () => {
      this.emit('status', this.getAccess())
    })
    this.nativeBridge.on('programSubscribe', (request: OBSProgramSubscribeRequest) => {
      this.programSubscription = request
      this.queueProgramTransportRefresh()
    })
    this.nativeBridge.on('programTransportRelease', (release: OBSProgramTransportRelease) => {
      const finalRelease = release.reason === 'consumer-stopped' ||
        release.reason === 'bridge-stopping' ||
        release.reason === 'bridge-disconnected'
      if (finalRelease) {
        this.programSubscription = null
      }
      const releasesCurrentLease = release.transportId !== null &&
        release.transportId === this.programLease?.transportId &&
        release.generation === this.programLease.generation
      if (finalRelease || releasesCurrentLease) {
        this.retireProgramTransport('consumer-release', false)
      }
    })
    this.nativeBridge.on('programConsumersChanged', (count: number) => {
      try {
        setProgramExportDemanded(count > 0)
      } catch (error) {
        console.warn('[obs-program] Program export demand could not be applied:', errorMessage(error))
      }
      if (count === 0) {
        this.programSubscription = null
        this.retireProgramTransport('consumer-disconnected', false)
      }
      this.emit('programConsumersChanged', count)
    })
    this.dependencies.obsService.on('status', () => this.scheduleBridgeSnapshot())
    this.dependencies.platformManager.on('status', () => this.scheduleBridgeSnapshot())
  }

  setUiHandlers(handlers: WorkspaceUiHandlers): void {
    this.uiHandlers = handlers
  }

  getAccess(): OBSWorkspaceAccess {
    const origin = this.port ? `http://${HOST}:${this.port}` : null
    return {
      protocol: OBS_WORKSPACE_PROTOCOL_VERSION,
      running: Boolean(this.server?.listening && origin),
      port: this.port,
      controlUrl: origin ? `${origin}/obs` : null,
      pairUrl: origin && this.token ? `${origin}/obs?pair=${encodeURIComponent(this.token)}` : null,
      lastError: this.lastError,
      nativeBridge: this.nativeBridge.getStatus()
    }
  }

  start(): Promise<OBSWorkspaceAccess> {
    return this.runLifecycle(() => this.startInternal())
  }

  stop(): Promise<void> {
    return this.runLifecycle(() => this.stopInternal())
  }

  private async startInternal(): Promise<OBSWorkspaceAccess> {
    if (this.server?.listening) return this.getAccess()
    this.removeProgramExportChanged ??= onProgramExportChanged(() => this.queueProgramTransportRefresh())
    this.token = this.loadOrCreateToken()
    const preferredPort = normalizePort(this.dependencies.db.getSetting(PORT_SETTING_KEY)) ?? this.defaultPort

    for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt += 1) {
      const candidate = preferredPort + attempt
      if (candidate > 65_535) break
      const result = await this.tryListen(candidate)
      if (result.ok) {
        this.port = result.port
        this.lastError = null
        this.dependencies.db.setSetting(PORT_SETTING_KEY, result.port)
        break
      }
      if (result.code !== 'EADDRINUSE') {
        this.lastError = result.message
        break
      }
    }

    if (!this.server?.listening && !this.lastError) {
      this.lastError = `Could not find an available Control Center port near ${preferredPort}.`
    }

    if (this.nativeBridgeEnabled) await this.nativeBridge.start()
    this.emit('status', this.getAccess())
    return this.getAccess()
  }

  private async stopInternal(): Promise<void> {
    if (this.bridgeBroadcastTimer) {
      clearTimeout(this.bridgeBroadcastTimer)
      this.bridgeBroadcastTimer = null
    }
    this.retireProgramTransport('server-stopping', true)
    this.programSubscription = null
    setProgramExportDemanded(false)
    this.removeProgramExportChanged?.()
    this.removeProgramExportChanged = null
    await this.nativeBridge.stop()
    const server = this.server
    this.server = null
    this.port = null
    this.actionTimestamps = []
    this.sourceCache = null
    if (server) {
      await new Promise<void>((resolve) => {
        try { server.close(() => resolve()) } catch { resolve() }
      })
    }
    this.emit('status', this.getAccess())
  }

  rotatePairing(): OBSWorkspaceAccess {
    this.token = randomBytes(32).toString('base64url')
    this.dependencies.db.setSetting(TOKEN_SETTING_KEY, this.token)
    return this.getAccess()
  }

  publishProgramAudio(frame: AudioFramePayload): boolean {
    return this.programLease !== null && this.programAudio.push(frame)
  }

  private queueProgramTransportRefresh(): void {
    const run = this.programRefreshQueue.then(
      () => this.refreshProgramTransport(),
      () => this.refreshProgramTransport()
    )
    this.programRefreshQueue = run.catch(() => undefined)
  }

  private async refreshProgramTransport(): Promise<void> {
    const subscription = this.programSubscription
    if (!subscription) {
      this.retireProgramTransport('consumer-release', false)
      return
    }

    let videoDescription
    try {
      videoDescription = describeProgramVideoExport()
    } catch (error) {
      console.warn('[obs-program] Program video export could not be acquired:', errorMessage(error))
      return
    }

    if (!videoDescription) {
      this.retireProgramTransport('producer-offline', true)
      return
    }
    if (this.programLease?.generation === videoDescription.generation) return

    this.retireProgramTransport('generation-changed', true)

    const transportId = randomUUID()
    let audio
    try {
      audio = this.programAudio.start(videoDescription.generation)
    } catch (error) {
      console.warn('[obs-program] Program audio export could not be prepared:', errorMessage(error))
      return
    }

    let video
    try {
      video = acquireProgramVideoExport(subscription.clientPid, videoDescription.generation)
    } catch (error) {
      this.programAudio.stop()
      console.warn('[obs-program] Program video handles could not be transferred:', errorMessage(error))
      return
    }
    if (!video) {
      this.programAudio.stop()
      this.queueProgramTransportRefresh()
      return
    }

    const descriptor = {
      transportVersion: 1 as const,
      transportId,
      generation: video.generation,
      producerPid: process.pid,
      video: {
        adapterLuidHigh: video.adapterLuidHigh,
        adapterLuidLow: video.adapterLuidLow,
        width: video.width,
        height: video.height,
        format: 'rgba8' as const,
        colorSpace: 'srgb' as const,
        slotCount: 2 as const,
        duplicatedHandles: video.duplicatedHandles,
        controlHandle: video.controlHandle,
        keyedMutex: true as const,
        producerAcquireKey: '0' as const,
        consumerAcquireKey: '1' as const
      },
      audio
    }

    if (!this.nativeBridge.sendProgramTransportAvailable(subscription.subscriptionId, descriptor)) {
      this.programAudio.stop()
      return
    }
    this.programLease = { transportId, generation: video.generation }
  }

  private retireProgramTransport(reason: string, notifyConsumer: boolean): void {
    const lease = this.programLease
    this.programLease = null
    this.programAudio.stop()
    if (notifyConsumer && lease && this.programSubscription) {
      this.nativeBridge.sendProgramTransportRetiring(
        this.programSubscription.subscriptionId,
        lease,
        reason
      )
    }
  }

  async getSnapshot(): Promise<OBSWorkspaceSnapshot> {
    if (this.snapshotInFlight) return this.snapshotInFlight
    const request = this.buildSnapshot()
    this.snapshotInFlight = request
    try {
      return await request
    } finally {
      if (this.snapshotInFlight === request) this.snapshotInFlight = null
    }
  }

  async executeAction(action: OBSWorkspaceAction): Promise<OBSWorkspaceActionResult> {
    const { obsService, platformManager, soundboardService, ttsEngine } = this.dependencies
    let message = 'Action completed.'
    let data: unknown

    switch (action.type) {
      case 'obs.reconnect':
        data = await obsService.reconnect()
        message = 'OBS reconnect requested.'
        break
      case 'obs.setScene': {
        const sceneName = requireShortString(action.sceneName, 'Scene name', 160)
        if (!obsService.getStatus().scenes.includes(sceneName)) throw new Error('That OBS scene is no longer available.')
        await obsService.executeAction({ type: 'obs_set_scene', sceneName })
        message = `Switched to ${sceneName}.`
        break
      }
      case 'obs.toggleVirtualCamera':
        data = await obsService.toggleVirtualCamera()
        message = (data as { virtualCameraActive?: boolean }).virtualCameraActive
          ? 'Virtual camera started.'
          : 'Virtual camera stopped.'
        break
      case 'obs.saveReplayBuffer':
        await obsService.executeAction({ type: 'obs_save_replay_buffer' })
        message = 'Replay buffer saved.'
        break
      case 'widget.upsert': {
        const widget = this.requireWidget(action.widgetId)
        data = await obsService.upsertWidgetBrowserSource({
          ...toWidgetSpec(widget),
          sceneName: optionalShortString(action.sceneName, 160)
        })
        this.invalidateSourceCache()
        message = (data as { created?: boolean; attachment?: { alreadyAttached?: boolean } }).created
          ? `Added ${widget.name} to OBS.`
          : (data as { attachment?: { alreadyAttached?: boolean } }).attachment?.alreadyAttached
            ? `${widget.name} is synced.`
            : `Attached ${widget.name} to the scene.`
        break
      }
      case 'widget.repair': {
        const widget = this.requireWidget(action.widgetId)
        data = await obsService.repairManagedBrowserSource({
          ...toWidgetSpec(widget),
          inputName: requireShortString(action.inputName, 'OBS input name', 160)
        })
        this.invalidateSourceCache()
        message = (data as { repaired?: boolean }).repaired
          ? `Repaired ${widget.name}.`
          : `${widget.name} was already healthy.`
        break
      }
      case 'widget.refresh':
        data = await obsService.refreshManagedBrowserSource(requireShortString(action.inputName, 'OBS input name', 160))
        this.invalidateSourceCache()
        message = 'Browser source refreshed without restarting OBS.'
        break
      case 'sound.play': {
        const soundId = requireShortString(action.soundId, 'Sound ID', 260)
        const exists = soundboardService.getAllSounds('board').some((sound) => sound.id === soundId)
        if (!exists) throw new Error('That soundboard clip no longer exists.')
        const volume = clamp(Number(action.volume ?? 1), 0, 1)
        if (!soundboardService.playSound(soundId, volume, 'overlap')) throw new Error('The sound could not be played.')
        message = 'Sound playing.'
        break
      }
      case 'sound.stopAll':
        soundboardService.stopAll()
        message = 'All ilyStream audio stopped.'
        break
      case 'tts.pause':
        ttsEngine.pause()
        message = 'TTS paused.'
        break
      case 'tts.resume':
        ttsEngine.resume()
        message = 'TTS resumed.'
        break
      case 'tts.skip':
        ttsEngine.skip()
        message = 'Current speech skipped.'
        break
      case 'chat.send': {
        const text = requireShortString(action.text, 'Chat message', 500)
        const capabilities = platformManager.getChatCapabilities()
        const platforms = [...new Set(action.platforms)]
          .filter((platform): platform is Platform => isStreamPlatform(platform))
          .filter((platform) => platformManager.getStatus(platform) === 'connected' && capabilities[platform]?.canSend)
        if (!platforms.length) throw new Error('Select at least one connected platform that can send chat.')
        data = await platformManager.sendChatMessageToPlatforms(platforms, text)
        const failed = (data as Array<{ ok: boolean }>).filter((result) => !result.ok).length
        message = failed ? `Message sent with ${failed} platform error${failed === 1 ? '' : 's'}.` : `Message sent to ${platforms.length} platform${platforms.length === 1 ? '' : 's'}.`
        break
      }
      case 'alert.testFollow': {
        const requested = action.platform && isStreamPlatform(action.platform) ? action.platform : null
        const connected = Object.entries(platformManager.getAllStatuses())
          .find(([platform, status]) => isStreamPlatform(platform) && status === 'connected')?.[0]
        const platform = (requested || connected || 'twitch') as Platform
        platformManager.emitTestEvent(makeTestFollowEvent(platform))
        message = 'Test follow sent through the normal alert path.'
        break
      }
      default:
        throw new Error('Unsupported Control Center action.')
    }

    const snapshot = await this.getSnapshot()
    this.nativeBridge.broadcastSnapshot(snapshot)
    return { ok: true, action: action.type, message, data, snapshot }
  }

  private async buildSnapshot(): Promise<OBSWorkspaceSnapshot> {
    const { db, obsService, overlayServer, platformManager, soundboardService, ttsEngine } = this.dependencies
    const obs = obsService.getStatus()
    const sourceInspection = await this.getSourceInspection(obs.connected)
    const sourceByWidgetId = new Map(sourceInspection.sources.map((source) => [source.widgetId, source]))
    const widgets = db.getAllWidgets().map((widget): OBSWorkspaceWidgetState => ({
      id: String(widget.id),
      name: String(widget.name || widget.type || 'Widget'),
      type: widget.type as WidgetType,
      inputName: sourceByWidgetId.get(String(widget.id))?.inputName ?? null,
      managedSource: sourceByWidgetId.get(String(widget.id)) ?? null
    }))

    const statuses = platformManager.getAllStatuses()
    const errors = platformManager.getAllErrors()
    const capabilities = platformManager.getChatCapabilities()
    const viewerCounts = platformManager.getViewerCounts()
    const platformIds = new Set([...Object.keys(statuses), ...Object.keys(capabilities), ...Object.keys(viewerCounts)])
    const platforms: OBSWorkspacePlatformState[] = [...platformIds]
      .filter(isStreamPlatform)
      .map((platform) => ({
        id: platform,
        status: statuses[platform] ?? 'disconnected',
        error: errors[platform] ?? null,
        viewerCount: Math.max(0, Math.floor(Number(viewerCounts[platform]) || 0)),
        canSendChat: capabilities[platform]?.canSend === true,
        chatUnavailableReason: capabilities[platform]?.reason ?? null
      }))
      .sort((left, right) => platformOrder(left.id) - platformOrder(right.id))

    return {
      protocol: OBS_WORKSPACE_PROTOCOL_VERSION,
      generatedAt: new Date().toISOString(),
      appVersion: this.appVersion,
      obs,
      overlay: overlayServer.getStatus(),
      platforms,
      widgets,
      widgetWarnings: sourceInspection.warnings,
      soundboard: soundboardService.getAllSounds('board').map((sound) => ({
        id: sound.id,
        name: sound.name,
        emoji: sound.emoji ?? null
      })),
      tts: ttsEngine.getRuntimeState(),
      nativeBridge: this.nativeBridge.getStatus()
    }
  }

  private async getSourceInspection(connected: boolean): Promise<OBSManagedBrowserSourceInspection> {
    if (!connected) return { sources: [], warnings: [] }
    if (this.sourceCache && this.sourceCache.expiresAt > Date.now()) return this.sourceCache.value
    try {
      const value = await this.dependencies.obsService.getManagedBrowserSources()
      this.sourceCache = { expiresAt: Date.now() + SOURCE_CACHE_MS, value }
      return value
    } catch (error) {
      return { sources: [], warnings: [`Could not inspect managed OBS sources: ${errorMessage(error)}`] }
    }
  }

  private invalidateSourceCache(): void {
    this.sourceCache = null
  }

  private requireWidget(widgetId: string): any {
    const normalized = requireShortString(widgetId, 'Widget ID', 160).toLowerCase()
    const widget = this.dependencies.db.getAllWidgets().find((candidate) => String(candidate.id).toLowerCase() === normalized)
    if (!widget) throw new Error('That saved widget no longer exists.')
    return widget
  }

  private async tryListen(port: number): Promise<{ ok: true; port: number } | { ok: false; code: string; message: string }> {
    const server = createServer((request, response) => void this.handleRequest(request, response))
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: NodeJS.ErrnoException) => {
          server.off('listening', onListening)
          reject(error)
        }
        const onListening = () => {
          server.off('error', onError)
          resolve()
        }
        server.once('error', onError)
        server.once('listening', onListening)
        server.listen(port, HOST)
      })
      this.server = server
      server.on('error', (error) => {
        this.lastError = error.message
        this.emit('status', this.getAccess())
      })
      server.on('clientError', (_error, socket) => {
        if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
      })
      const address = server.address() as AddressInfo
      return { ok: true, port: address.port }
    } catch (error) {
      try { server.close() } catch {}
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNKNOWN'
      return { ok: false, code, message: errorMessage(error) }
    }
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      if (!this.isAllowedHost(request.headers.host)) {
        this.writeJson(response, 400, { error: 'Invalid host.' })
        return
      }
      const url = new URL(request.url || '/', this.origin())
      if (request.method === 'GET' && url.pathname === '/health') {
        this.writeJson(response, 200, { ok: true, protocol: OBS_WORKSPACE_PROTOCOL_VERSION })
        return
      }
      if (request.method === 'GET' && url.pathname === '/favicon.ico') {
        response.writeHead(204, this.securityHeaders())
        response.end()
        return
      }
      if (request.method === 'GET' && url.pathname === '/obs' && url.searchParams.has('pair')) {
        this.handlePairing(url.searchParams.get('pair') || '', response)
        return
      }
      if (!this.isAuthorized(request)) {
        if (url.pathname.startsWith('/api/')) this.writeJson(response, 401, { error: 'Pairing required.' })
        else this.writeHtml(response, 401, '<!doctype html><title>Pairing required</title><p>Open this dock from ilyStream Settings to pair it.</p>')
        return
      }
      if (request.method === 'GET' && url.pathname === '/obs') {
        const nonce = randomBytes(18).toString('base64url')
        this.writeHtml(response, 200, buildOBSWorkspaceHtml({
          csrfToken: this.csrfToken(),
          nonce,
          appVersion: this.appVersion
        }), nonce)
        return
      }
      if (request.method === 'GET' && url.pathname === '/api/snapshot') {
        this.writeJson(response, 200, await this.getSnapshot())
        return
      }
      if (request.method === 'POST' && url.pathname === '/api/action') {
        if (!this.isAllowedActionRequest(request)) {
          this.writeJson(response, 403, { error: 'Origin or CSRF validation failed.' })
          return
        }
        if (!this.takeActionRateLimit()) {
          this.writeJson(response, 429, { error: 'Too many Control Center actions. Try again in a moment.' })
          return
        }
        const action = await readJsonBody<OBSWorkspaceAction>(request)
        const result = await this.executeAction(action)
        this.writeJson(response, 200, result)
        return
      }
      this.writeJson(response, 404, { error: 'Not found.' })
    } catch (error) {
      const tooLarge = error instanceof Error && error.message === 'Request body too large.'
      this.writeJson(response, tooLarge ? 413 : 400, { error: tooLarge ? error.message : errorMessage(error) })
    }
  }

  private handlePairing(pairToken: string, response: ServerResponse): void {
    if (!safeEqual(pairToken, this.token)) {
      this.writeHtml(response, 403, '<!doctype html><title>Pairing failed</title><p>This pairing link is invalid or expired.</p>')
      return
    }
    response.writeHead(303, {
      ...this.securityHeaders(),
      'Cache-Control': 'no-store',
      Location: '/obs',
      'Set-Cookie': `${COOKIE_NAME}=${this.sessionCookie()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`
    })
    response.end()
  }

  private isAllowedHost(host: string | undefined): boolean {
    if (!host || !this.port) return false
    const normalized = host.toLowerCase()
    return normalized === `${HOST}:${this.port}` || normalized === `localhost:${this.port}`
  }

  private isAuthorized(request: IncomingMessage): boolean {
    const cookie = parseCookies(request.headers.cookie || '')[COOKIE_NAME]
    return Boolean(cookie && safeEqual(cookie, this.sessionCookie()))
  }

  private isAllowedActionRequest(request: IncomingMessage): boolean {
    const origin = request.headers.origin
    const csrf = request.headers['x-ilystream-csrf']
    return typeof origin === 'string'
      && this.allowedOrigins().has(origin.toLowerCase())
      && typeof csrf === 'string'
      && safeEqual(csrf, this.csrfToken())
      && String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')
  }

  private takeActionRateLimit(): boolean {
    const now = Date.now()
    this.actionTimestamps = this.actionTimestamps.filter((timestamp) => now - timestamp < ACTION_WINDOW_MS)
    if (this.actionTimestamps.length >= MAX_ACTIONS_PER_WINDOW) return false
    this.actionTimestamps.push(now)
    return true
  }

  private allowedOrigins(): Set<string> {
    if (!this.port) return new Set()
    return new Set([`http://${HOST}:${this.port}`, `http://localhost:${this.port}`])
  }

  private origin(): string {
    if (!this.port) throw new Error('The Control Center is offline.')
    return `http://${HOST}:${this.port}`
  }

  private sessionCookie(): string {
    return sign(this.token, 'obs-workspace-session-v1')
  }

  private csrfToken(): string {
    return sign(this.token, 'obs-workspace-csrf-v1')
  }

  private loadOrCreateToken(): string {
    const saved = this.dependencies.db.getSetting(TOKEN_SETTING_KEY)
    if (typeof saved === 'string' && /^[A-Za-z0-9_-]{40,100}$/.test(saved)) return saved
    const token = randomBytes(32).toString('base64url')
    this.dependencies.db.setSetting(TOKEN_SETTING_KEY, token)
    return token
  }

  private scheduleBridgeSnapshot(): void {
    if (!this.server?.listening && !this.nativeBridge.getStatus().running) return
    if (this.bridgeBroadcastTimer) return
    this.bridgeBroadcastTimer = setTimeout(() => {
      this.bridgeBroadcastTimer = null
      void this.getSnapshot()
        .then((snapshot) => this.nativeBridge.broadcastSnapshot(snapshot))
        .catch(() => {})
    }, 180)
  }

  private securityHeaders(nonce?: string): Record<string, string> {
    const styleSource = nonce ? `'nonce-${nonce}'` : "'none'"
    const scriptSource = nonce ? `'nonce-${nonce}'` : "'none'"
    return {
      'Cache-Control': 'no-store',
      'Content-Security-Policy': `default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; connect-src 'self'; img-src 'self' data:; style-src ${styleSource}; script-src ${scriptSource}`,
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY'
    }
  }

  private writeJson(response: ServerResponse, status: number, value: unknown): void {
    response.writeHead(status, {
      ...this.securityHeaders(),
      'Content-Type': 'application/json; charset=utf-8'
    })
    response.end(JSON.stringify(value))
  }

  private writeHtml(response: ServerResponse, status: number, html: string, nonce?: string): void {
    response.writeHead(status, {
      ...this.securityHeaders(nonce),
      'Content-Type': 'text/html; charset=utf-8'
    })
    response.end(html)
  }

  private runLifecycle<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.lifecycleQueue.then(operation, operation)
    this.lifecycleQueue = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }
}

function toWidgetSpec(widget: any): OBSWidgetBrowserSourceSpec {
  return {
    widgetId: String(widget.id),
    widgetName: String(widget.name || widget.type || 'ilyStream Widget'),
    widgetType: widget.type as WidgetType,
    widgetConfig: widget.config
  }
}

function makeTestFollowEvent(platform: Platform): AnyStreamEvent {
  const user: UserInfo = {
    id: 'ilystream-obs-test',
    username: 'ilyStreamTest',
    displayName: 'ilyStream Test Viewer',
    isModerator: false,
    isSubscriber: false,
    isVip: false,
    badges: []
  }
  return {
    id: `obs-workspace-follow-${randomUUID()}`,
    platform,
    timestamp: new Date(),
    type: 'follow',
    user,
    raw: { simulated: true, source: 'obs-workspace' }
  }
}

function sign(secret: string, context: string): string {
  return createHmac('sha256', secret).update(context).digest('base64url')
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function parseCookies(header: string): Record<string, string> {
  const cookies: Record<string, string> = {}
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator <= 0) continue
    const key = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (key) cookies[key] = value
  }
  return cookies
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new Error('Request body too large.')
    chunks.push(buffer)
  }
  if (!chunks.length) throw new Error('Request body is required.')
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || typeof parsed.type !== 'string') {
    throw new Error('Invalid Control Center action.')
  }
  return parsed as T
}

function normalizePort(value: unknown): number | null {
  const port = Number(value)
  return Number.isInteger(port) && port >= 1_024 && port <= 65_535 ? port : null
}

function requireShortString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`)
  const normalized = value.trim()
  if (normalized.length > maxLength) throw new Error(`${label} is too long.`)
  return normalized
}

function optionalShortString(value: unknown, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return requireShortString(value, 'Value', maxLength)
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return max
  return Math.max(min, Math.min(max, value))
}

function platformOrder(platform: string): number {
  return ['tiktok', 'twitch', 'youtube', 'kick'].indexOf(platform)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
