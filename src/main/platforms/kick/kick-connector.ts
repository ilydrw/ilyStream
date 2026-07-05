import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { randomUUID, verify as verifySignature } from 'crypto'
import { BaseConnector } from '../base-connector'
import { loadOptionalModule } from '../load-optional-module'
import { ensureKickEventSubscriptions } from './kick-api'
import {
  Platform,
  KickConfig,
  PlatformConfig,
  PlatformChatCapability,
  ChatEvent,
  Emote,
  SubscriptionEvent,
  FollowEvent,
  StreamInfoEvent,
  UserInfo
} from '../types'

const DEFAULT_WEBHOOK_PORT = 8792
const DEFAULT_WEBHOOK_PATH = '/kick/webhook'
const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024

const FALLBACK_KICK_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAq/+l1WnlRrGSolDMA+A8
6rAhMbQGmQ2SapVcGM3zq8ANXjnhDWocMqfWcTd95btDydITa10kDvHzw9WQOqp2
MZI7ZyrfzJuz5nhTPCiJwTwnEtWft7nV14BYRDHvlfqPUaZ+1KR4OCaO/wWIk/rQ
L/TjY0M70gse8rlBkbo2a8rKhu69RQTRsoaf4DVhDPEeSeI5jVrRDGAMGL3cGuyY
6CLKGdjVEM78g3JfYOvDU/RvfqD7L89TZ3iN94jrmWdGz34JNlEI5hqK8dd7C5EF
BEbZ5jgB8s8ReQV8H+MkuffjdAj3ajDDX3DOJMIut1lBrUVD1AaSrGCKHooWoL2e
twIDAQAB
-----END PUBLIC KEY-----`

interface KickWebhookHeaders {
  messageId: string
  signature: string
  timestamp: string
  eventType: string
  eventVersion: string
}

export class KickConnector extends BaseConnector {
  readonly platform: Platform = 'kick'
  private client: any = null
  private ws: any = null
  private channelId: number | null = null
  private webhookServer: Server | null = null
  private webhookPort = DEFAULT_WEBHOOK_PORT
  private webhookPath = DEFAULT_WEBHOOK_PATH
  private publicKeyCache: string | null = null
  private processedWebhookIds = new Set<string>()

  validateConfig(config: PlatformConfig): string | null {
    const c = config as KickConfig
    if (!c.channelName || c.channelName.trim().length === 0) {
      return 'Kick channel name is required'
    }
    return null
  }

  protected async doConnect(config: PlatformConfig): Promise<void> {
    const kickConfig = config as KickConfig
    const channelName = sanitizeKickChannelName(kickConfig.channelName)

    await this.cleanup()
    await this.startWebhookReceiver(kickConfig)
    this.ensureEventSubscriptions(kickConfig, channelName)

    if (kickConfig.legacySocket === true) {
      try {
        const KickJS = await loadOptionalModule('@retconned/kick-js')
        if (KickJS) {
          await this.connectViaKickJS(KickJS, channelName)
        } else {
          await this.connectViaPusher(channelName)
        }
      } catch (error) {
        console.warn(`[kick] Legacy socket fallback unavailable; webhook receiver remains active: ${formatError(error)}`)
      }
    }

    this.lastError = null
  }

  protected async doDisconnect(): Promise<void> {
    await this.cleanup()
  }

  override getChatCapability(): PlatformChatCapability {
    return {
      platform: 'kick',
      canSend: false,
      reason: 'Kick outbound chat requires OAuth chat:write and is not wired yet'
    }
  }

  /**
   * Best-effort, fire-and-forget re-subscribe on every connect. Kick event
   * subscriptions are keyed to the app + broadcaster; refreshing them here
   * removes the manual "Subscribe Events" click after restarts. Failures only
   * warn — the webhook receiver still works for any subscriptions that exist.
   */
  private ensureEventSubscriptions(config: KickConfig, channelName: string): void {
    const clientId = String(config.clientId || '').trim()
    const clientSecret = String(config.clientSecret || '').trim()
    const broadcasterUserId = String(config.broadcasterUserId || '').trim()
    if (!clientId || !clientSecret || (!broadcasterUserId && !channelName)) return

    void ensureKickEventSubscriptions({
      clientId,
      clientSecret,
      broadcasterUserId: broadcasterUserId || undefined,
      channelName
    }).then((result) => {
      const failed = result.subscriptions.filter((entry) => entry.error)
      if (failed.length > 0) {
        console.warn(`[kick] ${failed.length} event subscription(s) failed: ${failed.map((entry) => entry.name).join(', ')}`)
      } else {
        console.log(`[kick] Event subscriptions verified (${result.message || `${result.subscriptions.length} events`})`)
      }
    }).catch((error) => {
      console.warn(`[kick] Could not refresh event subscriptions: ${formatError(error)}`)
    })
  }

  private async startWebhookReceiver(config: KickConfig): Promise<void> {
    this.webhookPort = normalizeWebhookPort(config.webhookPort)
    this.webhookPath = normalizeWebhookPath(config.webhookPath)

    const server = createServer((req, res) => {
      void this.handleWebhookRequest(req, res).catch((error) => {
        console.error(`[kick] Webhook request failed: ${formatError(error)}`)
        sendText(res, 500, 'Webhook receiver error')
      })
    })

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const settle = (callback: () => void) => {
        if (settled) return
        settled = true
        server.off('error', onListenError)
        callback()
      }
      const onListenError = (error: Error) => settle(() => reject(error))
      server.once('error', onListenError)
      server.listen(this.webhookPort, '127.0.0.1', () => {
        const address = server.address()
        if (address && typeof address === 'object') this.webhookPort = address.port
        settle(resolve)
      })
    })

    server.on('error', (error) => {
      this.onRecoverableError(error, 'kick-webhook')
    })

    this.webhookServer = server
    console.log(`[kick] Webhook receiver listening on http://127.0.0.1:${this.webhookPort}${this.webhookPath}`)
  }

  private async handleWebhookRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`)

    if (req.method === 'OPTIONS') {
      sendText(res, 204, '')
      return
    }

    if (req.method === 'GET' && (url.pathname === this.webhookPath || url.pathname === '/kick/health')) {
      sendJson(res, 200, {
        ok: true,
        platform: 'kick',
        endpoint: `http://127.0.0.1:${this.webhookPort}${this.webhookPath}`,
        events: [
          'chat.message.sent',
          'channel.followed',
          'channel.subscription.new',
          'channel.subscription.renewal',
          'channel.subscription.gifts',
          'livestream.status.updated',
          'livestream.metadata.updated'
        ]
      })
      return
    }

    if (url.pathname !== this.webhookPath) {
      sendText(res, 404, 'Not found')
      return
    }

    if (req.method !== 'POST') {
      sendText(res, 405, 'Method not allowed')
      return
    }

    const body = await readRequestBody(req)
    const headers = extractKickWebhookHeaders(req)
    const isValid = await this.verifyWebhook(headers, body)
    if (!isValid) {
      sendText(res, 401, 'Invalid Kick webhook signature')
      return
    }

    const payload = parseWebhookPayload(body)
    if (!this.trackWebhookDelivery(headers, payload)) {
      sendText(res, 204, '')
      return
    }

    this.handleWebhookEvent(headers.eventType, payload, headers)
    sendText(res, 204, '')
  }

  private async verifyWebhook(headers: KickWebhookHeaders, body: Buffer): Promise<boolean> {
    if (!headers.messageId || !headers.signature || !headers.timestamp) {
      return process.env.ILYSTREAM_KICK_ALLOW_UNSIGNED_WEBHOOKS === 'true'
    }

    const publicKey = await this.getKickPublicKey()
    return verifyKickWebhookSignature(
      publicKey,
      headers.messageId,
      headers.timestamp,
      body,
      headers.signature
    )
  }

  private async getKickPublicKey(): Promise<string> {
    if (this.publicKeyCache) return this.publicKeyCache

    try {
      const response = await fetch('https://api.kick.com/public/v1/public-key')
      if (response.ok) {
        const json = (await response.json()) as {
          data?: { public_key?: string }
          public_key?: string
        }
        const key = json.data?.public_key || json.public_key
        if (key) {
          this.publicKeyCache = key
          return key
        }
      }
    } catch (error) {
      console.warn(`[kick] Could not fetch public webhook key; using bundled fallback: ${formatError(error)}`)
    }

    this.publicKeyCache = FALLBACK_KICK_PUBLIC_KEY
    return this.publicKeyCache
  }

  private trackWebhookDelivery(headers: KickWebhookHeaders, payload: unknown): boolean {
    const payloadRecord = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
    const eventId = headers.messageId || String(payloadRecord.message_id || payloadRecord.id || '')
    if (!eventId) return true
    if (this.processedWebhookIds.has(eventId)) return false

    this.processedWebhookIds.add(eventId)
    if (this.processedWebhookIds.size > 500) {
      const oldest = this.processedWebhookIds.values().next().value
      if (oldest) this.processedWebhookIds.delete(oldest)
    }
    return true
  }

  private handleWebhookEvent(eventType: string, payload: unknown, headers: KickWebhookHeaders): void {
    const data = unwrapWebhookPayload(payload)
    const resolvedType = resolveKickWebhookEventType(eventType, payload, data)

    switch (resolvedType) {
      case 'chat.message.sent':
        this.emitEvent(this.mapWebhookChat(data, headers))
        break
      case 'channel.followed':
        this.emitEvent(this.mapWebhookFollow(data))
        break
      case 'subscription.new':
      case 'channel.subscription.new':
      case 'subscription.renewal':
      case 'channel.subscription.renewal':
        this.emitEvent(this.mapWebhookSubscription(data, false))
        break
      case 'subscription.gifts':
      case 'channel.subscription.gifts': {
        const giftees = Array.isArray(data.giftees) ? data.giftees : []
        if (giftees.length === 0) {
          this.emitEvent(this.mapWebhookSubscription(data, true))
          break
        }
        giftees.forEach((giftee: unknown) => {
          this.emitEvent(this.mapWebhookSubscription({ ...data, giftee }, true))
        })
        break
      }
      case 'livestream.status.updated':
      case 'livestream.metadata.updated':
        this.emitEvent(this.mapStreamInfo(data))
        break
      default:
        console.warn(`[kick] Ignored webhook event "${resolvedType || 'unknown'}"`)
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
      this.handleLegacyDisconnect('Kick client disconnected')
    })

    this.client.on('error', (err: any) => {
      this.handleLegacyError(err, 'kick-js')
    })

    await this.client.connect()
  }

  /**
   * Optional legacy fallback: Connect directly via Kick's Pusher WebSocket.
   * Kick's official real-time chat path is webhook events; this is best-effort.
   */
  private async connectViaPusher(channelName: string): Promise<void> {
    const WebSocket = (await import('ws')).default

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
    
    if (!channelResponse.ok) {
      console.warn(`[kick] v2 API failed (${channelResponse.status}), trying v1...`)
      channelResponse = await fetch(`https://kick.com/api/v1/channels/${channelName}`, fetchOptions)
    }

    if (!channelResponse.ok) {
      const errorMsg = channelResponse.status === 403 
        ? 'Kick blocked the legacy socket lookup (403). Cloudflare protection is active.'
        : `Kick channel "${channelName}" not found (${channelResponse.status})`
      throw new Error(errorMsg)
    }

    const channelData = await (channelResponse as any).json()
    this.channelId = channelData.chatroom?.id || channelData.id || channelData.chatroom_id

    if (!this.channelId) {
      throw new Error(`Could not resolve chat room ID for channel "${channelName}"`)
    }

    const pusherKey = '32cbd69e4b950bf97679'
    const wsUrl = `wss://ws-us2.pusher.com/app/${pusherKey}?protocol=7&client=js&version=8.3.0&flash=false`

    this.ws = new WebSocket(wsUrl)

    this.ws.on('open', () => {
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
      this.handleLegacyDisconnect('Kick WebSocket closed')
    })

    this.ws.on('error', (err: any) => {
      this.handleLegacyError(err, 'kick-websocket')
    })

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const settle = (callback: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        this.ws?.off?.('message', onMessage)
        this.ws?.off?.('error', onError)
        this.ws?.off?.('close', onClose)
        callback()
      }
      const onMessage = (raw: any) => {
        try {
          const msg = JSON.parse(raw.toString())
          if (msg.event === 'pusher:connection_established') {
            settle(resolve)
          } else {
            settle(() => reject(new Error('Unexpected first message from Kick WebSocket')))
          }
        } catch (e) {
          settle(() => reject(e))
        }
      }
      const onError = (err: unknown) => settle(() => reject(err))
      const onClose = () => settle(() => reject(new Error('Kick WebSocket closed before connection established')))
      const timeout = setTimeout(() => {
        settle(() => reject(new Error('Kick WebSocket connection timeout')))
      }, 10_000)

      this.ws.once('message', onMessage)
      this.ws.once('error', onError)
      this.ws.once('close', onClose)
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
    if (this.webhookServer) {
      const server = this.webhookServer
      this.webhookServer = null
      await new Promise<void>((resolve) => {
        server.close(() => resolve())
      })
    }
    this.channelId = null
  }

  private handleLegacyDisconnect(reason: string): void {
    if (this.webhookServer) {
      console.warn(`[kick] ${reason}; webhook receiver remains active`)
      return
    }
    this.onUnexpectedDisconnect(reason)
  }

  private handleLegacyError(error: unknown, context: string): void {
    if (this.webhookServer) {
      console.warn(`[kick] ${context}: ${formatError(error)}; webhook receiver remains active`)
      return
    }
    this.onRecoverableError(error, context)
  }

  private mapUser(data: any): UserInfo {
    const sender = data.sender || data.user || data
    const sourceBadges = Array.isArray(sender.identity?.badges)
      ? sender.identity.badges
      : Array.isArray(sender.badges)
        ? sender.badges
        : []
    const badges = sourceBadges.map((b: any) => ({
      id: String(b.type || b.id || b.text || ''),
      name: String(b.text || b.name || b.type || ''),
      imageUrl: b.image_url || b.imageUrl || undefined
    }))
    const badgeText = badges.map((badge: { id: string; name: string }) => `${badge.id} ${badge.name}`).join(' ').toLowerCase()
    const username = sender.username || sender.name || sender.slug || sender.channel_slug || ''
    const isSubscriber = Boolean(sender.is_subscriber || badgeText.includes('subscriber'))

    return {
      id: String(sender.user_id || sender.id || username || ''),
      username,
      displayName: sender.displayName || sender.display_name || sender.username || sender.name || sender.slug || 'Unknown',
      profilePictureUrl: sender.profile_picture || sender.profile_pic || sender.profilePicture || sender.profilePictureUrl || undefined,
      isModerator: Boolean(sender.is_moderator || badgeText.includes('moderator')),
      isSubscriber,
      isVip: Boolean(sender.is_broadcaster || sender.is_verified || badgeText.includes('broadcaster')),
      isFollower: Boolean(sender.is_follower),
      isFanClubMember: isSubscriber,
      isTeamMember: Boolean(sender.is_staff || badgeText.includes('staff') || badgeText.includes('team')),
      badges
    }
  }

  private mapWebhookChat(data: any, headers: KickWebhookHeaders): ChatEvent {
    const reply = data.replies_to || data.reply_to
    const message = firstNonEmptyString(data.content, data.message, data.text)
    return {
      id: String(data.message_id || data.messageId || data.id || headers.messageId || randomUUID()),
      platform: 'kick',
      timestamp: new Date(data.created_at || data.createdAt || data.timestamp || headers.timestamp || Date.now()),
      type: 'chat',
      raw: data,
      user: this.mapUser(data.sender || data),
      message,
      emotes: extractKickEmotes(message, data),
      isReply: Boolean(reply?.message_id),
      replyToUsername: reply?.sender?.username || reply?.sender?.name
    }
  }

  private mapWebhookSubscription(data: any, isGift: boolean): SubscriptionEvent {
    const userPayload = isGift ? (data.giftee || data.gifted_to || data.subscriber || data) : (data.subscriber || data)
    const createdAt = data.created_at || data.timestamp || Date.now()
    return {
      id: randomUUID(),
      platform: 'kick',
      timestamp: new Date(createdAt),
      type: 'subscription',
      raw: data,
      user: this.mapUser(userPayload),
      tier: 'Kick Sub',
      months: Number(data.duration || data.months || 1),
      isGift,
      gifterUser: isGift ? this.mapUser(data.gifter || data.sender || data) : undefined,
      monetaryValue: 499
    }
  }

  private mapWebhookFollow(data: any): FollowEvent {
    return {
      id: randomUUID(),
      platform: 'kick',
      timestamp: new Date(data.created_at || data.timestamp || Date.now()),
      type: 'follow',
      raw: data,
      user: this.mapUser(data.follower || data.user || data)
    }
  }

  private mapStreamInfo(data: any): StreamInfoEvent {
    const metadata = data.metadata || data
    const category = metadata.category || data.category
    return {
      id: randomUUID(),
      platform: 'kick',
      timestamp: new Date(data.created_at || data.updated_at || Date.now()),
      type: 'stream-info',
      raw: data,
      isLive: Boolean(data.is_live ?? data.stream?.is_live ?? true),
      title: data.title || metadata.title || undefined,
      gameName: category?.name || undefined,
      gameId: category?.id ? String(category.id) : undefined,
      startedAt: data.started_at || data.stream?.start_time || undefined,
      thumbnailUrl: category?.thumbnail || undefined
    }
  }

  private mapChat(data: any): ChatEvent {
    const message = data.content || data.message || ''
    return {
      id: String(data.id || data.message_id || randomUUID()),
      platform: 'kick',
      timestamp: new Date(data.created_at || Date.now()),
      type: 'chat',
      raw: data,
      user: this.mapUser(data),
      message,
      emotes: extractKickEmotes(message, data)
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
      monetaryValue: 499
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

const KICK_EMOTE_TOKEN_RE = /\[emote:([^:\]]+):([^\]]*)\]/g

