import { randomUUID } from 'crypto'
import { BaseConnector, ConnectorOfflineError, formatConnectorErrorMessage } from '../base-connector'
import {
  Platform,
  TikTokConfig,
  PlatformConfig,
  PlatformChatCapability,
  FollowerCountEvent
} from '../types'
import { Database } from '../../db/database'
import { TikTokChatSender } from './tiktok-chat-sender'
import { TikTokMapper } from '../mappers/tiktok-mapper'
import { isTikTokLikeSystemPayload } from '../../../shared/chat-event-filter'
import { validateTikTokSenderMessage, type TikTokCapturedCredentials } from './tiktok-chat-sender'

const TIKTOK_FOLLOWER_POLL_INTERVAL_MS = 30_000

export class TikTokConnector extends BaseConnector {
  readonly platform: Platform = 'tiktok'
  private connection: any = null
  private connectionToken = 0
  private mapper = new TikTokMapper()
  private activeConfig: TikTokConfig | null = null
  private followerPollTimer: ReturnType<typeof setInterval> | null = null

  constructor(private db: Database, private chatSender: TikTokChatSender) {
    super()
    this.setMaxReconnectAttempts(120)
  }

  validateConfig(config: PlatformConfig): string | null {
    const c = config as TikTokConfig
    if (!c.username?.trim()) return 'TikTok username is required'
    return null
  }

  protected async doConnect(config: PlatformConfig): Promise<void> {
    const tiktokConfig = config as TikTokConfig
    this.activeConfig = tiktokConfig
    const username = tiktokConfig.username.replace(/^@/, '')

    const { WebcastPushConnection } = await import('tiktok-live-connector')

    this.cleanupConnection()
    const token = ++this.connectionToken

    // RETRY STRATEGY:
    // 1. Direct room-info (default)
    // 2. Direct unique-id (if room-info fails)
    // 3. room-info without polling
    const candidates = buildTikTokConnectionOptionCandidates(tiktokConfig)
    let lastError: Error | null = null

    for (const candidate of candidates) {
      if (token !== this.connectionToken) return // Abort if a newer connection attempt started

      try {
        const connection = new WebcastPushConnection(username, candidate.options)
        this.connection = connection

        this.setupEventListeners(connection)

        // Add a timeout to the connection attempt and always clear it once
        // the candidate wins/fails so failed retries do not leave timers alive.
        let connectTimeout: ReturnType<typeof setTimeout> | null = null
        try {
          const connectPromise = connection.connect()
          const timeoutPromise = new Promise((_, reject) => {
            connectTimeout = setTimeout(() => reject(new Error(`Connection timed out after 15s (${candidate.name})`)), 15000)
          })

          await Promise.race([connectPromise, timeoutPromise])
        } finally {
          if (connectTimeout) clearTimeout(connectTimeout)
        }

        console.log(`[TikTokConnector] Successfully connected via: ${candidate.name}`)
        this.setStatus('connected')
        this.startFollowerPolling(connection, token)
        return // SUCCESS
      } catch (err: any) {
        lastError = err
        const errMsg = formatConnectorErrorMessage(err)
        this.cleanupConnection({ invalidateToken: false })

        if (isFatalTikTokConnectionErrorMessage(errMsg)) {
          break // Don't try other candidates if it's a fatal error (like invalid user)
        }
        // Note: a "not online" result still tries the remaining candidates —
        // room-info lookups are flaky, so another mode may connect a live host.
      }
    }

    if (lastError) {
      // The host simply isn't live yet — a normal waiting state, not an error.
      // Surface it as such so the UI shows "waiting to go live" and keeps retrying.
      if (isTikTokOfflineErrorMessage(formatConnectorErrorMessage(lastError))) {
        throw new ConnectorOfflineError(
          "You're not live yet — ilyStream will connect automatically when your TikTok stream starts."
        )
      }
      throw lastError
    }
    throw new Error('TikTok connection failed')
  }

  protected async doDisconnect(): Promise<void> { this.cleanupConnection() }

