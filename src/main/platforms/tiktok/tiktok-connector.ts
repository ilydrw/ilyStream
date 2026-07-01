import { randomUUID } from 'crypto'
import { BaseConnector, formatConnectorErrorMessage } from '../base-connector'
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

const TIKTOK_FOLLOWER_POLL_INTERVAL_MS = 30_000

export class TikTokConnector extends BaseConnector {
  readonly platform: Platform = 'tiktok'
  private connection: any = null
  private connectionToken = 0
  private mapper = new TikTokMapper()
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
      }
    }

    if (lastError) {
      throw lastError
    }
    throw new Error('TikTok connection failed')
  }

  protected async doDisconnect(): Promise<void> { this.cleanupConnection() }

  override getChatCapability(): PlatformChatCapability {
    const senderStatus = this.chatSender?.getStatus()
    return senderStatus?.isChatReady
      ? { platform: 'tiktok', canSend: true }
      : {
          platform: 'tiktok',
          canSend: false,
          reason: senderStatus?.statusMessage || 'Open the TikTok host chat sender'
        }
  }

  override async sendChatMessage(text: string): Promise<void> {
    if (await this.chatSender.sendMessage(text)) return
    throw new Error(this.chatSender.getStatus().lastError || 'TikTok chat sending failed')
  }

  private setupEventListeners(connection: any): void {
    // Bound handlers are stored on `this` so `cleanupConnection` can
    // removeAllListeners on the previous connection before we install a new
    // one. Previously these were inline arrows attached on every reconnect,
    // which meant the prior WebcastPushConnection's listeners (and their
    // closures over `this`) were never released — a slow leak that the
    // long-lived sessions (multi-hour streams) hit hard.
    //
    // Naming: prefix `onConnection*` to avoid shadowing `BaseConnector.handleError`,
    // `BaseConnector.onUnexpectedDisconnect`, etc. — a previous attempt that
    // named one of these `handleError` was silently shadowing the inherited
    // method and broke the error-status transition.
    connection.on('chat', this.onConnectionChat)
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
  // Bound once per class so cleanup can `removeAllListeners` deterministically.
  // Keep these as arrow-function class fields so `this` refers to the
  // connector, not the EventEmitter target.

  private onConnectionChat = (data: any) => {
    if (isTikTokLikeSocialPayload(data)) {
      this.emitEvent(this.mapper.mapLike(data))
      return
    }
    this.emitEvent(this.mapper.mapChat(data))
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
      // Remove the listeners we attached in setupEventListeners before
      // disconnecting and dropping the reference. Without this, the prior
      // WebcastPushConnection's listeners stay bound and keep it (and
      // everything it closes over) alive until GC.
      try { this.connection.removeAllListeners() } catch {}
      try { this.connection.disconnect() } catch {}
    }
    this.connection = null
  }

  private startFollowerPolling(connection: any, token: number): void {
    if (this.followerPollTimer) clearInterval(this.followerPollTimer)

    const tick = async () => {
      if (token !== this.connectionToken || connection !== this.connection) return
      try {
        const roomInfo = connection.roomInfo || (typeof connection.fetchRoomInfo === 'function' ? await connection.fetchRoomInfo() : null)
        const count = extractTikTokFollowerCount(roomInfo)
        if (typeof count !== 'number') return

        this.emitEvent({
          id: randomUUID(),
          platform: 'tiktok',
          timestamp: new Date(),
          type: 'follower-count',
          count,
          raw: { source: 'tiktok-room-info', roomInfo }
        } as FollowerCountEvent)
      } catch (err) {
        console.warn('[TikTokConnector] Follower count poll failed:', formatConnectorErrorMessage(err))
      }
    }

    this.followerPollTimer = setInterval(tick, TIKTOK_FOLLOWER_POLL_INTERVAL_MS)
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
