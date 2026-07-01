import { randomUUID } from 'crypto'
import { BaseConnector } from '../base-connector'
import { Database } from '../../db/database'
import {
  Platform,
  TwitchConfig,
  PlatformConfig,
  PlatformChatCapability,
  AnyStreamEvent,
  ViewerCountEvent,
  FollowerCountEvent,
  StreamInfoEvent,
  UserInfo
} from '../types'
import { TwitchMapper } from '../mappers/twitch-mapper'

const STREAM_POLL_INTERVAL_MS = 30_000
const PROFILE_ENRICHMENT_TIMEOUT_MS = 1_500
const FOLLOW_EVENTSUB_SCOPE = 'moderator:read:followers'
const MODERATORS_READ_SCOPE = 'moderator:read:moderators'
const CHATTERS_READ_SCOPE = 'moderator:read:chatters'
const MAX_CHATTERS = 200
const CHAT_READ_SCOPE = 'chat:read'
const CHAT_EDIT_SCOPE = 'chat:edit'
const OPTIONAL_TWITCH_SCOPES = [
  CHAT_READ_SCOPE,
  CHAT_EDIT_SCOPE,
  FOLLOW_EVENTSUB_SCOPE,
  'channel:read:subscriptions',
  'bits:read',
  'moderation:read',
  MODERATORS_READ_SCOPE,
  'moderator:read:chatters',
  'channel:read:vips',
  'channel:read:redemptions',
  'channel:read:goals',
  'channel:read:hype_train',
  'channel:read:polls',
  'channel:read:predictions'
]

type TwitchTokenInfo = {
  valid: boolean
  scopes: string[]
  expiresIn: number | null
  message?: string
}