  override getChatCapability(): PlatformChatCapability {
    const senderStatus = this.chatSender?.getStatus()
    if (this.connection && this.getConfiguredSendCredentials()) {
      return { platform: 'tiktok', canSend: true }
    }

    return senderStatus?.isChatReady
      ? { platform: 'tiktok', canSend: true }
      : {
          platform: 'tiktok',
          canSend: false,
          reason: this.connection
            ? 'Add TikTok host session cookies or open the host chat sender'
            : senderStatus?.statusMessage || 'Open the TikTok host chat sender'
        }
  }

  override async sendChatMessage(text: string): Promise<void> {
    const validation = validateTikTokSenderMessage(text)
    if (!validation.ok) throw new Error(validation.error || 'TikTok chat message is invalid')

    const apiError = await this.trySendViaWebcast(validation.text)
    if (!apiError) return

    if (await this.chatSender.sendMessage(text)) return

    const senderError = this.chatSender.getStatus().lastError
    throw new Error(senderError || apiError || 'TikTok chat sending failed')
  }

  private async trySendViaWebcast(text: string): Promise<string | null> {
    if (!this.connection?.sendMessage) {
      return 'TikTok live connector is not connected'
    }

    const credentials = await this.getBestSendCredentials()
    if (!credentials.sessionId || !credentials.ttTargetIdc) {
      return 'TikTok host session cookies are missing'
    }

    try {
      await this.connection.sendMessage(text, {
        sessionId: credentials.sessionId,
        ttTargetIdc: credentials.ttTargetIdc
      })
      return null
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }

  private async getBestSendCredentials(): Promise<TikTokCapturedCredentials> {
    const configured = this.getConfiguredSendCredentials()
    if (configured) return configured

    const captured = await this.chatSender.captureAuthCredentials()
    if (captured.sessionId && captured.ttTargetIdc) {
      if (this.activeConfig) {
        this.activeConfig = {
          ...this.activeConfig,
          sessionId: captured.sessionId,
          ttTargetIdc: captured.ttTargetIdc
        }
      }
      return captured
    }

    return captured
  }

  private getConfiguredSendCredentials(): TikTokCapturedCredentials | null {
    const sessionId = this.activeConfig?.sessionId?.trim() || null
    const ttTargetIdc = this.activeConfig?.ttTargetIdc?.trim() || null
    if (!sessionId || !ttTargetIdc) return null
    return { sessionId, ttTargetIdc, loggedIn: true }
  }

  private setupEventListeners(connection: any): void {
    // Bound handlers (class fields below) rather than inline arrows so
    // `cleanupConnection` can removeAllListeners on the previous connection
    // before a reconnect installs a new one. Inline arrows meant every failed
    // candidate / reconnect left its listeners (and their closures) attached
    // to a WebcastPushConnection we no longer control — and a connect() that
    // resolved AFTER our 15s timeout race kept emitting duplicate events into
    // the pipeline. Multi-hour streams with flaky TikTok reconnects hit this
    // hard.
    connection.on('chat', this.onConnectionChat)
    connection.on('emote', this.onConnectionEmote)
    connection.on('gift', this.onConnectionGift)
    connection.on('like', this.onConnectionLike)
    connection.on('follow', this.onConnectionFollow)
    connection.on('share', this.onConnectionShare)
    connection.on('roomUser', this.onConnectionRoomUser)
    connection.on('member', this.onConnectionMember)
    connection.on('disconnected', this.onConnectionDisconnected)
    connection.on('streamEnd', this.onConnectionStreamEnd)
    connection.on('error', this.onConnectionError)
  }

  // --- WebcastPushConnection event handlers ---
  // Arrow-function class fields so `this` is the connector. Prefix
  // `onConnection*` deliberately avoids shadowing inherited BaseConnector
  // methods — a previous attempt named one of these `handleError` and
  // silently broke the error-status transition.

  private onConnectionChat = (data: any) => {
    if (isTikTokLikeSocialPayload(data)) {
      this.emitEvent(this.mapper.mapLike(data))
      return
    }
    this.emitEvent(this.mapper.mapChat(data))
  }

  private onConnectionEmote = (data: any) => {
    this.emitEvent(this.mapper.mapEmote(data))
  }

  private onConnectionGift = (data: any) => {
    this.emitEvent(this.mapper.mapGift(data))
  }

  private onConnectionLike = (data: any) => {
    this.emitEvent(this.mapper.mapLike(data))
  }

  private onConnectionFollow = (data: any) => {
    this.emitEvent(this.mapper.mapFollow(data))
  }

  private onConnectionShare = (data: any) => {
    this.emitEvent(this.mapper.mapShare(data))
  }

  private onConnectionRoomUser = (data: any) => {
    this.emitEvent(this.mapper.mapViewerCount(data))
  }

  private onConnectionMember = (data: any) => {
    this.emitEvent(this.mapper.mapMember(data))
  }

  private onConnectionDisconnected = () => {
    this.onUnexpectedDisconnect('TikTok disconnected')
  }

  private onConnectionStreamEnd = () => {
    this.onUnexpectedDisconnect('TikTok stream ended')
  }

  private onConnectionError = (err: any) => {
    if (this.status === 'connecting') {
      return
    }
    this.onRecoverableError(err, 'connection')
  }

  private cleanupConnection(options: { invalidateToken?: boolean } = {}): void {
    if (options.invalidateToken !== false) {
      this.connectionToken++
    }
    if (this.followerPollTimer) {
      clearInterval(this.followerPollTimer)
      this.followerPollTimer = null
    }
    if (this.connection) {
      // Detach our listeners BEFORE disconnecting: a connection whose
      // connect() is still in flight can complete after this point, and
      // without this a zombie connection keeps feeding (duplicate) events
      // into the pipeline while holding its buffers alive.
      try { this.connection.removeAllListeners() } catch {}
      try { this.connection.disconnect() } catch {}
    }
    this.connection = null
  }

  /**
   * TikTok has no follower API, so poll room info while connected and surface
   * the count as an authoritative FollowerCountEvent (the stats service
   * persists it and snapshots growth). Guarded by the connection token so a
   * tick queued before a reconnect can never report for a dead connection.
   */
  private startFollowerPolling(connection: any, token: number): void {
    if (this.followerPollTimer) clearInterval(this.followerPollTimer)

    const tick = async () => {
      if (token !== this.connectionToken || connection !== this.connection) return
      try {
        // fetchRoomInfo() refreshes the cached snapshot; connection.roomInfo
        // alone would be the connect-time value forever.
        const roomInfo = typeof connection.fetchRoomInfo === 'function'
          ? await connection.fetchRoomInfo()
          : connection.roomInfo
        if (token !== this.connectionToken || connection !== this.connection) return

        const count = extractTikTokFollowerCount(roomInfo)
        if (typeof count !== 'number') return

        this.emitEvent({
          id: randomUUID(),
          platform: 'tiktok',
          timestamp: new Date(),
          type: 'follower-count',
          count,
          // Deliberately NOT the full roomInfo: this event flows through the
          // orchestrator into event_history every 30s, and the raw payload is
          // hundreds of KB of stream metadata we never read back.
          raw: { source: 'tiktok-room-info' }
        } as FollowerCountEvent)
      } catch (err) {
        console.warn('[TikTokConnector] Follower count poll failed:', formatConnectorErrorMessage(err))
      }
    }

    this.followerPollTimer = setInterval(() => void tick(), TIKTOK_FOLLOWER_POLL_INTERVAL_MS)
    void tick()
  }
}

export function buildTikTokConnectionOptions(config: TikTokConfig) {
  return {
    sessionId: config.sessionId,
    ttTargetIdc: config.ttTargetIdc,
    signApiKey: config.signApiKey,
    processInitialData: false,
    fetchRoomInfoOnConnect: true,
    enableRequestPolling: true,
    connectWithUniqueId: false,
    requestPollingIntervalMs: 1500,
    webClientOptions: { timeout: 15_000 },
    wsClientOptions: { handshakeTimeout: 15_000 }
  }
}

export function buildTikTokConnectionOptionCandidates(config: TikTokConfig) {
  return [
    { name: 'room-info', options: buildTikTokConnectionOptions(config) },
    { name: 'unique-id-direct', options: { ...buildTikTokConnectionOptions(config), connectWithUniqueId: true } },
    { name: 'room-info-no-polling', options: { ...buildTikTokConnectionOptions(config), enableRequestPolling: false } }
  ]
}

export function isFatalTikTokConnectionErrorMessage(msg: string): boolean {
  const fatalStrings = ['User not found', 'Invalid username', 'user does not exist']
  return fatalStrings.some(s => msg.toLowerCase().includes(s.toLowerCase()))
}

/**
 * Distinguishes "the host isn't currently live" (a normal waiting state) from a
 * real connection failure. tiktok-live-connector reports this as
 * "The requested user isn't online :(".
 */
export function isTikTokOfflineErrorMessage(msg: string): boolean {
  const offlineStrings = [
    "isn't online",
    'is not online',
    'not online',
    'offline',
    'not currently live',
    'no longer live',
    'stream ended',
    'streamEnd'
  ]
  const normalized = msg.toLowerCase()
  return offlineStrings.some(s => normalized.includes(s.toLowerCase()))
}

export function isTikTokFollowSocialPayload(payload: any): boolean {
  return payload?.common?.displayText?.displayType === 'pm_mt_msg_viewer_follow_anchor'
}

export function isTikTokLikeSocialPayload(payload: any): boolean {
  return isTikTokLikeSystemPayload(payload)
}

export function mapTikTokUserInfo(data: any) {
  const isFollower = !!(data.followInfo?.followStatus === 1 || data.userIdentity?.isMutualFollowingWithAnchor)
  return {
    id: data.userId,
    username: (data.uniqueId || '').toLowerCase(),
    displayName: data.nickname || data.uniqueId || 'TikTok User',
    isFollower,
    badges: (data.userBadges || []).map((b: any) => ({ type: b.type, name: b.name }))
  }
}

/**
 * Room-info payload shapes vary by connection mode and library version, so we
 * try the known direct paths first and fall back to a bounded deep search for
 * a follower-count-shaped key.
 */
export function extractTikTokFollowerCount(roomInfo: any): number | null {
  const directCandidates = [
    roomInfo?.data?.owner?.followInfo?.followerCount,
    roomInfo?.data?.owner?.stats?.followerCount,
    roomInfo?.data?.owner?.stats?.follower_count,
    roomInfo?.data?.owner?.follow_info?.follower_count,
    roomInfo?.data?.owner?.followerCount,
    roomInfo?.data?.user?.followInfo?.followerCount,
    roomInfo?.data?.user?.stats?.followerCount,
    roomInfo?.data?.liveRoomUserInfo?.user?.stats?.followerCount,
    roomInfo?.liveRoomUserInfo?.user?.stats?.followerCount,
    roomInfo?.user?.followInfo?.followerCount,
    roomInfo?.user?.stats?.followerCount,
    roomInfo?.owner?.followInfo?.followerCount,
    roomInfo?.owner?.stats?.followerCount
  ]

  for (const candidate of directCandidates) {
    const count = normalizeFollowerCount(candidate)
    if (count !== null) return count
  }

  return findFollowerCountDeep(roomInfo, 0)
}

function normalizeFollowerCount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value)
  }
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').trim())
    if (Number.isFinite(parsed) && parsed >= 0) return Math.floor(parsed)
  }
  return null
}

function findFollowerCountDeep(value: unknown, depth: number): number | null {
  if (!value || depth > 5) return null
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 25)) {
      const found = findFollowerCountDeep(item, depth + 1)
      if (found !== null) return found
    }
    return null
  }
  if (typeof value !== 'object') return null

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase().replace(/[_-]/g, '')
    if (normalizedKey === 'followercount' || normalizedKey === 'fanscount' || normalizedKey === 'followercnt') {
      const count = normalizeFollowerCount(nested)
      if (count !== null) return count
    }
  }

  for (const nested of Object.values(value as Record<string, unknown>)) {
    const found = findFollowerCountDeep(nested, depth + 1)
    if (found !== null) return found
  }

  return null
}
