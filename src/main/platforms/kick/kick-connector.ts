import { type IncomingMessage, type ServerResponse } from 'http'
import { randomUUID, verify as verifySignature } from 'crypto'
import { BaseConnector } from '../base-connector'
import { ensureKickEventSubscriptions } from './kick-api'
import {
  registerLoopbackRoute,
  type LoopbackRouteRegistration
} from '../loopback-route-server'
import {
  KICK_PUSHER_WS_URL,
  KICK_PUSHER_DEFAULT_ACTIVITY_TIMEOUT_S,
  buildKickSubscriptionChannels,
  normalizeKickPusherEventName,
  resolveKickChannel,
  resolveKickViewerCount,
  sanitizeKickSlug,
  type KickChannelInfo
} from './kick-realtime'
import {
  Platform,
  KickConfig,
  PlatformConfig,
  PlatformChatCapability,
  ChatEvent,
  Emote,
  SubscriptionEvent,
  FollowEvent,
  FollowerCountEvent,
  ViewerCountEvent,
  StreamInfoEvent,
  UserInfo
} from '../types'

const DEFAULT_WEBHOOK_PORT = 8792
const DEFAULT_WEBHOOK_PATH = '/kick/webhook'
const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024
const REALTIME_CONNECT_TIMEOUT_MS = 15_000
const REALTIME_PONG_GRACE_MS = 30_000
const VIEWER_POLL_INTERVAL_MS = 30_000
const VIEWER_POLL_MAX_BACKOFF_MS = 5 * 60_000
// A live chat socket should keep reconnecting through overnight blips rather
// than giving up after a handful of drops — mirrors the TikTok connector.
const KICK_MAX_RECONNECT_ATTEMPTS = 120

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

interface KickConnectorDependencies {
  resolveViewerCount?: typeof resolveKickViewerCount
}

export class KickConnector extends BaseConnector {
  readonly platform: Platform = 'kick'
  private readonly resolveViewerCount: typeof resolveKickViewerCount
  private ws: any = null
  private channelInfo: KickChannelInfo | null = null
  private connectionToken = 0
  private activityTimeoutMs = KICK_PUSHER_DEFAULT_ACTIVITY_TIMEOUT_S * 1000
  private activityTimer: ReturnType<typeof setTimeout> | null = null
  private pongTimer: ReturnType<typeof setTimeout> | null = null
  private viewerPollTimer: ReturnType<typeof setTimeout> | null = null
  private viewerPollFailures = 0
  private webhookRoute: LoopbackRouteRegistration | null = null
  private webhookPort = DEFAULT_WEBHOOK_PORT
  private webhookPath = DEFAULT_WEBHOOK_PATH
  private publicKeyCache: string | null = null
  private processedWebhookIds = new Set<string>()
  // Chat ids we've already emitted, so the (optional) official webhook path and
  // the real-time socket never surface the same message twice.
  private processedChatIds = new Set<string>()

  constructor(deps: KickConnectorDependencies = {}) {
    super()
    this.resolveViewerCount = deps.resolveViewerCount ?? resolveKickViewerCount
    this.setMaxReconnectAttempts(KICK_MAX_RECONNECT_ATTEMPTS)
  }

  validateConfig(config: PlatformConfig): string | null {
    const c = config as KickConfig
    if (!c.channelName || c.channelName.trim().length === 0) {
      return 'Kick channel name is required'
    }
    return null
  }

