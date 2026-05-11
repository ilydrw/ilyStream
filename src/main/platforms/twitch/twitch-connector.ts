import { randomUUID } from 'crypto'
import { BaseConnector } from '../base-connector'
import { Database } from '../../db/database'
import {
  Platform,
  TwitchConfig,
  PlatformConfig,
  PlatformChatCapability,
  ChatEvent,
  GiftEvent,
  SubscriptionEvent,
  FollowEvent,
  RaidEvent,
  StreamInfoEvent,
  UserInfo,
  ViewerCountEvent,
  FollowerCountEvent,
  AnyStreamEvent
} from '../types'

/**
 * How often we poll Helix for stream metadata (viewer count, title, category).
 * Twitch's API quota easily tolerates this and 30s is fine-grained enough that
 * the on-screen viewer count never feels stale.
 */
const STREAM_POLL_INTERVAL_MS = 30_000
const FOLLOW_EVENTSUB_SCOPE = 'moderator:read:followers'
const SUBSCRIPTION_EVENTSUB_SCOPE = 'channel:read:subscriptions'
const RAID_EVENTSUB_SCOPE = 'channel:read:raids'
const OPTIONAL_TWITCH_SCOPES = [
  FOLLOW_EVENTSUB_SCOPE,
  SUBSCRIPTION_EVENTSUB_SCOPE,
  RAID_EVENTSUB_SCOPE,
  'chat:read',
  'chat:edit',
  'channel:moderate'
]
const USER_PROFILE_CACHE_TTL_MS = 60 * 60 * 1000
const FOLLOWER_CHECK_CACHE_TTL_MS = 60 * 1000

interface TwitchUserProfile {
  id?: string
  username?: string
  displayName?: string
  profilePictureUrl?: string
  expiresAt: number
}

export class TwitchConnector extends BaseConnector {
  readonly platform: Platform = 'twitch'
  private chatClient: any = null
  private apiClient: any = null
  private authProvider: any = null
  private eventSub: any = null
  private tokenScopes: string[] = []
  private streamPollTimer: ReturnType<typeof setInterval> | null = null
  private broadcasterId = ''
  private userProfileCache = new Map<string, TwitchUserProfile>()
  private userProfileInflight = new Map<string, Promise<TwitchUserProfile | null>>()
  private recentFollowerCache = new Set<string>() // Lowercase usernames
  private followerCheckInflight = new Map<string, Promise<boolean>>()
  private followerCheckCache = new Map<string, { isFollower: boolean; expiresAt: number }>()
  private lastFollowerBackfillAt = 0
  private lastIsLive = false

  constructor(private db?: Database) {
    super()
  }

  validateConfig(config: PlatformConfig): string | null {
    const c = config as TwitchConfig
    if (!c.channel || c.channel.trim().length === 0) {
      return 'Twitch channel name is required'
    }
    if (!c.clientId || c.clientId.trim().length === 0) {
      return 'Twitch Client ID is required'
    }
    if (!c.accessToken || c.accessToken.trim().length === 0) {
      return 'Twitch access token is required'
    }
    return null
  }