export function extractKickEmotes(message: string, data: any): Emote[] {
  const emotes = new Map<string, Emote>()

  const addEmote = (
    id: string,
    name: string,
    startIndex: number,
    endIndex: number,
    imageUrl?: string
  ) => {
    const normalizedId = String(id || '').trim()
    if (!normalizedId) return
    if (!Number.isFinite(startIndex) || !Number.isFinite(endIndex)) return
    if (startIndex < 0 || endIndex < startIndex || startIndex >= message.length) return

    const boundedEndIndex = Math.min(Math.floor(endIndex), message.length - 1)
    const boundedStartIndex = Math.floor(startIndex)
    const token = parseKickEmoteToken(message.slice(boundedStartIndex, boundedEndIndex + 1))
    const emoteName = (name || token?.name || normalizedId).trim()
    const key = `${normalizedId}:${boundedStartIndex}:${boundedEndIndex}`

    emotes.set(key, {
      id: normalizedId,
      name: emoteName,
      imageUrl: imageUrl || buildKickEmoteImageUrl(normalizedId),
      startIndex: boundedStartIndex,
      endIndex: boundedEndIndex
    })
  }

  for (const item of Array.isArray(data?.emotes) ? data.emotes : []) {
    const id = firstNonEmptyString(item?.emote_id, item?.emoteId, item?.id)
    if (!id) continue

    const rawName = firstNonEmptyString(item?.name, item?.text, item?.code)
    const imageUrl = firstNonEmptyString(item?.image_url, item?.imageUrl, item?.url)
    const positions = normalizeKickEmotePositions(item)

    for (const position of positions) {
      const start = firstFiniteNumber(position?.s, position?.start, position?.startIndex, position?.[0])
      const rawEnd = firstFiniteNumber(position?.e, position?.end, position?.endIndex, position?.[1])
      if (start === null || rawEnd === null) continue

      const end = rawName && rawEnd - start === rawName.length ? rawEnd - 1 : rawEnd
      addEmote(id, rawName, start, end, imageUrl)
    }
  }

  KICK_EMOTE_TOKEN_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = KICK_EMOTE_TOKEN_RE.exec(message)) !== null) {
    addEmote(match[1], match[2], match.index, match.index + match[0].length - 1)
  }

  return Array.from(emotes.values()).sort((a, b) => a.startIndex - b.startIndex)
}

