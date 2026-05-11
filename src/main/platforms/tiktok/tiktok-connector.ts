import { randomUUID } from 'crypto'
import { BaseConnector } from '../base-connector'
import {
  Platform,
  TikTokConfig,
  PlatformConfig,
  PlatformChatCapability,
  ChatEvent,
  GiftEvent,
  FollowEvent,
  LikeEvent,
  ShareEvent,
  JoinEvent,
  ViewerCountEvent,
  SubscriptionEvent,
  UserInfo
} from '../types'
import { Database, type TikTokGiftInput } from '../../db/database'
import { estimateTikTokCreatorGiftCents } from '../../../shared/tiktok-revenue'

export class TikTokConnector extends BaseConnector {
  readonly platform: Platform = 'tiktok'
  private connection: any = null
  private connectionToken = 0
  private lastActivityAt = 0
  private watchdogTimer: ReturnType<typeof setInterval> | null = null
  private recentFollowEvents = new Map<string, number>()
  private readonly watchdogIntervalMs = 15_000
  private readonly staleConnectionMs = 90_000

  constructor(private db: Database) {
    super()
    // TikTok's unofficial websocket path can flap during longer streams.
    // Keep trying for a full broadcast instead of giving up after a few minutes.
    this.setMaxReconnectAttempts(120)
  }

  validateConfig(config: PlatformConfig): string | null {
    const c = config as TikTokConfig
    if (!c.username || c.username.trim().length === 0) {
      return 'TikTok username is required'
    }
    return null
  }

  protected async doConnect(config: PlatformConfig): Promise<void> {
    const tiktokConfig = config as TikTokConfig
    const username = tiktokConfig.username.replace(/^@/, '')

    const { WebcastPushConnection } = await import('tiktok-live-connector')
    let lastError: unknown = null

    for (const candidate of buildTikTokConnectionOptionCandidates(tiktokConfig)) {
      try {
        await this.connectWithCandidate(WebcastPushConnection, username, candidate)
        if (candidate.name !== 'room-info') {
          console.log(`[tiktok] Connected with fallback mode: ${candidate.name}`)
        }
        return
      } catch (error) {
        lastError = error
        const message = getErrorMessage(error)
        const isOffline = message.toLowerCase().includes("isn't online") || message.toLowerCase().includes("offline")
        
        if (isOffline) {
          console.log(`[tiktok] ${candidate.name} attempt: User is currently offline.`)
        } else if (message.includes('Euler Stream') && message.includes('lack of permission')) {
          console.error(`[tiktok] ${candidate.name} attempt: Euler Stream signing failed. This usually means TikTok has blocked the request or requires a valid signApiKey in your settings.`)
        } else {
          console.warn(`[tiktok] ${candidate.name} connection attempt failed: ${message}`)
        }
        this.cleanupConnection()
      }
    }

    throw lastError ?? new Error('TikTok connection failed')
  }