  protected async doConnect(config: PlatformConfig): Promise<void> {
    const twitchConfig = config as TwitchConfig

    // Clean up previous connection
    await this.cleanup()

    const { RefreshingAuthProvider, StaticAuthProvider } = await import('@twurple/auth')
    const { ApiClient } = await import('@twurple/api')
    const { ChatClient } = await import('@twurple/chat')

    this.tokenScopes = await this.loadTokenScopes(twitchConfig.accessToken!)
    console.log(
      `[twitch] Current access token follower lookup scope: ${
        this.hasTokenScope(FOLLOW_EVENTSUB_SCOPE) ? 'present' : 'missing'
      }`
    )
    
    // We define our full set of intended scopes here. 
    // If the AuthProvider is a RefreshingAuthProvider, it can attempt to 
    // upgrade the token if the refresh token allows it.
    const userIntents = [
      'chat:read',
      'chat:edit',
      ...OPTIONAL_TWITCH_SCOPES
    ]

    // Use RefreshingAuthProvider if we have refresh token + client secret,
    // otherwise fall back to StaticAuthProvider
    if (twitchConfig.refreshToken && twitchConfig.clientSecret) {
      this.authProvider = new RefreshingAuthProvider({
        clientId: twitchConfig.clientId,
        clientSecret: twitchConfig.clientSecret
      })

      this.authProvider.addUser(
        'self',
        {
          accessToken: twitchConfig.accessToken!,
          refreshToken: twitchConfig.refreshToken,
          expiresIn: 0,
          obtainmentTimestamp: Date.now(),
          scope: this.tokenScopes
        },
        userIntents
      )

      // Listen for token refresh to emit updated tokens
      this.authProvider.onRefresh((userId: string, newTokenData: any) => {
        console.log(`[twitch] Token refreshed for user ${userId}`)
        if (Array.isArray(newTokenData.scope)) {
          this.tokenScopes = newTokenData.scope
        }
        this.emit('token-refresh', {
          platform: 'twitch',
          accessToken: newTokenData.accessToken,
          refreshToken: newTokenData.refreshToken,
          expiresIn: newTokenData.expiresIn
        })
      })

      this.authProvider.onRefreshFailure((userId: string, error: any) => {
        console.error(`[twitch] Token refresh failed for ${userId}:`, error)
        this.handleError(error, 'token-refresh', false)
      })
    } else {
      this.authProvider = new StaticAuthProvider(
        twitchConfig.clientId,
        twitchConfig.accessToken!,
        this.tokenScopes
      )
    }

    this.apiClient = new ApiClient({ authProvider: this.authProvider })

    this.chatClient = new ChatClient({
      authProvider: this.authProvider,
      channels: [twitchConfig.channel]
    })

    this.chatClient.onMessage(
      (channel: string, user: string, message: string, msg: any) => {
        void this.emitEventWithTwitchProfile(this.mapChat(channel, user, message, msg))
      }
    )

    this.chatClient.onSub(
      (channel: string, user: string, subInfo: any, msg: any) => {
        void this.emitEventWithTwitchProfile(this.mapSubscription(user, subInfo, false))
      }
    )

    this.chatClient.onResub(
      (channel: string, user: string, subInfo: any, msg: any) => {
        void this.emitEventWithTwitchProfile(this.mapSubscription(user, subInfo, false))
      }
    )

    this.chatClient.onSubGift(
      (channel: string, user: string, subInfo: any, msg: any) => {
        void this.emitEventWithTwitchProfile(this.mapGiftSub(user, subInfo))
      }
    )

    this.chatClient.onRaid(
      (channel: string, user: string, raidInfo: any) => {
        void this.emitEventWithTwitchProfile(this.mapRaid(user, raidInfo))
      }
    )

    // Bits (cheers)
    this.chatClient.on('bits', (channel: string, user: string, message: string, msg: any) => {
      void this.emitEventWithTwitchProfile(this.mapCheer(user, message, msg))
    })

    this.chatClient.on('bitsBadgeUpgrade',
      (channel: string, user: string, upgradeInfo: any, msg: any) => {
        void this.emitEventWithTwitchProfile({
          id: randomUUID(),
          platform: 'twitch',
          timestamp: new Date(),
          type: 'gift',
          raw: { upgradeInfo, msg },
          user: this.mapUserSimple(user),
          giftName: 'Bits',
          giftId: 'bits',
          giftCount: 1,
          monetaryValue: 0,
          isCombo: false
        })
      }
    )

    this.chatClient.onDisconnect((manually: boolean) => {
      if (!manually) {
        this.onUnexpectedDisconnect('Twitch IRC disconnected')
      }
    })

    this.chatClient.onAuthenticationFailure((message: string) => {
      this.handleError(new Error(message), 'authentication', false)
    })

    await this.chatClient.connect()

    // Resolve channel name → broadcaster ID once, on connect. We need the ID
    // both for stream-info polling and for EventSub follow subscriptions, and
    // it doesn't change for the life of a session.
    try {
      const user = await this.apiClient.users.getUserByName(twitchConfig.channel)
      this.broadcasterId = user?.id ?? ''
      if (!this.broadcasterId) {
        console.warn(
          `[twitch] Could not resolve broadcaster id for "${twitchConfig.channel}" — metadata polling disabled.`
        )
      }
    } catch (err) {
      console.warn('[twitch] User lookup failed:', err instanceof Error ? err.message : err)
    }

    // Stream metadata polling — viewer count, title, category, isLive.
    if (this.broadcasterId) {
      this.startStreamPolling()
    }

    // EventSub subscriptions. Best-effort: requires specific scopes.
    // We try to start all requested telemetry topics.
    await this.tryStartEventSubTelemetry()

    // Backfill recent followers so they can use TTS immediately
    if (this.broadcasterId && this.hasTokenScope(FOLLOW_EVENTSUB_SCOPE)) {
      void this.backfillFollowers()
    }
  }