export function normalizeTwitchChannelName(channel: string | undefined): string {
  return String(channel || '')
    .trim()
    .replace(/^[@#]+/, '')
    .trim()
    .toLowerCase()
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
  private mapper = new TwitchMapper()
  private lastIsLive = false

  constructor(private db?: Database) {
    super()
  }

  validateConfig(config: PlatformConfig): string | null {
    const c = config as TwitchConfig
    if (!normalizeTwitchChannelName(c.channel)) return 'Twitch channel name is required'
    if (!c.clientId?.trim()) return 'Twitch Client ID is required'
    if (!c.accessToken?.trim()) return 'Twitch access token is required'
    return null
  }

  protected async doConnect(config: PlatformConfig): Promise<void> {
    const twitchConfig = config as TwitchConfig
    const channelName = normalizeTwitchChannelName(twitchConfig.channel)
    await this.cleanup()

    const { RefreshingAuthProvider, StaticAuthProvider } = await import('@twurple/auth')
    const { ApiClient } = await import('@twurple/api')
    const { ChatClient } = await import('@twurple/chat')

    const tokenInfo = await this.loadTokenInfo(twitchConfig.accessToken!)
    this.tokenScopes = tokenInfo.scopes

    if (twitchConfig.refreshToken && twitchConfig.clientSecret) {
      this.authProvider = new RefreshingAuthProvider({ clientId: twitchConfig.clientId, clientSecret: twitchConfig.clientSecret })
      this.authProvider.onRefresh((userId: string, newTokenData: any) => {
        this.handleRefreshedToken(newTokenData)
      })
      this.authProvider.onRefreshFailure((userId: string, error: Error) => {
        this.handleError(error, 'token refresh', false)
      })

      // The third arg here is the user's *intents*, NOT OAuth scopes. The
      // ChatClient authenticates using whichever user holds the 'chat' intent —
      // previously we passed scope strings ('chat:read', …), so no user had the
      // 'chat' intent and the chat socket silently disconnected (→ no messages,
      // no TTS). addUserForToken also registers the user under their real
      // numeric Twitch ID (resolved from the token), which the user-context API
      // calls (getChannelFollowers, moderator backfill) require.
      const initialToken: any = {
        accessToken: twitchConfig.accessToken!,
        refreshToken: twitchConfig.refreshToken,
        expiresIn: tokenInfo.valid ? tokenInfo.expiresIn : 0,
        obtainmentTimestamp: Date.now()
      }
      if (tokenInfo.valid && this.tokenScopes.length > 0) {
        initialToken.scope = this.tokenScopes
      }

      try {
        await this.authProvider.addUserForToken(initialToken, ['chat'])
      } catch (err) {
        throw new Error(`Twitch access token could not be refreshed. Re-authorize Twitch and paste the new access/refresh tokens. ${this.formatErrorDetail(err)}`)
      }

      this.assertChatReadScope(tokenInfo)
    } else {
      if (!tokenInfo.valid) {
        throw new Error(`Twitch access token is expired or invalid and no refresh token is configured. Re-authorize Twitch or paste a fresh access token. ${tokenInfo.message || ''}`.trim())
      }
      this.assertChatReadScope(tokenInfo)
      this.authProvider = new StaticAuthProvider(twitchConfig.clientId, twitchConfig.accessToken!, this.tokenScopes)
    }

    this.apiClient = new ApiClient({ authProvider: this.authProvider })
    this.chatClient = new ChatClient({
      authProvider: this.authProvider,
      channels: [channelName],
      authIntents: ['chat'],
      requestMembershipEvents: true
    })

    this.chatClient.onSub((channel: string, user: string, subInfo: any) => this.emitEnriched(this.mapper.mapSubscription(user, subInfo, false)))
    this.chatClient.onResub((channel: string, user: string, subInfo: any) => this.emitEnriched(this.mapper.mapSubscription(user, subInfo, false)))
    this.chatClient.onSubGift((channel: string, user: string, subInfo: any) => this.emitEnriched(this.mapper.mapSubscription(subInfo.userName, subInfo, true)))
    this.chatClient.onRaid((channel: string, user: string, raidInfo: any) => this.emitEnriched(this.mapper.mapRaid(user, raidInfo)))
    this.chatClient.on('bits', (channel: string, user: string, message: string, msg: any) => this.emitEnriched(this.mapper.mapGiftEvent(user, msg, this.isFollowerCached(user))))
    
    this.chatClient.onMessage((channel: string, user: string, message: string, msg: any) => {
      console.log(`[twitch-connector] RECEIVED MESSAGE: [${channel}] ${user}: ${message}`)
      this.emitEnriched(this.mapper.mapChat(user, message, msg, this.isFollowerCached(user)))
    })

    this.chatClient.onAuthenticationSuccess(() => {
      console.log('[twitch-connector] ChatClient authenticated successfully.')
    })

    this.chatClient.onTokenFetchFailure((err: Error) => {
      this.handleError(err, 'chat token fetch', false)
    })

    this.chatClient.onJoin((channel: string, user: string) => {
      console.log(`[twitch-connector] Joined ${channel} as ${user}`)
    })

    this.chatClient.onJoinFailure((channel: string, reason: string) => {
      this.handleError(new Error(`Could not join ${channel}: ${reason}`), 'chat join', false)
    })

    this.chatClient.onDisconnect((manually: boolean) => { 
      console.warn(`[twitch-connector] ChatClient disconnected (manually: ${manually})`)
      if (!manually) this.onUnexpectedDisconnect('Twitch IRC disconnected') 
    })

    this.chatClient.onConnect(() => {
      console.log(`[twitch-connector] ChatClient CONNECTED to channels: ${channelName}`)
      this.setStatus('connected')
    })

    this.chatClient.onAuthenticationFailure((msg: string) => this.handleError(new Error(msg), 'authentication', false))

    try {
      console.log(`[twitch-connector] Connecting ChatClient...`)
      await this.chatClient.connect()
      console.log(`[twitch-connector] ChatClient connection attempt finished.`)
    } catch (err) {
      console.error(`[twitch-connector] ChatClient connection FAILED:`, err)
      throw err
    }

    try {
      console.log(`[twitch-connector] Fetching broadcaster ID for: ${channelName}`)
      const user = await this.apiClient.users.getUserByName(channelName)
      this.broadcasterId = user?.id ?? ''
      console.log(`[twitch-connector] Broadcaster ID: ${this.broadcasterId}`)
      
      // Authoritative follower count for Stats growth tracking
      await this.emitFollowerCountIfPermitted()
    } catch (err) {
      console.error(`[twitch-connector] FAILED to fetch broadcaster ID:`, err)
    }

    if (this.broadcasterId) {
      this.startStreamPolling()
      await this.tryStartEventSubTelemetry()
      if (this.hasTokenScope(FOLLOW_EVENTSUB_SCOPE)) void this.backfillFollowers()
      void this.backfillModerators()
    }
    console.log(`[twitch-connector] doConnect COMPLETED for channel: ${channelName}`)
  }

  protected async doDisconnect(): Promise<void> { await this.cleanup() }

  override getChatCapability(): PlatformChatCapability {
    if (!this.hasTokenScope(CHAT_READ_SCOPE)) {
      return { platform: 'twitch', canSend: false, reason: 'Missing chat:read scope' }
    }
    if (!this.hasTokenScope(CHAT_EDIT_SCOPE)) {
      return { platform: 'twitch', canSend: false, reason: 'Missing chat:edit scope' }
    }
    return (this.status === 'connected' && this.chatClient) ? { platform: 'twitch', canSend: true } : { platform: 'twitch', canSend: false, reason: 'Not connected' }
  }

  override async sendChatMessage(text: string): Promise<void> {
    if (!this.chatClient || this.status !== 'connected') throw new Error('Twitch not connected')
    await this.chatClient.say(normalizeTwitchChannelName((this.currentConfig as TwitchConfig).channel), text)
  }

  private async cleanup(): Promise<void> {
    if (this.streamPollTimer) clearInterval(this.streamPollTimer)
    if (this.eventSub) try { this.eventSub.stop() } catch {}
    if (this.chatClient) try { this.chatClient.quit() } catch {}
    this.chatClient = null; this.apiClient = null; this.authProvider = null; this.eventSub = null;
  }

  private async emitEnriched(event: AnyStreamEvent): Promise<void> {
    console.log(`[twitch-connector] ENRICHING ${event.type} event from ${event.platform}...`)
    try {
      const enriched = await withTimeout(
        this.enrichEventWithTwitchProfile(event as any),
        PROFILE_ENRICHMENT_TIMEOUT_MS,
        `Twitch profile enrichment timed out after ${PROFILE_ENRICHMENT_TIMEOUT_MS}ms`
      )
      console.log(`[twitch-connector] EMITTING enriched ${event.type} event`)
      this.emitEvent(enriched)
    } catch (err) {
      console.warn(`[twitch-connector] Profile enrichment skipped for ${event.type}:`, err)
      this.emitEvent(event)
    }
  }

  private async enrichEventWithTwitchProfile(event: any): Promise<any> {
    if (!event.user) return event
    
    const user = event.user
    const cached = this.userCache.get('twitch', user.id, user.username)
    if (cached) {
      user.profilePictureUrl ||= cached.profilePictureUrl
      user.isFollower = Boolean(user.isFollower || cached.isFollower)
    }
    
    // 1. Check local DB cache (if available)
    if (this.db) {
      const stats: any = this.db.getUserStat?.('twitch', user.username)
      if (stats?.profile_picture_url) {
        user.profilePictureUrl ||= stats.profile_picture_url
      }
      if (!user.isFollower && stats?.total_follows > 0) {
        user.isFollower = true
      }
    }

    // 2. Load public Twitch profile metadata for avatars/display names.
    if (!user.profilePictureUrl && this.apiClient?.users) {
      try {
        const twitchUser = user.id
          ? await this.apiClient.users.getUserById(user.id)
          : await this.apiClient.users.getUserByName(user.username)
        if (twitchUser) {
          user.profilePictureUrl = this.readTwitchProfilePictureUrl(twitchUser) || user.profilePictureUrl
          user.displayName = twitchUser.displayName || user.displayName
        }
      } catch (err) {
        console.warn(`[twitch-connector] Failed to fetch Twitch profile for ${user.username}:`, err)
      }
    }

    // 3. Check Helix if permitted and not already known
    if (!user.isFollower && this.apiClient && this.broadcasterId && this.hasTokenScope(FOLLOW_EVENTSUB_SCOPE)) {
      try {
        const followData = await this.apiClient.channels.getChannelFollowers(this.broadcasterId, user.id)
        if (followData.data.length > 0) {
          user.isFollower = true
        }
      } catch {}
    }

    // 4. Cache results
    this.userCache.set('twitch', user)
    return event
  }

  private readTwitchProfilePictureUrl(user: any): string | undefined {
    return user?.profilePictureUrl || user?.profile_image_url || user?.profileImageUrl || user?.profileImageURL || undefined
  }

  private isFollowerCached(username: string): boolean {
    return this.userCache.get('twitch', undefined, username)?.isFollower || false
  }

  private startStreamPolling(): void {
    const tick = async () => {
      if (!this.apiClient || !this.broadcasterId) return
      try {
        const stream = await this.apiClient.streams.getStreamByUserId(this.broadcasterId)
        if (stream) {
          const viewers = await this.fetchChatters()
          this.emitEvent({ id: randomUUID(), platform: 'twitch', timestamp: new Date(), type: 'viewer-count', count: stream.viewers || 0, viewers, raw: stream } as ViewerCountEvent)
          this.lastIsLive = true
        } else if (this.lastIsLive) {
          this.lastIsLive = false
          this.emitEvent({ id: randomUUID(), platform: 'twitch', timestamp: new Date(), type: 'stream-info', isLive: false, raw: null } as StreamInfoEvent)
        }
      } catch {}
    }
    this.streamPollTimer = setInterval(tick, STREAM_POLL_INTERVAL_MS)
    void tick()
  }

  /**
   * The list of users currently in chat (Twitch's `getChatters`), so the
   * "in stream" roster shows present Twitch viewers — not just ones who've
   * talked. The API only returns id/login/display name, so we enrich avatars
   * from our cache/DB when we have them; roles fill in once they chat (the
   * presence store keeps those sticky). No-ops without the chatters scope.
   */
  private async fetchChatters(): Promise<UserInfo[]> {
    if (!this.apiClient || !this.broadcasterId) return []
    if (!this.hasTokenScope(CHATTERS_READ_SCOPE)) return []
    try {
      const result = await this.apiClient.chat.getChatters(this.broadcasterId, this.broadcasterId, { limit: 100 })
      const chatters = (result?.data ?? []).slice(0, MAX_CHATTERS)
      return chatters.map((chatter: any) => this.mapChatterToUser(chatter))
    } catch (err) {
      console.warn('[twitch-connector] getChatters failed:', err)
      return []
    }
  }

  private mapChatterToUser(chatter: any): UserInfo {
    const username = String(chatter.userName || chatter.name || '').toLowerCase()
    const cached = this.userCache.get('twitch', chatter.userId, username)
    let profilePictureUrl = cached?.profilePictureUrl
    if (!profilePictureUrl && this.db) {
      const stat: any = this.db.getUserStat?.('twitch', username)
      profilePictureUrl = stat?.profile_picture_url || undefined
    }
    return {
      id: String(chatter.userId || ''),
      username,
      displayName: chatter.userDisplayName || chatter.displayName || username,
      profilePictureUrl,
      isModerator: false,
      isSubscriber: false,
      isVip: false,
      isFollower: false,
      isFanClubMember: false,
      isSuperFan: false,
      isTeamMember: false,
      badges: []
    }
  }

  private async tryStartEventSubTelemetry(): Promise<void> {
    if (!this.apiClient || !this.broadcasterId) return
    const { EventSubWsListener } = await import('@twurple/eventsub-ws')
    this.eventSub = new EventSubWsListener({ apiClient: this.apiClient })
    this.eventSub.start()
    if (this.hasTokenScope(FOLLOW_EVENTSUB_SCOPE)) {
      this.eventSub.onChannelFollow(this.broadcasterId, this.broadcasterId, (e: any) => {
        const event = this.mapper.mapFollow(e)
        this.userCache.set('twitch', event.user)
        this.emitEnriched(event)
      })
    }
  }

  private async emitFollowerCountIfPermitted(): Promise<void> {
    if (!this.apiClient || !this.broadcasterId) return
    if (!this.hasTokenScope(FOLLOW_EVENTSUB_SCOPE)) {
      console.log('[twitch-connector] Skipping follower-count telemetry; token is missing moderator:read:followers')
      return
    }

    const followers = await this.apiClient.channels.getChannelFollowers(this.broadcasterId)
    this.emitEvent({
      id: randomUUID(),
      platform: 'twitch',
      timestamp: new Date(),
      type: 'follower-count',
      count: followers.total || 0,
      raw: followers
    } as FollowerCountEvent)
  }

  private async backfillFollowers(): Promise<void> {
    if (!this.apiClient || !this.broadcasterId) return
    try {
      const iterator = this.apiClient.channels.getChannelFollowersPaginated(this.broadcasterId)
      for await (const follow of iterator) {
        this.userCache.set('twitch', { id: follow.userId, username: follow.userName, displayName: follow.userDisplayName, isFollower: true, isModerator: false, isSubscriber: false, isVip: false, badges: [] })
      }
    } catch {}
  }

  private async backfillModerators(): Promise<void> {
    if (!this.apiClient || !this.broadcasterId) return
    const hasModScope = this.hasTokenScope('moderation:read') || this.hasTokenScope(MODERATORS_READ_SCOPE)
    if (!hasModScope) {
      console.log(`[twitch-connector] Skipping moderator backfill: token lacks moderation:read or ${MODERATORS_READ_SCOPE}`)
      return
    }
    try {
      console.log('[twitch-connector] Fetching moderators list from Helix...')
      const iterator = this.apiClient.moderation.getModeratorsPaginated(this.broadcasterId)
      let count = 0
      for await (const mod of iterator) {
        if (this.db) {
          this.db.incrementUserStats({
            username: mod.userName,
            platform: 'twitch',
            platformUserId: mod.userId,
            displayName: mod.userDisplayName,
            isModerator: true
          })
        }
        count++
      }
      console.log(`[twitch-connector] Successfully backfilled ${count} moderators from Twitch API`)
    } catch (err) {
      console.warn('[twitch-connector] Failed to backfill moderators:', err)
    }
  }

  private hasTokenScope(scope: string): boolean { return this.tokenScopes.includes(scope) }
  private assertChatReadScope(tokenInfo?: TwitchTokenInfo): void {
    if (this.hasTokenScope(CHAT_READ_SCOPE)) return

    if (tokenInfo && !tokenInfo.valid) {
      throw new Error(`Twitch access token refreshed, but the refreshed token did not include chat:read. Re-authorize Twitch with chat:read enabled. ${tokenInfo.message || ''}`.trim())
    }

    throw new Error('Twitch token is missing chat:read. Reconnect Twitch with chat:read so chat messages can reach Chat Hub and TTS.')
  }

  private handleRefreshedToken(newTokenData: any): void {
    this.tokenScopes = this.normalizeScopes(newTokenData?.scope)
    this.emit('token-refresh', {
      platform: 'twitch',
      accessToken: newTokenData?.accessToken,
      refreshToken: newTokenData?.refreshToken,
      expiresIn: newTokenData?.expiresIn
    })
  }

  private async loadTokenInfo(token: string): Promise<TwitchTokenInfo> {
    try {
      const res = await fetch('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${token}` } })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) {
        return {
          valid: false,
          scopes: [],
          expiresIn: 0,
          message: typeof data?.message === 'string' ? data.message : `Twitch validation failed with ${res.status}`
        }
      }

      return {
        valid: true,
        scopes: this.normalizeScopes(data.scopes || data.scope),
        expiresIn: typeof data.expires_in === 'number' ? data.expires_in : null
      }
    } catch (err) {
      console.error(`[twitch-connector] FAILED to load token info:`, err)
      return { valid: false, scopes: [], expiresIn: 0, message: this.formatErrorDetail(err) }
    }
  }

  private normalizeScopes(scopes: unknown): string[] {
    if (Array.isArray(scopes)) return scopes.filter((scope): scope is string => typeof scope === 'string')
    if (typeof scopes === 'string') return scopes.split(/[\s,]+/).map((scope) => scope.trim()).filter(Boolean)
    return []
  }

  private formatErrorDetail(err: unknown): string {
    if (err instanceof Error && err.message) return `(${err.message})`
    if (typeof err === 'string' && err.trim()) return `(${err.trim()})`
    return ''
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null

  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs)
  })

  return Promise.race([
    promise.finally(() => {
      if (timeout) clearTimeout(timeout)
    }),
    timeoutPromise
  ])
}