  private async connectWithCandidate(
    WebcastPushConnection: new (username: string, options: Record<string, unknown>) => any,
    username: string,
    candidate: TikTokConnectionOptionCandidate
  ): Promise<void> {
    this.cleanupConnection()
    const token = ++this.connectionToken
    this.lastActivityAt = Date.now()
    let disconnectHandled = false
    let initialConnectFinished = false

    const connection = new WebcastPushConnection(username, candidate.options)
    this.connection = connection

    const isCurrentConnection = () => this.connection === connection && token === this.connectionToken
    const markActivity = () => {
      if (isCurrentConnection()) {
        this.lastActivityAt = Date.now()
      }
    }
    const handleUnexpectedDisconnect = (reason: string) => {
      if (!isCurrentConnection() || disconnectHandled) return
      disconnectHandled = true
      this.stopWatchdog()
      this.onUnexpectedDisconnect(reason)
    }

    connection.on('connected', (state: any) => {
      markActivity()
      console.log(`[tiktok] Connected to room ${state.roomId || 'unknown'} (Mode: ${candidate.name}, Protocol: ${state.upgradedToWebsocket ? 'WebSocket' : 'Polling'})`)
    })

    connection.on('websocketConnected', () => {
      markActivity()
    })

    connection.on('websocketData', () => {
      markActivity()
    })

    connection.on('rawData', () => {
      markActivity()
    })

    connection.on('streamEnd', () => {
      handleUnexpectedDisconnect('TikTok reported stream end; retrying in case this was a transient room-state response')
    })

    connection.on('chat', (data: any) => {
      if (!isCurrentConnection()) return
      markActivity()
      // Deep Debug Log: See if the message is even reaching the app
      const comment = data.comment || data.text || data.message || ''
      console.log(`[tiktok-raw-chat] From: ${data.uniqueId} (ID: ${data.userId}) - Message: ${comment}`)
      this.emitEvent(this.mapChat(data))
    })

    connection.on('gift', (data: any) => {
      if (!isCurrentConnection()) return
      markActivity()
      this.emitEvent(this.mapGift(data))
    })

    connection.on('follow', (data: any) => {
      if (!isCurrentConnection()) return
      markActivity()
      this.emitFollow(data)
    })

    connection.on('social', (data: any) => {
      if (!isCurrentConnection()) return
      markActivity()
      if (isTikTokFollowSocialPayload(data)) {
        this.emitFollow(data)
      } else {
        console.log(`[tiktok-raw-social] Non-follow social event: ${getTikTokSocialText(data)}`)
      }
    })

    connection.on('like', (data: any) => {
      if (!isCurrentConnection()) return
      markActivity()
      this.emitEvent(this.mapLike(data))
    })

    connection.on('share', (data: any) => {
      if (!isCurrentConnection()) return
      markActivity()
      this.emitEvent(this.mapShare(data))
    })

    connection.on('member', (data: any) => {
      if (!isCurrentConnection()) return
      markActivity()
      this.emitEvent(this.mapJoin(data))
    })

    connection.on('subscribe', (data: any) => {
      if (!isCurrentConnection()) return
      markActivity()
      this.emitEvent(this.mapSubscription(data))
    })

    connection.on('roomUser', (data: any) => {
      if (!isCurrentConnection()) return
      markActivity()
      this.emitEvent(this.mapViewerCount(data))
    })

    connection.on('disconnected', (event: { code?: number; reason?: string } = {}) => {
      const reason = event.reason ? `TikTok WebSocket closed: ${event.reason}` : 'TikTok WebSocket closed'
      handleUnexpectedDisconnect(event.code ? `${reason} (${event.code})` : reason)
    })

    connection.on('error', (err: any) => {
      if (!isCurrentConnection()) return
      if (!initialConnectFinished) return

      // TikTok errors from invalid username are not recoverable
      const message = err?.message || String(err)
      if (isFatalTikTokConnectionErrorMessage(message)) {
        this.stopWatchdog()
        this.handleError(err, 'connection', false)
      } else {
        this.cleanupConnection()
        this.onRecoverableError(err, 'connection')
      }
    })

    try {
      const state = await connection.connect()
      
      try {
        const followerCount = 
          state?.roomInfo?.data?.host_info?.follower_num ||
          state?.roomInfo?.data?.owner?.follower_info?.follower_count ||
          state?.roomInfo?.data?.stats?.followerCount ||
          state?.roomInfo?.data?.user?.followerCount ||
          state?.roomInfo?.data?.liveRoomUserInfo?.user?.followerCount ||
          0;
          
        if (followerCount > 0) {
          this.emitEvent({
            id: randomUUID(),
            platform: 'tiktok',
            timestamp: new Date(),
            type: 'follower-count',
            count: followerCount,
            raw: state?.roomInfo
          })
        }
      } catch (err) {
        console.warn('[tiktok] Failed to extract initial follower count', err);
      }

      initialConnectFinished = true
      markActivity()
      this.persistAvailableGifts(connection)
      this.startWatchdog(token)
    } catch (error) {
      initialConnectFinished = true
      throw error
    }
  }