export function buildKickEmoteImageUrl(id: string): string {
  return `https://files.kick.com/emotes/${encodeURIComponent(id)}/fullsize`
}

export function sanitizeKickChannelName(value: string): string {
  let channelName = (value || '').trim()
  if (channelName.includes('kick.com/')) {
    channelName = channelName.split('kick.com/').pop()?.split(/[?#/]/)[0] || channelName
  }
  return channelName.startsWith('@') ? channelName.slice(1) : channelName
}

export function normalizeWebhookPath(value: unknown): string {
  const path = String(value || DEFAULT_WEBHOOK_PATH).trim() || DEFAULT_WEBHOOK_PATH
  return path.startsWith('/') ? path : `/${path}`
}

export function normalizeWebhookPort(value: unknown): number {
  const port = Number(value)
  if (!Number.isFinite(port) || port < 1 || port > 65535) return DEFAULT_WEBHOOK_PORT
  return Math.floor(port)
}

export function verifyKickWebhookSignature(
  publicKey: string,
  messageId: string,
  timestamp: string,
  body: Buffer,
  signature: string
): boolean {
  const signedPayload = Buffer.from(`${messageId}.${timestamp}.${body.toString('utf8')}`, 'utf8')
  return decodeSignature(signature).some((signatureBuffer) => {
    try {
      return verifySignature('RSA-SHA256', signedPayload, publicKey, signatureBuffer)
    } catch {
      return false
    }
  })
}

function decodeSignature(signature: string): Buffer[] {
  const trimmed = signature.trim()
  const candidates = [Buffer.from(trimmed, 'base64')]
  if (/^[a-f0-9]+$/i.test(trimmed) && trimmed.length % 2 === 0) {
    candidates.push(Buffer.from(trimmed, 'hex'))
  }
  return candidates
}

function extractKickWebhookHeaders(req: IncomingMessage): KickWebhookHeaders {
  return {
    messageId: getHeader(req, 'kick-event-message-id'),
    signature: getHeader(req, 'kick-event-signature'),
    timestamp: getHeader(req, 'kick-event-message-timestamp'),
    eventType: getHeader(req, 'kick-event-type'),
    eventVersion: getHeader(req, 'kick-event-version')
  }
}

function getHeader(req: IncomingMessage, name: string): string {
  const value = req.headers[name.toLowerCase()]
  if (Array.isArray(value)) return value[0] || ''
  return value || ''
}

function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0

    req.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.length
      if (size > MAX_WEBHOOK_BODY_BYTES) {
        reject(new Error('Kick webhook body exceeded 1MB'))
        req.destroy()
        return
      }
      chunks.push(buffer)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function parseWebhookPayload(body: Buffer): unknown {
  try {
    return JSON.parse(body.toString('utf8')) as unknown
  } catch {
    return {}
  }
}

function unwrapWebhookPayload(payload: unknown): any {
  if (!payload || typeof payload !== 'object') return {}
  const record = payload as Record<string, unknown>
  if (record.data && typeof record.data === 'object') return record.data
  if (record.payload && typeof record.payload === 'object') return record.payload
  return record
}

function resolveKickWebhookEventType(eventType: string, payload: unknown, data: unknown): string {
  const envelope = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
  const body = data && typeof data === 'object' ? data as Record<string, unknown> : {}
  const value = firstNonEmptyString(
    eventType,
    envelope.eventType,
    envelope.event_type,
    envelope.type,
    envelope.event,
    body.eventType,
    body.event_type,
    body.type,
    body.event
  ).toLowerCase()

  switch (value) {
    case 'channel.chat.message.sent':
    case 'chat_message.sent':
    case 'message.sent':
      return 'chat.message.sent'
    default:
      return value
  }
}

function normalizeKickEmotePositions(item: any): any[] {
  if (Array.isArray(item?.positions)) return item.positions
  if (item?.position && typeof item.position === 'object') return [item.position]
  if (
    item &&
    (item.s !== undefined ||
      item.e !== undefined ||
      item.start !== undefined ||
      item.end !== undefined ||
      item.startIndex !== undefined ||
      item.endIndex !== undefined)
  ) {
    return [item]
  }
  return []
}

function parseKickEmoteToken(value: string): { id: string; name: string } | null {
  const match = value.match(/^\[emote:([^:\]]+):([^\]]*)\]$/)
  if (!match) return null
  return { id: match[1], name: match[2] }
}

function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    if (value === null || value === undefined) continue
    const text = String(value).trim()
    if (text) return text
  }
  return ''
}

function firstFiniteNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue
    const number = Number(value)
    if (Number.isFinite(number)) return Math.floor(number)
  }
  return null
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.writableEnded) return
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function sendText(res: ServerResponse, status: number, body: string): void {
  if (res.writableEnded) return
  res.writeHead(status, { 'Content-Type': 'text/plain' })
  res.end(body)
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
