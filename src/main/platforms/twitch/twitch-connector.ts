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
const FOLLOW_EVENTSUB_SCOPE = 'moderator:read:followers'
const OPTIONAL_TWITCH_SCOPES = [
  FOLLOW_EVENTSUB_SCOPE,
  'channel:read:subscriptions',
  'channel:read:raids',
  'chat:read',
  'chat:edit',
  'channel:moderate'
]

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
    if (!c.channel?.trim()) return 'Twitch channel name is required'
    if (!c.clientId?.trim()) return 'Twitch Client ID is required'
    if (!c.accessToken?.trim()) return 'Twitch access token is required'
    return null
  }

  protected async doConnect(config: PlatformConfig): Promise<void> {
    const twitchConfig = config as TwitchConfig
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
    this.chatClient = new ChatClient({ authProvider: this.authProvider, channels: [twitchConfig.channel] })

    this.chatClient.onMessage((channel: string, user: string, message: string, msg: any) => this.emitEnriched(this.mapper.mapChat(user, message, msg, this.isFollowerCached(user))))
    this.chatClient.onSub((channel: string, user: string, subInfo: any) => this.emitEnriched(this.mapper.mapSubscription(user, subInfo, false)))
    this.chatClient.onResub((channel: string, user: string, subInfo: any) => this.emitEnriched(this.mapper.mapSubscription(user, subInfo, false)))
    this.chatClient.onSubGift((channel: string, user: string, subInfo: any) => this.emitEnriched(this.mapper.mapSubscription(subInfo.userName, subInfo, true)))
    this.chatClient.onRaid((channel: string, user: string, raidInfo: any) => this.emitEnriched(this.mapper.mapRaid(user, raidInfo)))
    this.chatClient.on('bits', (channel: string, user: string, message: string, msg: any) => this.emitEnriched(this.mapper.mapGiftEvent(user, msg, this.isFollowerCached(user))))
    
    this.chatClient.onDisconnect((manually: boolean) => { if (!manually) this.onUnexpectedDisconnect('Twitch IRC disconnected') })
    this.chatClient.onAuthenticationFailure((msg: string) => this.handleError(new Error(msg), 'authentication', false))

    await this.chatClient.connect()

    try {
      const user = await this.apiClient.users.getUserByName(twitchConfig.channel)
      this.broadcasterId = user?.id ?? ''
    } catch {}

    if (this.broadcasterId) {
      this.startStreamPolling()
      await this.tryStartEventSubTelemetry()
      if (this.hasTokenScope(FOLLOW_EVENTSUB_SCOPE)) void this.backfillFollowers()
    }
  }

  protected async doDisconnect(): Promise<void> { await this.cleanup() }

  override getChatCapability(): PlatformChatCapability {
    return (this.status === 'connected' && this.chatClient) ? { platform: 'twitch', canSend: true } : { platform: 'twitch', canSend: false, reason: 'Not connected' }
  }

  override async sendChatMessage(text: string): Promise<void> {
    if (!this.chatClient || this.status !== 'connected') throw new Error('Twitch not connected')
    await this.chatClient.say((this.currentConfig as TwitchConfig).channel, text)
  }

  private async cleanup(): Promise<void> {
    if (this.streamPollTimer) clearInterval(this.streamPollTimer)
    if (this.eventSub) try { this.eventSub.stop() } catch {}
    if (this.chatClient) try { this.chatClient.quit() } catch {}
    this.chatClient = null; this.apiClient = null; this.authProvider = null; this.eventSub = null;
  }

  private async emitEnriched(event: AnyStreamEvent): Promise<void> {
    const e = event as any
    if (e.user) e.user = await this.enrichUser(e.user)
    this.emitEvent(event)
  }

  private async enrichUser(user: any): Promise<any> {
    const cached = this.userCache.get('twitch', user.id, user.username)
    if (cached) return { ...user, ...cached, isFollower: user.isFollower || cached.isFollower }
    
    if (this.apiClient && (user.id || user.username)) {
      try {
        const helixUser = user.id ? await this.apiClient.users.getUserById(user.id) : await this.apiClient.users.getUserByName(user.username)
        if (helixUser) {
          const enriched = { ...user, displayName: helixUser.displayName, profilePictureUrl: helixUser.profilePictureUrl }
          this.userCache.set('twitch', enriched)
          return enriched
        }
      } catch {}
    }
    return user
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
      const data = await res.json()
      return data.scopes || data.scope || []
    } catch { return [] }
  }
}