  protected async doDisconnect(): Promise<void> {
    this.cleanupConnection()
  }

  override getChatCapability(): PlatformChatCapability {
    if (this.status !== 'connected' || !this.connection) {
      return {
        platform: 'tiktok',
        canSend: false,
        reason: 'Connect TikTok to send chat'
      }
    }

    const config = this.currentConfig as TikTokConfig | null
    if (!config?.sessionId || !config.ttTargetIdc) {
      return {
        platform: 'tiktok',
        canSend: false,
        reason: 'TikTok sending needs sessionId and tt-target-idc'
      }
    }

    if (!config.signApiKey) {
      return {
        platform: 'tiktok',
        canSend: false,
        reason: 'TikTok sending needs a Sign API key'
      }
    }

    if (typeof this.connection.sendMessage !== 'function') {
      return {
        platform: 'tiktok',
        canSend: false,
        reason: 'TikTok connector does not expose sendMessage'
      }
    }

    return {
      platform: 'tiktok',
      canSend: true
    }
  }

  override async sendChatMessage(text: string): Promise<void> {
    if (!this.connection || this.status !== 'connected') {
      throw new Error('TikTok is not connected')
    }

    const capability = this.getChatCapability()
    if (!capability.canSend) {
      throw new Error(capability.reason || 'TikTok outbound chat is unavailable')
    }

    await this.connection.sendMessage(text)
  }

  private cleanupConnection(): void {
    this.connectionToken++
    this.stopWatchdog()

    if (this.connection) {
      try {
        this.connection.removeAllListeners()
        this.connection.disconnect()
      } catch {}
      this.connection = null
    }
  }

  private startWatchdog(token: number): void {
    this.stopWatchdog()

    this.watchdogTimer = setInterval(() => {
      if (!this.connection || token !== this.connectionToken || this.status !== 'connected') return

      const silentForMs = Date.now() - this.lastActivityAt
      if (silentForMs < this.staleConnectionMs) return

      console.warn(
        `[tiktok] No websocket activity for ${Math.round(silentForMs / 1000)}s; restarting connection`
      )
      this.cleanupConnection()
      this.onRecoverableError(
        new Error('TikTok websocket went silent; restarting connection'),
        'watchdog'
      )
    }, this.watchdogIntervalMs)
  }

  private stopWatchdog(): void {
    if (!this.watchdogTimer) return
    clearInterval(this.watchdogTimer)
    this.watchdogTimer = null
  }

  private mapUser(data: any): UserInfo {
    return mapTikTokUserInfo(data)
  }

  private mapChat(data: any): ChatEvent {
    return {
      id: randomUUID(),
      platform: 'tiktok',
      timestamp: new Date(),
      type: 'chat',
      raw: data,
      user: this.mapUser(data),
      message: data.comment || data.text || data.message || '',
      emotes: (data.emotes || []).map((e: any) => ({
        id: String(e.emoteId || ''),
        name: e.emoteImageUrl ? '' : '',
        imageUrl: e.emoteImageUrl || '',
        startIndex: 0,
        endIndex: 0
      })),
      isReply: !!data.replyToUser,
      replyToUsername: data.replyToUser?.uniqueId || undefined
    }
  }