  protected async doDisconnect(): Promise<void> {
    await this.cleanup()
  }

  override getChatCapability(): PlatformChatCapability {
    if (this.status !== 'connected' || !this.chatClient) {
      return {
        platform: 'twitch',
        canSend: false,
        reason: 'Connect Twitch to send chat'
      }
    }

    return {
      platform: 'twitch',
      canSend: true
    }
  }

  override async sendChatMessage(text: string): Promise<void> {
    if (!this.chatClient || this.status !== 'connected') {
      throw new Error('Twitch is not connected')
    }

    const twitchConfig = this.currentConfig as TwitchConfig | null
    if (!twitchConfig?.channel) {
      throw new Error('Twitch channel is missing from the current connection')
    }

    await this.chatClient.say(twitchConfig.channel, text)
  }

  private async cleanup(): Promise<void> {
    if (this.streamPollTimer) {
      clearInterval(this.streamPollTimer)
      this.streamPollTimer = null
    }
    if (this.eventSub) {
      try {
        this.eventSub.stop()
      } catch {}
      this.eventSub = null
    }
    if (this.chatClient) {
      try {
        this.chatClient.removeAllListeners?.()
        this.chatClient.quit()
      } catch {}
      this.chatClient = null
    }
    this.apiClient = null
    this.authProvider = null
    this.tokenScopes = []
    this.broadcasterId = ''
    this.lastIsLive = false
    this.recentFollowerCache.clear()
  }

