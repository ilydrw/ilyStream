import { randomUUID } from 'crypto'
import { BaseConnector } from '../base-connector'
import {
  Platform,
  TikTokConfig,
  PlatformConfig,
  PlatformChatCapability
} from '../types'
import { Database } from '../../db/database'
import { TikTokChatSender } from './tiktok-chat-sender'
import { TikTokMapper } from '../mappers/tiktok-mapper'

export class TikTokConnector extends BaseConnector {
  readonly platform: Platform = 'tiktok'
  private connection: any = null
  private connectionToken = 0
  private mapper = new TikTokMapper()

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
    console.log(`[TikTokConnector] Attempting to connect to @${username}...`)

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
        console.log(`[TikTokConnector] Attempting connection via: ${candidate.name}`)

        const connection = new WebcastPushConnection(username, candidate.options)
        this.connection = connection

        this.setupEventListeners(connection)

        // Add a timeout to the connection attempt
        const connectPromise = connection.connect()
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Connection timed out after 15s (${candidate.name})`)), 15000)
        )

        await Promise.race([connectPromise, timeoutPromise])

        console.log(`[TikTokConnector] Successfully connected via: ${candidate.name}`)
        this.setStatus('connected')
        return // SUCCESS
      } catch (err: any) {
        lastError = err
        const errMsg = err.message || String(err)
        console.warn(`[TikTokConnector] Candidate ${candidate.name} failed:`, errMsg)
        this.cleanupConnection()

        if (isFatalTikTokConnectionErrorMessage(errMsg)) {
          break // Don't try other candidates if it's a fatal error (like invalid user)
        }
      }
    }

    if (lastError) {
      this.handleError(lastError, 'connect', true)
    }
  }

  protected async doDisconnect(): Promise<void> { this.cleanupConnection() }

  override getChatCapability(): PlatformChatCapability {
    return this.chatSender?.getStatus().isChatReady ? { platform: 'tiktok', canSend: true } : { platform: 'tiktok', canSend: false, reason: 'Chat sender not ready' }
  }

  override async sendChatMessage(text: string): Promise<void> {
    if (await this.chatSender.sendMessage(text)) return
    throw new Error('TikTok chat sending failed')
  }

  private setupEventListeners(connection: any): void {
    connection.on('chat', (data: any) => {
      this.emitEvent(this.mapper.mapChat(data))
    })

    connection.on('gift', (data: any) => {
      const event = this.mapper.mapGift(data)
      this.emitEvent(event)
    })

    connection.on('like', (data: any) => {
      this.emitEvent(this.mapper.mapLike(data))
    })

    connection.on('follow', (data: any) => {
      this.emitEvent(this.mapper.mapFollow(data))
    })

    connection.on('share', (data: any) => {
      this.emitEvent(this.mapper.mapShare(data))
    })

    connection.on('roomUser', (data: any) => {
      this.emitEvent(this.mapper.mapViewerCount(data))
    })

    connection.on('member', (data: any) => {
      this.emitEvent(this.mapper.mapMember(data))
    })

    connection.on('disconnected', () => {
      this.onUnexpectedDisconnect('TikTok disconnected')
    })

    connection.on('streamEnd', () => {
      this.onUnexpectedDisconnect('TikTok stream ended')
    })

    connection.on('error', (err: any) => {
      this.onRecoverableError(err, 'connection')
    })
  }

  private cleanupConnection(): void {
    this.connectionToken++
    if (this.connection) try { this.connection.disconnect() } catch {}
    this.connection = null
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