  protected async doConnect(config: PlatformConfig): Promise<void> {
    const kickConfig = config as KickConfig
    const channelName = sanitizeKickSlug(kickConfig.channelName)

    await this.cleanup()

    // Primary path: Kick's real-time Pusher socket. Outbound, no public endpoint
    // or OAuth required, and carries chat + subs + gifts + follows + live status.
    await this.connectRealtime(channelName)

    // Supplementary path: the official signed webhook API. Only useful when the
    // user has a public tunnel (webhookPublicUrl) — otherwise Kick's servers
    // can't reach a 127.0.0.1 receiver. Never the sole path anymore.
    if (String(kickConfig.webhookPublicUrl || '').trim()) {
      await this.startWebhookReceiver(kickConfig)
      this.ensureEventSubscriptions(kickConfig, channelName)
    }

    this.startViewerCountPolling(channelName)
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

  // --- Real-time Pusher transport (primary) ---

  private async connectRealtime(channelName: string): Promise<void> {
    const info = await resolveKickChannel(channelName)
    this.channelInfo = info
    console.log(
      `[kick] Resolved channel "${info.slug}" (channel ${info.channelId}, chatroom ${info.chatroomId}); connecting real-time socket…`
    )

    const WebSocket = (await import('ws')).default
    const token = ++this.connectionToken
    const ws = new WebSocket(KICK_PUSHER_WS_URL)
    this.ws = ws

    await new Promise<void>((resolve, reject) => {
      let established = false
      let settled = false

      const finishConnecting = () => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        resolve()
      }
      const failConnecting = (error: unknown) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        // Abandon this socket so a failed handshake can't leave an orphan open.
        this.clearActivityTimers()
        try {
          ws.removeAllListeners()
          ws.close()
        } catch {}
        reject(error instanceof Error ? error : new Error(formatError(error)))
      }

      const timeout = setTimeout(
        () => failConnecting(new Error(`Kick real-time connection timed out after ${REALTIME_CONNECT_TIMEOUT_MS / 1000}s`)),
        REALTIME_CONNECT_TIMEOUT_MS
      )

      ws.on('message', (raw: any) => {
        if (token !== this.connectionToken) return
        this.resetActivityTimer()

        const frame = safeParseFrame(raw)
        if (!frame) return

        if (frame.event === 'pusher:connection_established') {
          const data = coerceObject(safeParseData(frame.data))
          const activityTimeout = Number(data.activity_timeout)
          this.activityTimeoutMs =
            (Number.isFinite(activityTimeout) && activityTimeout > 0
              ? activityTimeout
              : KICK_PUSHER_DEFAULT_ACTIVITY_TIMEOUT_S) * 1000
          established = true
          this.subscribeChannels(ws, info)
          this.resetActivityTimer()
          console.log(`[kick] Real-time socket established for "${info.slug}"`)
          finishConnecting()
          return
        }

        if (frame.event === 'pusher:error') {
          const data = coerceObject(safeParseData(frame.data))
          console.warn(`[kick] Pusher error: ${data.message || JSON.stringify(data)}`)
          return
        }

        this.handleRealtimeFrame(frame)
      })

      ws.on('close', () => {
        if (token !== this.connectionToken) return
        this.clearActivityTimers()
        if (!established) {
          failConnecting(new Error('Kick real-time socket closed before the handshake completed'))
        } else {
          this.onUnexpectedDisconnect('Kick real-time socket closed')
        }
      })

      ws.on('error', (error: any) => {
        if (token !== this.connectionToken) return
        if (!established) {
          failConnecting(error)
        } else {
          this.clearActivityTimers()
          this.onRecoverableError(error, 'kick-realtime')
        }
      })
    })
  }

  private subscribeChannels(ws: any, info: KickChannelInfo): void {
    for (const channel of buildKickSubscriptionChannels(info)) {
      try {
        ws.send(JSON.stringify({ event: 'pusher:subscribe', data: { auth: '', channel } }))
      } catch (error) {
        console.warn(`[kick] Failed to subscribe to ${channel}: ${formatError(error)}`)
      }
    }
  }

  private handleRealtimeFrame(frame: { event: string; data?: unknown }): void {
    const event = frame.event || ''
    if (/^pusher(_internal)?:/.test(event)) {
      if (event === 'pusher:ping') {
        try {
          this.ws?.send(JSON.stringify({ event: 'pusher:pong', data: {} }))
        } catch {}
      }
      return
    }

    const data = coerceObject(safeParseData(frame.data))
    this.handleRealtimeEvent(normalizeKickPusherEventName(event), data)
  }

  private handleRealtimeEvent(eventName: string, data: any): void {
    switch (eventName) {
      case 'ChatMessageEvent':
        this.emitChatOnce(this.mapWebhookChat(data, syntheticChatHeaders(data)))
        break
      case 'SubscriptionEvent':
      case 'ChannelSubscriptionEvent':
        this.emitEvent(this.mapRealtimeSubscription(data))
        break
      case 'GiftedSubscriptionsEvent':
      case 'LuckyUsersWhoGotGiftSubscriptionsEvent': {
        const gifter = firstNonEmptyString(data.gifter_username, data.gifter?.username, data.sender?.username)
        for (const giftee of extractGifteeUsernames(data)) {
          this.emitEvent(this.mapRealtimeGiftSubscription(giftee, gifter, data))
        }
        break
      }
      case 'FollowersUpdated':
        this.emitFollowerUpdate(data)
        break
      case 'StreamerIsLive':
        this.emitEvent(this.mapRealtimeStreamInfo(data, true))
        break
      case 'StopStreamBroadcast':
        this.emitEvent(this.mapRealtimeStreamInfo(data, false))
        break
      // Chat moderation / presence frames we don't surface yet.
      case 'MessageDeletedEvent':
      case 'UserBannedEvent':
      case 'UserUnbannedEvent':
      case 'PinnedMessageCreatedEvent':
      case 'PinnedMessageDeletedEvent':
      case 'ChatMoveToSupportedChannelEvent':
      case 'PollUpdateEvent':
      case 'PollDeleteEvent':
        break
      default:
        console.log(`[kick] Ignored real-time event "${eventName}"`)
    }
  }

  private resetActivityTimer(): void {
    this.clearActivityTimers()
    this.activityTimer = setTimeout(() => {
      // No inbound activity within the window — nudge the server with a ping and
      // treat a missing reply as a dead socket so the base connector reconnects.
      try {
        this.ws?.send(JSON.stringify({ event: 'pusher:ping', data: {} }))
      } catch {}
      this.pongTimer = setTimeout(() => {
        this.onUnexpectedDisconnect('Kick real-time heartbeat timed out')
      }, REALTIME_PONG_GRACE_MS)
    }, this.activityTimeoutMs)
  }

  private clearActivityTimers(): void {
    if (this.activityTimer) {
      clearTimeout(this.activityTimer)
      this.activityTimer = null
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer)
      this.pongTimer = null
    }
  }

  // --- Best-effort viewer telemetry ---

  private startViewerCountPolling(channelName: string): void {
    this.stopViewerCountPolling()
    const token = this.connectionToken

    const tick = async () => {
      if (token !== this.connectionToken) return

      let nextDelay = VIEWER_POLL_INTERVAL_MS
      try {
        const snapshot = await this.resolveViewerCount(channelName)
        if (token !== this.connectionToken) return

        if (snapshot) {
          if (this.viewerPollFailures > 0) {
            console.log('[kick] Viewer-count polling recovered')
          }
          this.viewerPollFailures = 0
          this.emitEvent({
            id: randomUUID(),
            platform: 'kick',
            timestamp: new Date(),
            type: 'viewer-count',
            count: snapshot.count,
            raw: snapshot.raw
          } as ViewerCountEvent)
        } else {
          this.viewerPollFailures++
          if (this.viewerPollFailures === 1) {
            console.warn('[kick] Viewer-count lookup failed; real-time events remain connected')
          }
          nextDelay = Math.min(
            VIEWER_POLL_INTERVAL_MS * Math.pow(2, Math.min(this.viewerPollFailures, 4)),
            VIEWER_POLL_MAX_BACKOFF_MS
          )
        }
      } catch (error) {
        this.viewerPollFailures++
        if (this.viewerPollFailures === 1) {
          console.warn(`[kick] Viewer-count lookup failed; real-time events remain connected: ${formatError(error)}`)
        }
        nextDelay = Math.min(
          VIEWER_POLL_INTERVAL_MS * Math.pow(2, Math.min(this.viewerPollFailures, 4)),
          VIEWER_POLL_MAX_BACKOFF_MS
        )
      }

      if (token === this.connectionToken) {
        this.viewerPollTimer = setTimeout(() => void tick(), nextDelay)
      }
    }

    void tick()
  }

  private stopViewerCountPolling(): void {
    if (this.viewerPollTimer) {
      clearTimeout(this.viewerPollTimer)
      this.viewerPollTimer = null
    }
    this.viewerPollFailures = 0
  }

  // --- Official webhook receiver (supplementary; requires a public tunnel) ---

  /**
   * Best-effort, fire-and-forget re-subscribe on every connect. Kick event
   * subscriptions are keyed to the app + broadcaster; refreshing them here
   * removes the manual "Subscribe Events" click after restarts. Failures only
   * warn — the real-time socket already carries every event regardless.
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

    const route = await registerLoopbackRoute({
      port: this.webhookPort,
      paths: [this.webhookPath, '/kick/health'],
      handle: async (req, res) => {
        await this.handleWebhookRequest(req, res).catch((error) => {
          console.error(`[kick] Webhook request failed: ${formatError(error)}`)
          sendText(res, 500, 'Webhook receiver error')
        })
      },
      onError: (error) => {
        this.onRecoverableError(error, 'kick-webhook')
      }
    })

    this.webhookPort = route.port
    this.webhookRoute = route
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
        this.emitChatOnce(this.mapWebhookChat(data, headers))
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

  private async cleanup(): Promise<void> {
    // Invalidate any in-flight socket handlers so a stale close/error from the
    // previous connection can't fire reconnects against the new one.
    this.connectionToken++
    this.clearActivityTimers()
    this.stopViewerCountPolling()
    if (this.ws) {
      try {
        this.ws.removeAllListeners()
        this.ws.close()
      } catch {}
      this.ws = null
    }
    if (this.webhookRoute) {
      const route = this.webhookRoute
      this.webhookRoute = null
      await route.close()
    }
    this.channelInfo = null
  }

  /** Emits a chat event once, deduped by message id across socket + webhook. */
  private emitChatOnce(event: ChatEvent): void {
    const id = event.id
    if (id) {
      if (this.processedChatIds.has(id)) return
      this.processedChatIds.add(id)
      if (this.processedChatIds.size > 1000) {
        const oldest = this.processedChatIds.values().next().value
        if (oldest) this.processedChatIds.delete(oldest)
      }
    }
    this.emitEvent(event)
  }

  private emitFollowerUpdate(data: any): void {
    const count = firstFiniteNumber(data.followersCount, data.followers_count, data.count)
    if (count !== null) {
      this.emitEvent({
        id: randomUUID(),
        platform: 'kick',
        timestamp: new Date(data.created_at || Date.now()),
        type: 'follower-count',
        raw: data,
        count
      } as FollowerCountEvent)
    }

    // FollowersUpdated is usually a count-only broadcast; only surface an
    // individual follow when Kick actually names the follower.
    const username = firstNonEmptyString(data.username, data.user?.username, data.follower?.username)
    if (username && data.followed !== false) {
      this.emitEvent({
        id: randomUUID(),
        platform: 'kick',
        timestamp: new Date(data.created_at || Date.now()),
        type: 'follow',
        raw: data,
        user: this.mapUsernameUser(username)
      } as FollowEvent)
    }
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

  /** Minimal user for real-time events that only carry a username string. */
  private mapUsernameUser(username: unknown, opts: { isSubscriber?: boolean } = {}): UserInfo {
    const name = firstNonEmptyString(username) || 'Anonymous'
    return {
      id: name.toLowerCase(),
      username: name,
      displayName: name,
      isModerator: false,
      isSubscriber: Boolean(opts.isSubscriber),
      isVip: false,
      isFollower: false,
      isFanClubMember: Boolean(opts.isSubscriber),
      isTeamMember: false,
      badges: []
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

  private mapRealtimeSubscription(data: any): SubscriptionEvent {
    const username = firstNonEmptyString(data.username, data.user?.username, data.subscriber?.username)
    return {
      id: randomUUID(),
      platform: 'kick',
      timestamp: new Date(data.created_at || data.timestamp || Date.now()),
      type: 'subscription',
      raw: data,
      user: this.mapUsernameUser(username, { isSubscriber: true }),
      tier: 'Kick Sub',
      months: Number(data.months || data.duration || 1) || 1,
      isGift: false,
      monetaryValue: 499
    }
  }

  private mapRealtimeGiftSubscription(giftee: string, gifter: string, data: any): SubscriptionEvent {
    return {
      id: randomUUID(),
      platform: 'kick',
      timestamp: new Date(data.created_at || data.timestamp || Date.now()),
      type: 'subscription',
      raw: data,
      user: this.mapUsernameUser(giftee, { isSubscriber: true }),
      tier: 'Kick Sub',
      months: 1,
      isGift: true,
      gifterUser: gifter ? this.mapUsernameUser(gifter) : undefined,
      monetaryValue: 499
    }
  }

  private mapRealtimeStreamInfo(data: any, isLive: boolean): StreamInfoEvent {
    const livestream = data.livestream || data
    const category = Array.isArray(livestream.categories) ? livestream.categories[0] : livestream.category
    return {
      id: randomUUID(),
      platform: 'kick',
      timestamp: new Date(livestream.created_at || data.created_at || Date.now()),
      type: 'stream-info',
      raw: data,
      isLive,
      title: firstNonEmptyString(livestream.session_title, livestream.title, data.title) || undefined,
      gameName: category?.name || undefined,
      gameId: category?.id ? String(category.id) : undefined,
      startedAt: livestream.created_at || livestream.start_time || undefined,
      thumbnailUrl: category?.thumbnail || livestream.thumbnail?.url || undefined
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
  return sanitizeKickSlug(value)
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

/** Builds webhook-shaped headers so real-time chat reuses the same mapper. */
function syntheticChatHeaders(data: any): KickWebhookHeaders {
  return {
    messageId: firstNonEmptyString(data?.id, data?.message_id),
    signature: '',
    timestamp: firstNonEmptyString(data?.created_at, data?.timestamp),
    eventType: 'chat.message.sent',
    eventVersion: '1'
  }
}

/** Pulls the list of gifted usernames out of the various gift-sub payloads. */
export function extractGifteeUsernames(data: any): string[] {
  const candidates = [
    data?.gifted_usernames,
    data?.usernames,
    data?.giftees,
    data?.gifted_to
  ]
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      return candidate
        .map((entry) => firstNonEmptyString(typeof entry === 'string' ? entry : entry?.username, entry?.user?.username))
        .filter((name): name is string => name.length > 0)
    }
  }
  const single = firstNonEmptyString(data?.username, data?.giftee?.username)
  return single ? [single] : []
}

function safeParseFrame(raw: any): { event: string; data?: unknown } | null {
  try {
    const parsed = JSON.parse(raw.toString())
    if (parsed && typeof parsed === 'object' && typeof parsed.event === 'string') {
      return parsed as { event: string; data?: unknown }
    }
  } catch {}
  return null
}

function safeParseData(data: unknown): unknown {
  if (typeof data !== 'string') return data
  try {
    return JSON.parse(data)
  } catch {
    return {}
  }
}

function coerceObject(value: unknown): any {
  return value && typeof value === 'object' ? value : {}
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