  private mapGift(data: any): GiftEvent {
    const giftRecord = extractTikTokGiftRecord(data, 'event')
    let diamondCount = giftRecord?.diamond_count || data.diamondCount || 0
    const repeatCount = data.giftCount || data.repeatCount || 1
    const giftId = data.giftId?.toString()
    const giftName = giftRecord?.name || data.giftName || 'Unknown Gift'

    // Try to find gift in DB if it reports 0 diamonds (often happens with animated gifts)
    if (diamondCount === 0 && giftId) {
      const dbGift = this.db.getTikTokGift(giftId)
      if (dbGift) {
        diamondCount = dbGift.diamond_count
      }
    }

    // Auto-save/update gift in DB if we have valid info
    if (giftRecord) {
      this.db.saveTikTokGift({
        ...giftRecord,
        diamond_count: Math.max(giftRecord.diamond_count, diamondCount)
      })
    }

    return {
      id: randomUUID(),
      platform: 'tiktok',
      timestamp: new Date(),
      type: 'gift',
      raw: data,
      user: this.mapUser(data),
      giftName,
      giftId: String(data.giftId || ''),
      giftCount: repeatCount,
      giftImageUrl: data.giftPictureUrl || undefined,
      // Estimated creator payout, not viewer coin spend.
      monetaryValue: estimateTikTokCreatorGiftCents(diamondCount, repeatCount),
      isCombo: data.repeatEnd === false
    }
  }

  private persistAvailableGifts(connection: any): void {
    const persist = (rawGifts: unknown, source: string) => {
      if (!Array.isArray(rawGifts)) return
      const gifts = rawGifts
        .map((gift) => extractTikTokGiftRecord(gift, source))
        .filter((gift): gift is TikTokGiftInput => Boolean(gift))

      if (gifts.length === 0) return
      const count = this.db.saveTikTokGiftCatalog(gifts, source)
      console.log(`[tiktok] Stored ${count} TikTok gifts from ${source}.`)
    }

    persist(connection.availableGifts, 'available-gifts')

    if (typeof connection.fetchAvailableGifts === 'function') {
      void connection.fetchAvailableGifts()
        .then((gifts: unknown) => persist(gifts, 'gift-list-api'))
        .catch((err: unknown) => {
          console.warn(`[tiktok] Failed to refresh TikTok gift catalog: ${getErrorMessage(err)}`)
        })
    }
  }

  private mapFollow(data: any): FollowEvent {
    return {
      id: randomUUID(),
      platform: 'tiktok',
      timestamp: new Date(),
      type: 'follow',
      raw: data,
      user: this.mapUser(data)
    }
  }

  private emitFollow(data: any): void {
    if (this.isDuplicateFollow(data)) return
    this.emitEvent(this.mapFollow(data))
  }

  private isDuplicateFollow(data: any): boolean {
    const key = getTikTokFollowDedupeKey(data)
    if (!key) return false

    const now = Date.now()
    for (const [existingKey, seenAt] of this.recentFollowEvents) {
      if (now - seenAt > 10_000) {
        this.recentFollowEvents.delete(existingKey)
      }
    }

    const previousSeenAt = this.recentFollowEvents.get(key)
    if (previousSeenAt && now - previousSeenAt < 5_000) return true

    this.recentFollowEvents.set(key, now)
    return false
  }

  private mapLike(data: any): LikeEvent {
    return {
      id: randomUUID(),
      platform: 'tiktok',
      timestamp: new Date(),
      type: 'like',
      raw: data,
      user: this.mapUser(data),
      likeCount: data.likeCount || 1,
      totalLikes: data.totalLikeCount || 0
    }
  }

  private mapShare(data: any): ShareEvent {
    return {
      id: randomUUID(),
      platform: 'tiktok',
      timestamp: new Date(),
      type: 'share',
      raw: data,
      user: this.mapUser(data)
    }
  }

  private mapJoin(data: any): JoinEvent {
    return {
      id: randomUUID(),
      platform: 'tiktok',
      timestamp: new Date(),
      type: 'join',
      raw: data,
      user: this.mapUser(data)
    }
  }

  private mapViewerCount(data: any): ViewerCountEvent {
    return {
      id: randomUUID(),
      platform: 'tiktok',
      timestamp: new Date(),
      type: 'viewer-count',
      raw: data,
      count: data.viewerCount || 0
    }
  }

  private mapSubscription(data: any): SubscriptionEvent {
    return {
      id: randomUUID(),
      platform: 'tiktok',
      timestamp: new Date(),
      type: 'subscription',
      raw: data,
      user: this.mapUser(data),
      tier: '1',
      months: data.monthCount || 1,
      isGift: !!data.isGifted,
      monetaryValue: 499 // $4.99 gross
    }
  }
}

