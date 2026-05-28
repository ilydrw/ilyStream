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
  StreamInfoEvent
} from '../types'
import { TwitchMapper } from '../mappers/twitch-mapper'

const STREAM_POLL_INTERVAL_MS = 30_000
const PROFILE_ENRICHMENT_TIMEOUT_MS = 1_500
const FOLLOW_EVENTSUB_SCOPE = 'moderator:read:followers'
const OPTIONAL_TWITCH_SCOPES = [
  FOLLOW_EVENTSUB_SCOPE,
  'channel:read:subscriptions',
  'channel:read:raids',
  'chat:read',
  'chat:edit',
  'channel:moderate'
]

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

    this.tokenScopes = await this.loadTokenScopes(twitchConfig.accessToken!)
    const userIntents = ['chat:read', 'chat:edit', ...OPTIONAL_TWITCH_SCOPES]

    if (twitchConfig.refreshToken && twitchConfig.clientSecret) {
      this.authProvider = new RefreshingAuthProvider({ clientId: twitchConfig.clientId, clientSecret: twitchConfig.clientSecret })
      this.authProvider.addUser('self', { accessToken: twitchConfig.accessToken!, refreshToken: twitchConfig.refreshToken, expiresIn: 0, obtainmentTimestamp: Date.now(), scope: this.tokenScopes }, userIntents)
      this.authProvider.onRefresh((userId: string, newTokenData: any) => {
        if (Array.isArray(newTokenData.scope)) this.tokenScopes = newTokenData.scope
        this.emit('token-refresh', { platform: 'twitch', accessToken: newTokenData.accessToken, refreshToken: newTokenData.refreshToken, expiresIn: newTokenData.expiresIn })
      })
    } else {
      this.authProvider = new StaticAuthProvider(twitchConfig.clientId, twitchConfig.accessToken!, this.tokenScopes)
    }

    this.apiClient = new ApiClient({ authProvider: this.authProvider })
    this.chatClient = new ChatClient({ authProvider: this.authProvider, channels: [channelName] })

    this.chatClient.onSub((channel: string, user: string, subInfo: any) => this.emitEnriched(this.mapper.mapSubscription(user, subInfo, false)))
    this.chatClient.onResub((channel: string, user: string, subInfo: any) => this.emitEnriched(this.mapper.mapSubscription(user, subInfo, false)))
    this.chatClient.onSubGift((channel: string, user: string, subInfo: any) => this.emitEnriched(this.mapper.mapSubscription(subInfo.userName, subInfo, true)))
    this.chatClient.onRaid((channel: string, user: string, raidInfo: any) => this.emitEnriched(this.mapper.mapRaid(user, raidInfo)))
    this.chatClient.on('bits', (channel: string, user: string, message: string, msg: any) => this.emitEnriched(this.mapper.mapGiftEvent(user, msg, this.isFollowerCached(user))))
    
    this.chatClient.onMessage((channel: string, user: string, message: string, msg: any) => {
      console.log(`[twitch-connector] RECEIVED MESSAGE: [${channel}] ${user}: ${message}`)
      this.emitEnriched(this.mapper.mapChat(user, message, msg, this.isFollowerCached(user)))
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
      if (this.broadcasterId) {
        const followers = await this.apiClient.channels.getChannelFollowers(this.broadcasterId)
        this.emitEvent({
          id: randomUUID(),
          platform: 'twitch',
          timestamp: new Date(),
          type: 'follower-count',
          count: followers.total || 0,
          raw: followers
        } as any)
      }
    } catch (err) {
      console.error(`[twitch-connector] FAILED to fetch broadcaster ID:`, err)
    }

    if (this.broadcasterId) {
      this.startStreamPolling()
      await this.tryStartEventSubTelemetry()
      if (this.hasTokenScope(FOLLOW_EVENTSUB_SCOPE)) void this.backfillFollowers()
    }
    console.log(`[twitch-connector] doConnect COMPLETED for channel: ${channelName}`)
  }

  protected async doDisconnect(): Promise<void> { await this.cleanup() }

  override getChatCapability(): PlatformChatCapability {
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
    
    // 1. Check local DB cache (if available)
    if (this.db && !user.isFollower) {
      const stats: any = this.db.getUserStat?.('twitch', user.username)
      if (stats && stats.total_follows > 0) {
        user.isFollower = true
      }
    }

    // 2. Check Helix if permitted and not already known
    if (!user.isFollower && this.apiClient && this.broadcasterId && this.hasTokenScope(FOLLOW_EVENTSUB_SCOPE)) {
      try {
        const followData = await this.apiClient.channels.getChannelFollowers(this.broadcasterId, user.id)
        if (followData.data.length > 0) {
          user.isFollower = true
        }
      } catch {}
    }

    // 3. Cache results
    this.userCache.set('twitch', { ...user, ...cached })
    return event
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
          this.emitEvent({ id: randomUUID(), platform: 'twitch', timestamp: new Date(), type: 'viewer-count', count: stream.viewers || 0, raw: stream } as ViewerCountEvent)
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

  private async backfillFollowers(): Promise<void> {
    if (!this.apiClient || !this.broadcasterId) return
    try {
      const iterator = this.apiClient.channels.getChannelFollowersPaginated(this.broadcasterId)
      for await (const follow of iterator) {
        this.userCache.set('twitch', { id: follow.userId, username: follow.userName, displayName: follow.userDisplayName, isFollower: true, isModerator: false, isSubscriber: false, isVip: false, badges: [] })
      }
    } catch {}
  }

  private hasTokenScope(scope: string): boolean { return this.tokenScopes.includes(scope) }
  private async loadTokenScopes(token: string): Promise<string[]> {
    try {
      const res = await fetch('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${token}` } })
      const data: any = await res.json()
      return data.scopes || data.scope || []
    } catch (err) { 
      console.error(`[twitch-connector] FAILED to load token scopes:`, err)
      return [] 
    }
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