  /**
   * Helix poll loop. Fires `viewer-count` on every tick (caller debounces /
   * dedups as needed) and a `stream-info` event whenever title / category /
   * isLive changes. When the channel is offline we still emit a single
   * `stream-info` with `isLive: false` on the transition so consumers can
   * react to going offline.
   */
  private startStreamPolling(): void {
    if (this.streamPollTimer) clearInterval(this.streamPollTimer)
    let lastSnapshotKey = ''
    let unauthorizedCount = 0
    let suppressUntil = 0
    let lastFollowerCountAt = 0
    const tick = async () => {
      if (!this.apiClient || !this.broadcasterId) return
      // A previously-failed 401 puts us in a quiet window so we don't spam
      // Helix (and the console) with the same expired-token error every 30 s.
      if (Date.now() < suppressUntil) return
      try {
        const stream = await this.apiClient.streams.getStreamByUserId(this.broadcasterId)
        unauthorizedCount = 0

        // Follower count poll — every 5 minutes so we don't hammer Helix.
        // Requires moderator:read:followers (same scope as the EventSub follow).
        if (Date.now() - lastFollowerCountAt > 5 * 60 * 1000 && this.hasTokenScope(FOLLOW_EVENTSUB_SCOPE)) {
          lastFollowerCountAt = Date.now()
          try {
            const followers = await this.apiClient.channels.getChannelFollowers(this.broadcasterId)
            if (typeof followers.total === 'number') {
              this.emitEvent({
                id: randomUUID(),
                platform: 'twitch',
                timestamp: new Date(),
                type: 'follower-count',
                raw: null,
                count: followers.total
              } satisfies FollowerCountEvent)
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            if (!/HTTP status code 401|Unauthorized/i.test(message)) {
              console.warn('[twitch] Follower count poll failed:', message)
            }
            // If it's a 401, the outer try/catch's next iteration will detect
            // it via the stream poll and start the suppression window.
          }
        }

        if (stream) {
          this.emitEvent({
            id: randomUUID(),
            platform: 'twitch',
            timestamp: new Date(),
            type: 'viewer-count',
            raw: stream,
            count: stream.viewers || 0
          } satisfies ViewerCountEvent)

          // De-dupe stream-info: only fire when something visible changes so
          // we don't spam the bus every 30s.
          const key = `${stream.title}|${stream.gameName}|${stream.gameId}|true`
          if (key !== lastSnapshotKey) {
            lastSnapshotKey = key
            this.emitEvent({
              id: randomUUID(),
              platform: 'twitch',
              timestamp: new Date(),
              type: 'stream-info',
              raw: stream,
              isLive: true,
              title: stream.title,
              gameName: stream.gameName,
              gameId: stream.gameId,
              startedAt: stream.startDate?.toISOString?.() ?? undefined,
              thumbnailUrl: stream.thumbnailUrl
            } satisfies StreamInfoEvent)
          }
          this.lastIsLive = true
        } else {
          // Going offline: emit one stream-info with isLive=false. While
          // offline, skip emitting viewer-count entirely — the overlay's
          // currentViewerCount will simply hold its last value, which the UI
          // can interpret alongside isLive.
          if (this.lastIsLive) {
            this.lastIsLive = false
            lastSnapshotKey = 'offline'
            this.emitEvent({
              id: randomUUID(),
              platform: 'twitch',
              timestamp: new Date(),
              type: 'stream-info',
              raw: null,
              isLive: false
            } satisfies StreamInfoEvent)
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        // Twurple surfaces HTTP errors with the status code in the message.
        // Treat 401 (token revoked/expired) as terminal-ish: we can't recover
        // without re-auth, so back off to a 5-minute heartbeat and only log
        // the first occurrence so the user sees the cause without a flood.
        if (/HTTP status code 401|Unauthorized/i.test(message)) {
          unauthorizedCount++
          suppressUntil = Date.now() + 5 * 60 * 1000
          if (unauthorizedCount === 1) {
            console.warn('[twitch] Stream poll: 401 Unauthorized — token appears invalid. Backing off for 5 minutes. Reconnect Twitch from Settings to resume metadata polling.')
          }
        } else {
          console.warn('[twitch] Stream poll failed:', message)
        }
      }
    }
    // Kick off an immediate poll so the UI doesn't sit empty for 30s after
    // connect, then settle into the interval.
    void tick()
    this.streamPollTimer = setInterval(() => void tick(), STREAM_POLL_INTERVAL_MS)
  }

  /**
   * Wire up EventSub WebSocket listeners for various telemetry topics.
   * This includes follows, subscriptions, and raids.
   */
  private async tryStartEventSubTelemetry(): Promise<void> {
    if (!this.broadcasterId || !this.apiClient) return

    try {
      const { EventSubWsListener } = await import('@twurple/eventsub-ws')
      this.eventSub = new EventSubWsListener({ apiClient: this.apiClient })
      this.eventSub.start()

      // 1. Follows (Requires moderator:read:followers)
      if (this.hasTokenScope(FOLLOW_EVENTSUB_SCOPE)) {
        this.eventSub.onChannelFollow(this.broadcasterId, this.broadcasterId, (e: any) => {
          // Add to session cache immediately
          if (e.userName) {
            this.recentFollowerCache.add(e.userName.toLowerCase())
          }

          const followEvent: FollowEvent = {
            id: randomUUID(),
            platform: 'twitch',
            timestamp: e.followDate ?? new Date(),
            type: 'follow',
            raw: e,
            user: {
              id: e.userId,
              username: e.userName,
              displayName: e.userDisplayName || e.userName,
              isModerator: false,
              isSubscriber: false,
              isVip: false,
              isFollower: true,
              badges: []
            }
          }
          void this.emitEventWithTwitchProfile(followEvent)
        })
      } else {
        console.warn(`[twitch] Follow EventSub skipped: missing ${FOLLOW_EVENTSUB_SCOPE}`)
      }

      // 2. Subscriptions (Requires channel:read:subscriptions)
      if (this.hasTokenScope(SUBSCRIPTION_EVENTSUB_SCOPE)) {
        this.eventSub.onChannelSubscription(this.broadcasterId, (e: any) => {
          const subEvent: SubscriptionEvent = {
            id: randomUUID(),
            platform: 'twitch',
            timestamp: new Date(),
            type: 'subscription',
            raw: e,
            user: {
              id: e.userId,
              username: e.userName,
              displayName: e.userDisplayName || e.userName,
              isModerator: false,
              isSubscriber: true,
              isVip: false,
              badges: []
            },
            tier: e.tier || '1000',
            months: 1,
            isGift: e.isGift || false,
            monetaryValue: e.tier === '3000' ? 2499 : e.tier === '2000' ? 999 : 499
          }
          void this.emitEventWithTwitchProfile(subEvent)
        })
      }

      // 3. Raids (Requires no specific scope for receiving, but good to have telemetry)
      this.eventSub.onChannelRaidTo(this.broadcasterId, (e: any) => {
        const raidEvent: RaidEvent = {
          id: randomUUID(),
          platform: 'twitch',
          timestamp: new Date(),
          type: 'raid',
          raw: e,
          user: {
            id: e.fromUserId,
            username: e.fromUserName,
            displayName: e.fromUserDisplayName || e.fromUserName,
            isModerator: false,
            isSubscriber: false,
            isVip: false,
            badges: []
          },
          viewerCount: e.viewers || 0
        }
        void this.emitEventWithTwitchProfile(raidEvent)
      })

    } catch (err) {
      console.warn(
        '[twitch] EventSub telemetry unavailable:',
        err instanceof Error ? err.message : err
      )
      try {
        this.eventSub?.stop()
      } catch {}
      this.eventSub = null
    }
  }

  private async checkFollowerStatus(
    userId: string,
    username: string,
    displayName = username
  ): Promise<boolean> {
    const normalizedUser = normalizeTwitchUsername(username)
    if (!normalizedUser || this.recentFollowerCache.has(normalizedUser)) return true
    if (!this.apiClient || !this.broadcasterId || !this.hasTokenScope(FOLLOW_EVENTSUB_SCOPE)) {
      return false
    }

    const cached = this.followerCheckCache.get(normalizedUser)
    if (cached && cached.expiresAt > Date.now()) return cached.isFollower

    const inflight = this.followerCheckInflight.get(normalizedUser)
    if (inflight) return inflight

    const promise = (async () => {
      try {
        const follow = await this.apiClient.channels.getChannelFollowers(this.broadcasterId, userId)
        const isFollowing = follow.data.length > 0
        this.followerCheckCache.set(normalizedUser, {
          isFollower: isFollowing,
          expiresAt: Date.now() + FOLLOWER_CHECK_CACHE_TTL_MS
        })

        if (isFollowing) {
          console.log(`[twitch] API confirmed ${username} is a follower.`)
          this.recentFollowerCache.add(normalizedUser)
          this.db?.incrementUserStats({
            platform: 'twitch',
            username: normalizedUser,
            displayName,
            follows: 1
          })
        }
        return isFollowing
      } catch (err) {
        console.warn(`[twitch] Failed to check follow status for ${username}:`, err)
        return false
      } finally {
        // Keep in inflight for a while to avoid spamming the API
        setTimeout(() => this.followerCheckInflight.delete(normalizedUser), FOLLOWER_CHECK_CACHE_TTL_MS)
      }
    })()

    this.followerCheckInflight.set(normalizedUser, promise)
    return promise
  }

  private async backfillFollowers(): Promise<void> {
    if (!this.apiClient || !this.broadcasterId || !this.db) return

    // Throttle backfill to once every 10 minutes per session to avoid rate limits
    const now = Date.now()
    if (now - this.lastFollowerBackfillAt < 10 * 60 * 1000) return
    this.lastFollowerBackfillAt = now

    try {
      console.log('[twitch] Backfilling followers with pagination...')
      let count = 0
      const iterator = this.apiClient.channels.getChannelFollowersPaginated(this.broadcasterId)
      
      // We'll grab the last 2000 followers. This should cover most active users
      // for a streamer of this size.
      for await (const follow of iterator) {
        const username = follow.userName.toLowerCase()
        this.recentFollowerCache.add(username)
        
        this.db.incrementUserStats({
          platform: 'twitch',
          username: follow.userName,
          displayName: follow.userDisplayName,
          follows: 1
        })
        
        count++
        if (count >= 2000) break
      }
      
      console.log(`[twitch] Backfill complete. Added/Updated ${count} followers in cache and DB.`)
    } catch (err) {
      console.warn('[twitch] Follower backfill failed:', err instanceof Error ? err.message : err)
    }
  }

  private hasTokenScope(scope: string): boolean {
    return this.tokenScopes.includes(scope)
  }

  private async loadTokenScopes(accessToken: string): Promise<string[]> {
    try {
      const response = await fetch('https://id.twitch.tv/oauth2/validate', {
        headers: {
          Authorization: `OAuth ${accessToken}`
        }
      })
      if (!response.ok) {
        console.warn(
          `[twitch] Token scope validation failed (${response.status}); optional scoped features disabled.`
        )
        return []
      }

      const data = (await response.json()) as { scopes?: string[]; scope?: string[] }
      if (Array.isArray(data.scopes)) return data.scopes
      if (Array.isArray(data.scope)) return data.scope
      return []
    } catch (err) {
      console.warn(
        '[twitch] Token scope validation failed; optional scoped features disabled:',
        err instanceof Error ? err.message : err
      )
      return []
    }
  }

  private async emitEventWithTwitchProfile<T extends AnyStreamEvent>(event: T): Promise<void> {
    try {
      this.emitEvent(await this.enrichEventWithTwitchProfile(event))
    } catch (err) {
      console.warn('[twitch] User metadata lookup failed:', err instanceof Error ? err.message : err)
      this.emitEvent(event)
    }
  }

  private async enrichEventWithTwitchProfile<T extends AnyStreamEvent>(event: T): Promise<T> {
    const enriched = { ...event } as T & { user?: UserInfo; gifterUser?: UserInfo }

    if (enriched.user) {
      enriched.user = await this.hydrateUserProfile(enriched.user)
    }
    if (enriched.gifterUser) {
      enriched.gifterUser = await this.hydrateUserProfile(enriched.gifterUser)
    }

    return enriched
  }

  private async hydrateUserProfile(user: UserInfo): Promise<UserInfo> {
    let nextUser = user

    if (!user.profilePictureUrl) {
      const profile = await this.getCachedUserProfile(user.id, user.username)

      if (profile) {
        nextUser = {
          ...user,
          id: profile.id || user.id,
          username: profile.username || user.username,
          displayName: profile.displayName || user.displayName,
          profilePictureUrl: profile.profilePictureUrl || user.profilePictureUrl
        }
      }
    }

    return this.enrichFollowerStatus(nextUser)
  }

  private async enrichFollowerStatus(user: UserInfo): Promise<UserInfo> {
    const normalizedUser = normalizeTwitchUsername(user.username)
    if (!normalizedUser) return user

    if (user.isFollower || this.resolveLocalFollowerStatus(normalizedUser)) {
      return { ...user, isFollower: true }
    }

    if (user.id && /^\d+$/.test(user.id)) {
      const isFollower = await this.checkFollowerStatus(user.id, normalizedUser, user.displayName)
      if (isFollower) {
        return { ...user, isFollower: true }
      }
    }

    return user
  }

  private resolveLocalFollowerStatus(username: string): boolean {
    const normalizedUser = normalizeTwitchUsername(username)
    if (!normalizedUser) return false
    if (this.recentFollowerCache.has(normalizedUser)) return true

    if (this.db) {
      try {
        const stat = this.db.getUserStat('twitch', normalizedUser)
        if (stat && stat.total_follows > 0) {
          this.recentFollowerCache.add(normalizedUser)
          return true
        }
      } catch {}
    }

    return false
  }

  private async getCachedUserProfile(userId?: string, username?: string): Promise<TwitchUserProfile | null> {
    if (!this.apiClient) return null

    const numericId = userId && /^\d+$/.test(userId) ? userId : undefined
    const normalizedUsername = username?.trim().toLowerCase()
    const idKey = numericId ? `id:${numericId}` : ''
    const usernameKey = normalizedUsername ? `name:${normalizedUsername}` : ''
    const lookupKey = idKey || usernameKey
    if (!lookupKey) return null

    const cached = this.userProfileCache.get(lookupKey)
    if (cached && cached.expiresAt > Date.now()) return cached

    const inflight = this.userProfileInflight.get(lookupKey)
    if (inflight) return inflight

    const promise = this.fetchUserProfile(numericId, normalizedUsername)
      .then((profile) => {
        if (profile) this.cacheUserProfile(profile)
        return profile
      })
      .finally(() => {
        this.userProfileInflight.delete(lookupKey)
      })

    this.userProfileInflight.set(lookupKey, promise)
    return promise
  }

  private async fetchUserProfile(
    userId?: string,
    username?: string
  ): Promise<TwitchUserProfile | null> {
    const helixUser = userId
      ? await this.apiClient.users.getUserById(userId)
      : username
        ? await this.apiClient.users.getUserByName(username)
        : null

    if (!helixUser) return null

    return {
      id: helixUser.id,
      username: helixUser.name,
      displayName: helixUser.displayName,
      profilePictureUrl: helixUser.profilePictureUrl,
      expiresAt: Date.now() + USER_PROFILE_CACHE_TTL_MS
    }
  }

  private cacheUserProfile(profile: TwitchUserProfile): void {
    if (profile.id) {
      this.userProfileCache.set(`id:${profile.id}`, profile)
    }
    if (profile.username) {
      this.userProfileCache.set(`name:${profile.username.toLowerCase()}`, profile)
    }
  }

  private mapUserSimple(username: string): UserInfo {
    return {
      id: username,
      username,
      displayName: username,
      isModerator: false,
      isSubscriber: false,
      isVip: false,
      badges: []
    }
  }

  private mapUserFromMsg(user: string, msg: any): UserInfo {
    const userInfo = msg?.userInfo
    const badges = userInfo?.badges
      ? Array.from(userInfo.badges.entries()).map(([id]: [string, any]) => ({
          id,
          name: id,
          imageUrl: `https://static-cdn.jtvnw.net/badges/v2/${id}/1`
        }))
      : []
    const badgeText = badges.map((badge) => `${badge.id} ${badge.name}`).join(' ').toLowerCase()

    const normalizedUser = normalizeTwitchUsername(user)
    const twitchUserId = firstTwitchString(userInfo?.userId, msg?.userId, msg?.tags?.get?.('user-id'))
    const isFollower = this.resolveLocalFollowerStatus(normalizedUser)

    if (isFollower) {
      console.log(`[twitch] User "${user}" resolved as Follower=true (cache/DB)`)
    } else if (twitchUserId && this.hasTokenScope(FOLLOW_EVENTSUB_SCOPE)) {
      console.log(`[twitch] User "${user}" follower status pending API check.`)
    } else {
      console.log(
        `[twitch] User "${user}" follower status unavailable. Mod=${userInfo?.isMod}, Sub=${userInfo?.isSubscriber}`
      )
    }

    return {
      id: twitchUserId || user,
      username: user,
      displayName: userInfo?.displayName || user,
      profilePictureUrl: undefined,
      isModerator: userInfo?.isMod || false,
      isSubscriber: userInfo?.isSubscriber || false,
      isVip: userInfo?.isVip || false,
      isFollower,
      isFanClubMember: Boolean(userInfo?.isSubscriber),
      isTeamMember: badgeText.includes('staff'),
      badges
    }
  }

  private mapChat(channel: string, user: string, message: string, msg: any): ChatEvent {
    const emotes: any[] = []

    // Safely parse emote offsets
    try {
      if (msg?.emoteOffsets) {
        for (const [id, ranges] of msg.emoteOffsets.entries()) {
          for (const range of ranges) {
            const parts = range.split('-')
            if (parts.length === 2) {
              const start = Number(parts[0])
              const end = Number(parts[1])
              if (!isNaN(start) && !isNaN(end)) {
                emotes.push({
                  id,
                  name: message.substring(start, end + 1),
                  imageUrl: `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/1.0`,
                  startIndex: start,
                  endIndex: end
                })
              }
            }
          }
        }
      }
    } catch {
      // Emote parsing is non-critical
    }

    return {
      id: msg?.id || randomUUID(),
      platform: 'twitch',
      timestamp: new Date(),
      type: 'chat',
      raw: msg,
      user: this.mapUserFromMsg(user, msg),
      message,
      emotes,
      isReply: !!msg.parentMessageId,
      replyToUsername: msg.parentDisplayName || undefined
    }
  }

  private mapSubscription(user: string, subInfo: any, isGift: boolean): SubscriptionEvent {
    return {
      id: randomUUID(),
      platform: 'twitch',
      timestamp: new Date(),
      type: 'subscription',
      raw: subInfo,
      user: {
        id: subInfo?.userId || user,
        username: user,
        displayName: subInfo?.displayName || user,
        isModerator: false,
        isSubscriber: true,
        isVip: false,
        badges: []
      },
      tier: subInfo?.plan || '1000',
      months: subInfo?.months || 1,
      message: subInfo?.message,
      isGift,
      monetaryValue: subInfo?.plan === '3000' ? 2499 : subInfo?.plan === '2000' ? 999 : 499
    }
  }

  private mapGiftSub(gifter: string, subInfo: any): SubscriptionEvent {
    return {
      id: randomUUID(),
      platform: 'twitch',
      timestamp: new Date(),
      type: 'subscription',
      raw: subInfo,
      user: {
        id: subInfo?.userId || '',
        username: subInfo?.userName || '',
        displayName: subInfo?.displayName || 'Someone',
        isModerator: false,
        isSubscriber: true,
        isVip: false,
        badges: []
      },
      tier: subInfo?.plan || '1000',
      months: 1,
      isGift: true,
      gifterUser: this.mapUserSimple(gifter),
      monetaryValue: subInfo?.plan === '3000' ? 2499 : subInfo?.plan === '2000' ? 999 : 499
    }
  }

  private mapCheer(user: string, message: string, msg: any): GiftEvent {
    return {
      id: msg?.id || randomUUID(),
      platform: 'twitch',
      timestamp: new Date(),
      type: 'gift',
      raw: msg,
      user: this.mapUserFromMsg(user, msg),
      giftName: 'Bits',
      giftId: 'bits',
      giftCount: msg.bits || 0,
      monetaryValue: msg.bits || 0, // 1 bit = 1 cent
      isCombo: false
    }
  }

  private mapRaid(user: string, raidInfo: any): RaidEvent {
    return {
      id: randomUUID(),
      platform: 'twitch',
      timestamp: new Date(),
      type: 'raid',
      raw: raidInfo,
      user: {
        id: user,
        username: user,
        displayName: raidInfo?.displayName || user,
        isModerator: false,
        isSubscriber: false,
        isVip: false,
        badges: []
      },
      viewerCount: raidInfo?.viewerCount || 0
    }
  }
}

function normalizeTwitchUsername(username?: string): string {
  return (username || '').trim().toLowerCase()
}

function firstTwitchString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}