export interface TikTokConnectionOptionCandidate {
  name: string
  options: Record<string, unknown>
}

export function buildTikTokConnectionOptions(config: TikTokConfig): Record<string, unknown> {
  return buildTikTokConnectionOptionCandidates(config)[0].options
}

export function buildTikTokConnectionOptionCandidates(
  config: TikTokConfig
): TikTokConnectionOptionCandidate[] {
  const baseOptions = {
    sessionId: config.sessionId || null,
    ttTargetIdc: config.ttTargetIdc || null,
    signApiKey: config.signApiKey || null,
    processInitialData: false,
    enableExtendedGiftInfo: true,
    enableRequestPolling: true,
    requestPollingIntervalMs: 1500,
    webClientOptions: {
      timeout: 15_000
    },
    wsClientOptions: {
      handshakeTimeout: 15_000
    }
  }

  return [
    {
      name: 'room-info',
      options: {
        ...baseOptions,
        fetchRoomInfoOnConnect: true,
        connectWithUniqueId: false
      }
    },
    ...(config.signApiKey ? [{
      name: 'unique-id-direct',
      options: {
        ...baseOptions,
        fetchRoomInfoOnConnect: false,
        connectWithUniqueId: true
      }
    }] : []),
    {
      name: 'room-info-no-polling',
      options: {
        ...baseOptions,
        fetchRoomInfoOnConnect: true,
        connectWithUniqueId: false,
        enableRequestPolling: false
      }
    },
    {
      name: 'room-info-no-euler',
      options: {
        ...baseOptions,
        fetchRoomInfoOnConnect: true,
        connectWithUniqueId: false,
        disableEulerFallbacks: true
      }
    }
  ]
}

export function isFatalTikTokConnectionErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase()

  return (
    normalized.includes('not found') ||
    normalized.includes('invalid unique') ||
    normalized.includes('invalid username') ||
    normalized.includes('user does not exist')
  )
}

export function isTikTokFollowSocialPayload(data: any): boolean {
  return getTikTokSocialText(data).includes('follow')
}

export function mapTikTokUserInfo(data: any): UserInfo {
  const badges = normalizeTikTokBadges(data)
  const badgeText = badges.map((badge) => `${badge.id} ${badge.name}`).join(' ').toLowerCase()
  const followRole = firstNumber(
    data?.followRole,
    data?.followInfo?.followStatus,
    data?.userDetails?.followRole,
    data?.userDetails?.followInfo?.followStatus,
    data?.user?.followInfo?.followStatus
  )

  const usernameRaw = String(data?.uniqueId || data?.userId || `user_${randomUUID().slice(0, 8)}`)
  const username = usernameRaw.toLowerCase().trim()
  const displayName = String(data?.nickname || data?.uniqueId || usernameRaw).trim()

  return {
    id: String(data?.userId || data?.uniqueId || username),
    username,
    displayName,
    profilePictureUrl:
      data?.profilePictureUrl ||
      data?.avatar_thumb?.url_list?.[0] ||
      data?.avatar_medium?.url_list?.[0] ||
      data?.userDetails?.profilePictureUrls?.[0] ||
      undefined,
    isModerator: Boolean(data?.isModerator || data?.userIdentity?.isModeratorOfAnchor),
    isSubscriber: Boolean(data?.isSubscriber || data?.userIdentity?.isSubscriberOfAnchor),
    isVip: Boolean(data?.isOwner || data?.userIdentity?.isAnchor),
    isFollower: Boolean(
      data?.isFollower ||
        data?.isFollowerOfAnchor ||
        data?.isMutualFollowingWithAnchor ||
        data?.userIdentity?.isFollowerOfAnchor ||
        data?.userIdentity?.isMutualFollowingWithAnchor ||
        followRole > 0 ||
        badgeText.includes('follower') ||
        badgeText.includes('following')
    ),
    isFanClubMember: Boolean(
      data?.isFanClubMember ||
        data?.isSubscriber ||
        data?.userIdentity?.isSubscriberOfAnchor ||
        badgeText.includes('fan') ||
        badgeText.includes('subscriber')
    ),
    isTeamMember: Boolean(data?.isTeamMember || badgeText.includes('team')),
    badges
  }
}

