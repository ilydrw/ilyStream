import { randomUUID } from 'crypto'
import { net } from 'electron'
import { BaseConnector } from '../base-connector'
import { loadOptionalModule } from '../load-optional-module'
import {
  Platform,
  KickConfig,
  PlatformConfig,
  PlatformChatCapability,
  ChatEvent,
  SubscriptionEvent,
  FollowEvent,
  UserInfo
} from '../types'

export class KickConnector extends BaseConnector {
  readonly platform: Platform = 'kick'
  private client: any = null
  private ws: any = null
  private channelId: number | null = null

  validateConfig(config: PlatformConfig): string | null {
    const c = config as KickConfig
    if (!c.channelName || c.channelName.trim().length === 0) {
      return 'Kick channel name is required'
    }
    return null
  }

  protected async doConnect(config: PlatformConfig): Promise<void> {
    const kickConfig = config as KickConfig
    let channelName = (kickConfig.channelName || '').trim()

    // Sanitize: strip URL if they pasted it
    if (channelName.includes('kick.com/')) {
      channelName = channelName.split('kick.com/').pop()?.split(/[?#/]/)[0] || channelName
    }
    
    if (channelName.startsWith('@')) {
      channelName = channelName.slice(1)
    }

    // Clean up previous connection
    await this.cleanup()

    // Try kick-js first, fall back to raw WebSocket
    const KickJS = await loadOptionalModule('@retconned/kick-js')

    if (KickJS) {
      await this.connectViaKickJS(KickJS, channelName)
    } else {
      await this.connectViaPusher(channelName)
    }
  }

  protected async doDisconnect(): Promise<void> {
    await this.cleanup()
  }

  override getChatCapability(): PlatformChatCapability {
    return {
      platform: 'kick',
      canSend: false,
      reason: 'Kick outbound chat is not wired in this app yet'
    }
  }

  private async connectViaKickJS(KickJS: any, channelName: string): Promise<void> {
    const ClientClass = KickJS.default || KickJS.KickClient || KickJS
    this.client = new ClientClass(channelName)

    this.client.on('ChatMessage', (data: any) => {
      this.emitEvent(this.mapChat(data))
    })

    this.client.on('Subscription', (data: any) => {
      this.emitEvent(this.mapSubscription(data, false))
    })

    this.client.on('GiftedSubscription', (data: any) => {
      this.emitEvent(this.mapSubscription(data, true))
    })

    this.client.on('Follow', (data: any) => {
      this.emitEvent(this.mapFollow(data))
    })

    this.client.on('disconnect', () => {
      this.onUnexpectedDisconnect('Kick client disconnected')
    })

    this.client.on('error', (err: any) => {
      this.onRecoverableError(err, 'kick-js')
    })

    await this.client.connect()
  }

  /**
   * Fallback: Connect directly via Kick's Pusher WebSocket.
   * Kick uses Pusher protocol on ws-us2.pusher.com with key 32cbd69e4b950bf97679.
   */
  private async connectViaPusher(channelName: string): Promise<void> {
    const WebSocket = (await import('ws')).default

    // First, resolve channel ID from Kick's public API
    // We try v2 first, then v1, then fallback to a browser-like fetch
    const fetchOptions = {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://kick.com/',
        'Origin': 'https://kick.com',
        'Sec-Ch-Ua': '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    }

    let channelResponse = await fetch(`https://kick.com/api/v2/channels/${channelName}`, fetchOptions)
    
    // Fallback to v1 if v2 fails
    if (!channelResponse.ok) {
      console.warn(`[kick] v2 API failed (${channelResponse.status}), trying v1...`)
      channelResponse = await fetch(`https://kick.com/api/v1/channels/${channelName}`, fetchOptions)
    }

    if (!channelResponse.ok) {
      const errorMsg = channelResponse.status === 403 
        ? `Kick blocked the connection (403). Cloudflare protection is active. Please try again in a few minutes or verify your channel name.`
        : `Kick channel "${channelName}" not found (${channelResponse.status})`
      throw new Error(errorMsg)
    }

    const channelData = await (channelResponse as any).json()
    this.channelId = channelData.chatroom?.id || channelData.id || channelData.chatroom_id

    if (!this.channelId) {
      throw new Error(`Could not resolve chat room ID for channel "${channelName}"`)
    }

    // Connect to Pusher WebSocket
    const pusherKey = '32cbd69e4b950bf97679'
    const wsUrl = `wss://ws-us2.pusher.com/app/${pusherKey}?protocol=7&client=js&version=8.3.0&flash=false`

    this.ws = new WebSocket(wsUrl)

    this.ws.on('open', () => {
      // Subscribe to chatroom channel
      const subscribeMsg = JSON.stringify({
        event: 'pusher:subscribe',
        data: { channel: `chatrooms.${this.channelId}.v2` }
      })
      this.ws.send(subscribeMsg)
    })

    this.ws.on('message', (raw: any) => {
      try {
        const msg = JSON.parse(raw.toString())
        this.handlePusherMessage(msg)
      } catch {}
    })

    this.ws.on('close', () => {
      this.onUnexpectedDisconnect('Kick WebSocket closed')
    })

    this.ws.on('error', (err: any) => {
      this.onRecoverableError(err, 'kick-websocket')
    })

    // Wait for connection confirmation
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Kick WebSocket connection timeout')), 10_000)

      this.ws.once('message', (raw: any) => {
        clearTimeout(timeout)
        try {
          const msg = JSON.parse(raw.toString())
          if (msg.event === 'pusher:connection_established') {
            resolve()
          } else {
            reject(new Error('Unexpected first message from Kick WebSocket'))
          }
        } catch (e) {
          reject(e)
        }
      })
    })
  }

  private handlePusherMessage(msg: any): void {
    if (!msg.event || msg.event.startsWith('pusher:')) return

    let data: any
    try {
      data = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data
    } catch {
      return
    }

    switch (msg.event) {
      case 'App\\Events\\ChatMessageEvent':
        this.emitEvent(this.mapChat(data))
        break
      case 'App\\Events\\SubscriptionEvent':
        this.emitEvent(this.mapSubscription(data, false))
        break
      case 'App\\Events\\GiftedSubscriptionsEvent':
        this.emitEvent(this.mapSubscription(data, true))
        break
      case 'App\\Events\\FollowEvent':
        this.emitEvent(this.mapFollow(data))
        break
    }
  }

  private async cleanup(): Promise<void> {
    if (this.client) {
      try {
        this.client.removeAllListeners?.()
        await this.client.disconnect?.()
      } catch {}
      this.client = null
    }
    if (this.ws) {
      try {
        this.ws.removeAllListeners()
        this.ws.close()
      } catch {}
      this.ws = null
    }
    this.channelId = null
  }

  private mapUser(data: any): UserInfo {
    const sender = data.sender || data.user || data
    const badges = (sender.badges || []).map((b: any) => ({
      id: b.type || '',
      name: b.text || b.type || '',
      imageUrl: b.image_url || undefined
    }))
    const badgeText = badges.map((badge) => `${badge.id} ${badge.name}`).join(' ').toLowerCase()

    return {
      id: String(sender.id || sender.user_id || ''),
      username: sender.username || sender.slug || '',
      displayName: sender.username || sender.slug || 'Unknown',
      profilePictureUrl: sender.profile_pic || undefined,
      isModerator: sender.is_moderator || false,
      isSubscriber: sender.is_subscriber || false,
      isVip: sender.is_broadcaster || false,
      isFollower: Boolean(sender.is_follower),
      isFanClubMember: Boolean(sender.is_subscriber || badgeText.includes('subscriber')),
      isTeamMember: Boolean(sender.is_staff || badgeText.includes('staff') || badgeText.includes('team')),
      badges
    }
  }

  private mapChat(data: any): ChatEvent {
    return {
      id: String(data.id || randomUUID()),
      platform: 'kick',
      timestamp: new Date(data.created_at || Date.now()),
      type: 'chat',
      raw: data,
      user: this.mapUser(data),
      message: data.content || '',
      emotes: []
    }
  }

  private mapSubscription(data: any, isGift: boolean): SubscriptionEvent {
    return {
      id: randomUUID(),
      platform: 'kick',
      timestamp: new Date(),
      type: 'subscription',
      raw: data,
      user: this.mapUser(isGift ? (data.gifted_to || data) : data),
      tier: 'kick_sub',
      months: data.months || 1,
      isGift,
      gifterUser: isGift ? this.mapUser(data.gifter || data) : undefined,
      monetaryValue: 499 // $4.99
    }
  }

  private mapFollow(data: any): FollowEvent {
    return {
      id: randomUUID(),
      platform: 'kick',
      timestamp: new Date(),
      type: 'follow',
      raw: data,
      user: this.mapUser(data)
    }
  }
}