function normalizeTikTokBadges(data: any) {
  const rawBadges = [
    ...(Array.isArray(data?.badges) ? data.badges : []),
    ...(Array.isArray(data?.userBadges) ? data.userBadges : []),
    ...(Array.isArray(data?.user?.badges) ? data.user.badges : [])
  ]

  return rawBadges.map((badge: any) => ({
    id: firstString(badge?.type, badge?.id, badge?.badgeSceneType, badge?.displayType),
    name: firstString(badge?.name, badge?.displayName, badge?.title, badge?.label),
    imageUrl: firstString(badge?.url, badge?.imageUrl, badge?.image?.url?.[0]) || undefined
  }))
}

function getTikTokSocialText(data: any): string {
  return [
    data?.displayType,
    data?.label,
    data?.socialType,
    data?.common?.displayText?.displayType,
    data?.common?.displayText?.text,
    data?.common?.displayText?.defaultFormat?.key,
    data?.common?.method,
    data?.message?.displayType
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function getTikTokFollowDedupeKey(data: any): string {
  return String(
    data?.userId ??
      data?.uniqueId ??
      data?.user?.id ??
      data?.user?.uniqueId ??
      data?.user?.uniqueIdString ??
      data?.common?.userId ??
      data?.common?.msgId ??
      ''
  )
}

function extractTikTokGiftRecord(input: any, source: string): TikTokGiftInput | null {
  const gift = input?.extendedGiftInfo ?? input?.giftDetails ?? input?.gift ?? input
  const giftId = firstString(
    gift?.id,
    gift?.gift_id,
    gift?.giftId,
    gift?.giftID,
    input?.giftId,
    input?.gift_id
  )
  const name = firstString(
    gift?.name,
    gift?.giftName,
    gift?.gift_name,
    input?.giftName,
    input?.gift?.name,
    gift?.nameRef?.defaultPattern,
    input?.giftValue?.nameRef?.defaultPattern
  )

  if (!giftId || !name) return null

  const nameKey = firstString(
    gift?.nameKey,
    gift?.name_key,
    gift?.giftNameKey,
    gift?.gift_name_key,
    gift?.nameRef?.key,
    input?.giftValue?.nameRef?.key
  )

  return {
    gift_id: giftId,
    name,
    diamond_count: firstNumber(
      gift?.diamond_count,
      gift?.diamondCount,
      gift?.diamond,
      gift?.cost,
      input?.diamondCount,
      input?.gift?.diamond_count
    ),
    image_url: extractTikTokImageUrl(gift) || extractTikTokImageUrl(input) || input?.giftPictureUrl || undefined,
    name_key: nameKey || undefined,
    source,
    raw: gift,
    aliases: [
      firstString(input?.giftName),
      firstString(gift?.describe),
      firstString(gift?.displayName),
      nameKey
    ].filter(Boolean)
  }
}

function extractTikTokImageUrl(value: any): string | undefined {
  return firstString(
    value?.image?.url_list?.[0],
    value?.image?.urlList?.[0],
    value?.icon?.url_list?.[0],
    value?.icon?.urlList?.[0],
    value?.giftImage?.url_list?.[0],
    value?.giftImage?.urlList?.[0],
    value?.giftPictureUrl
  ) || undefined
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (value === null || value === undefined) continue
    const text = String(value).trim()
    if (text) return text
  }
  return ''
}

function firstNumber(...values: unknown[]): number {
  for (const value of values) {
    const number = Number(value)
    if (Number.isFinite(number) && number > 0) return Math.floor(number)
  }
  return 0
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
