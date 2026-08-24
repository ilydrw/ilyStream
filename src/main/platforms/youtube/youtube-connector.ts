import { randomUUID } from 'crypto'
import { BaseConnector, ConnectorFatalError } from '../base-connector'
import {
  AnyPlatformConfig,
  Platform,
  YouTubeConfig,
  PlatformConfig,
  PlatformChatCapability,
  ChatEvent,
  GiftEvent,
  SubscriptionEvent,
  UserInfo
} from '../types'
import {
  InnertubeLiveChat,
  InnertubeUnavailableError,
  buildChannelLivePath,
  resolveLiveVideoIdFromChannel,
  type InnertubeChatItem
} from './youtube-innertube'

const INNERTUBE_DISCOVERY_INTERVAL_MS = 30_000

export class YouTubeConnector extends BaseConnector {
  readonly platform: Platform = 'youtube'
  private youtube: any = null
  private youtubeOAuth: any = null
  private youtubeWrite: any = null
  private pollTimer: ReturnType<typeof setTimeout> | null = null
  private nextPageToken: string | undefined = undefined
  private liveChatId: string | null = null
  private pollIntervalMs = 5000
  private isPolling = false
  private consecutiveErrors = 0
  private maxConsecutiveErrors = 10
  private discoveryDisabled = false

  // Quota-free InnerTube chat reader (preferred). The Data API poller below is
  // the fallback and the write path.
  private innertubeChat: InnertubeLiveChat | null = null
  private innertubeTimer: ReturnType<typeof setTimeout> | null = null
  private innertubeVideoId: string | null = null
  private usingInnertube = false

  private sessionConnectTime = 0
  private processedMessageIds = new Set<string>()
  private messageIdQueue: string[] = []

  private trackMessageId(id: string): void {
    if (this.processedMessageIds.has(id)) return
    this.processedMessageIds.add(id)
    this.messageIdQueue.push(id)
    if (this.messageIdQueue.length > 2000) {
      const oldest = this.messageIdQueue.shift()
      if (oldest) {
        this.processedMessageIds.delete(oldest)
      }
    }
  }

  validateConfig(config: AnyPlatformConfig): string | null {
    const c = config as YouTubeConfig
    const hasApiKey = Boolean(c.apiKey?.trim())
    const hasAccessToken = Boolean(c.accessToken?.trim())
    const hasRefreshFlow = Boolean(c.refreshToken?.trim() && c.clientId?.trim() && c.clientSecret?.trim())
    // Reading chat via InnerTube needs no credentials at all — a channel
    // handle / URL / video URL is enough. Credentials only unlock sending.
    const hasInnertubeTarget = Boolean(
      normalizeOptionalText(c.channelId) &&
      (parseYouTubeVideoId(c.channelId!.trim()) || buildChannelLivePath(c.channelId!.trim()))
    )
    if (!hasApiKey && !hasAccessToken && !hasRefreshFlow && !hasInnertubeTarget) {
      return 'Enter your channel handle / URL (quota-free chat), or a YouTube API key / OAuth credentials'
    }
    return null
  }

  protected async doConnect(config: PlatformConfig): Promise<void> {
    const ytConfig = config as YouTubeConfig

    // Clean up any previous state
    this.stopPolling()
    this.stopInnertube()
    this.nextPageToken = undefined
    this.consecutiveErrors = 0
    this.discoveryDisabled = false

    if (this.sessionConnectTime === 0) {
      this.sessionConnectTime = Date.now()
    }

    const { google } = await import('./youtube-api')

    const accessToken = normalizeOptionalText(ytConfig.accessToken)
    const refreshToken = normalizeOptionalText(ytConfig.refreshToken)
    const clientId = normalizeOptionalText(ytConfig.clientId)
    const clientSecret = normalizeOptionalText(ytConfig.clientSecret)
    const canUseOAuth = Boolean(accessToken || (refreshToken && clientId && clientSecret))

    let oauthClient: any = null
    if (canUseOAuth) {
      oauthClient = new google.auth.OAuth2(clientId || undefined, clientSecret || undefined)
      oauthClient.setCredentials({
        access_token: accessToken || undefined,
        refresh_token: refreshToken || undefined
      })

      this.youtubeOAuth = google.youtube({
        version: 'v3',
        auth: oauthClient
      })
      this.youtubeWrite = this.youtubeOAuth
    } else {
      this.youtubeOAuth = null
      this.youtubeWrite = null
    }

    const apiKey = normalizeOptionalText(ytConfig.apiKey)
    this.youtube = google.youtube({
      version: 'v3',
      auth: apiKey || oauthClient
    })

    // Quota-free InnerTube path (default): read chat through the same endpoints
    // the YouTube watch page uses. The Data API is only forced when the user
    // pasted a raw live chat ID or explicitly disabled InnerTube.
    const configuredInput = classifyYouTubeLiveChatInput(ytConfig.liveChatId)
    const forceDataApi = ytConfig.disableInnertube === true || configuredInput?.type === 'liveChatId'

    if (!forceDataApi) {
      this.usingInnertube = true
      this.innertubeDirectVideoId = configuredInput?.type === 'video' ? configuredInput.videoId : null
      void this.runInnertube(ytConfig)
      return
    }

    const providedLiveChatId = await this.resolveConfiguredLiveChatId(ytConfig)

    // Use provided liveChatId or discover from active broadcast
    this.liveChatId = providedLiveChatId || (await this.findActiveLiveChatId(ytConfig))

    if (!this.liveChatId) {
      const input = normalizeOptionalText(ytConfig.channelId)
      const isDirectVideo = input ? Boolean(parseYouTubeVideoId(input)) : false
      // With OAuth we can cheaply re-poll for the user's own broadcast, so don't
      // hard-fail when they connect before going live — the poll loop picks it
      // up automatically once the stream starts.
      if (!isDirectVideo && !canUseOAuthConfig(ytConfig)) {
        throw new ConnectorFatalError(
          'Active YouTube broadcast not found for this channel. Make sure your stream is live, or paste the exact Live Video URL / Chat ID to connect.'
        )
      }
    }

    // Start polling - it will handle auto-discovery if liveChatId is missing
    this.startPolling()
  }

  protected async doDisconnect(): Promise<void> {
    this.stopPolling()
    this.stopInnertube()
    this.youtube = null
    this.youtubeOAuth = null
    this.youtubeWrite = null
    this.liveChatId = null
    this.nextPageToken = undefined
    this.consecutiveErrors = 0
    this.discoveryDisabled = false
    this.sessionConnectTime = 0
    this.processedMessageIds.clear()
    this.messageIdQueue = []
  }

  // --- InnerTube (quota-free) chat path -------------------------------------

  private innertubeDirectVideoId: string | null = null
  private ownChannelInputCache: string | null = null

  private stopInnertube(): void {
    this.usingInnertube = false
    if (this.innertubeTimer) {
      clearTimeout(this.innertubeTimer)
      this.innertubeTimer = null
    }
    this.innertubeChat?.stop()
    this.innertubeChat = null
    this.innertubeVideoId = null
    this.innertubeDirectVideoId = null
  }

  /**
   * One iteration of the InnerTube loop: find the live video, attach to its
   * chat, and hand off to the chat client. Re-schedules itself while waiting
   * for the streamer to go live and after a stream ends.
   */
  private async runInnertube(config: YouTubeConfig): Promise<void> {
    if (!this.usingInnertube) return

    try {
      const channelInput = normalizeOptionalText(config.channelId)
      const videoId =
        this.innertubeDirectVideoId ||
        (channelInput ? parseYouTubeVideoId(channelInput) : null) ||
        (await this.discoverInnertubeVideoId(config))

      if (!this.usingInnertube) return
      if (!videoId) {
        this.scheduleInnertubeRetry(config, INNERTUBE_DISCOVERY_INTERVAL_MS)
        return
      }

      const chat = new InnertubeLiveChat(
        videoId,
        (items) => this.handleInnertubeItems(items),
        (error) => {
          if (!this.usingInnertube) return
          console.warn(`[youtube] InnerTube chat detached: ${error.message}`)
          this.innertubeChat = null
          this.innertubeVideoId = null
          this.scheduleInnertubeRetry(config, INNERTUBE_DISCOVERY_INTERVAL_MS)
        }
      )
      await chat.start()

      if (!this.usingInnertube) {
        chat.stop()
        return
      }

      this.innertubeChat = chat
      this.innertubeVideoId = videoId
      console.log(`[youtube] Reading live chat via InnerTube for video ${videoId} — zero API quota used.`)

      // Sending still goes through the Data API, which needs the liveChatId.
      // One videos.list call (~1 unit) unlocks it; reading stays quota-free.
      void this.resolveWriteLiveChatId(videoId)
    } catch (error) {
      if (!this.usingInnertube) return

      if (error instanceof InnertubeUnavailableError && this.hasDataApiCredentials(config)) {
        console.warn(`[youtube] InnerTube unavailable (${error.message}) — falling back to Data API polling.`)
        this.stopInnertube()
        this.startPolling()
        return
      }

      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[youtube] InnerTube attach failed, retrying: ${message}`)
      this.scheduleInnertubeRetry(config, INNERTUBE_DISCOVERY_INTERVAL_MS)
    }
  }

  private scheduleInnertubeRetry(config: YouTubeConfig, delayMs: number): void {
    if (!this.usingInnertube) return
    if (this.innertubeTimer) clearTimeout(this.innertubeTimer)
    this.innertubeTimer = setTimeout(() => {
      void this.runInnertube(config)
    }, delayMs)
  }

  /**
   * Finds the live video id without spending quota. The channel's public
   * /live page is free to check as often as we like. When only OAuth is
   * configured (no channel input), the user's own channel handle is resolved
   * once (~1 unit) and cached, so the recurring not-live-yet checks are still
   * free page loads rather than API polls.
   */
  private async discoverInnertubeVideoId(config: YouTubeConfig): Promise<string | null> {
    const channelInput = normalizeOptionalText(config.channelId)
    if (channelInput && buildChannelLivePath(channelInput)) {
      // The scrape is authoritative: null just means "not live yet".
      return resolveLiveVideoIdFromChannel(channelInput)
    }

    if (canUseOAuthConfig(config) && this.youtubeOAuth) {
      try {
        const ownChannel = await this.resolveOwnChannelInput()
        if (ownChannel) return await resolveLiveVideoIdFromChannel(ownChannel)
        return await this.findOwnActiveVideoId()
      } catch (error) {
        console.warn('[youtube] OAuth broadcast lookup failed:', error instanceof Error ? error.message : error)
      }
    }

    return null
  }

  /** Handle (or channel id) of the signed-in user, cached after one API call. */
  private async resolveOwnChannelInput(): Promise<string | null> {
    if (this.ownChannelInputCache) return this.ownChannelInputCache
    try {
      const response = await this.youtubeOAuth.channels.list({
        part: ['id', 'snippet'],
        mine: true,
        maxResults: 1
      })
      const channel = response.data.items?.[0]
      const handle = normalizeOptionalText(channel?.snippet?.customUrl)
      const channelId = normalizeOptionalText(channel?.id)
      this.ownChannelInputCache = handle || channelId
      return this.ownChannelInputCache
    } catch (error) {
      console.warn('[youtube] Could not resolve own channel handle:', error instanceof Error ? error.message : error)
      return null
    }
  }

  /** The authenticated user's active/upcoming broadcast id (= video id). */
  private async findOwnActiveVideoId(): Promise<string | null> {
    for (const broadcastStatus of ['active', 'upcoming'] as const) {
      const response = await this.youtubeOAuth.liveBroadcasts.list({
        part: ['id', 'status'],
        broadcastType: 'all',
        maxResults: 5,
        mine: true,
        broadcastStatus
      })
      const videoId = normalizeOptionalText(response.data.items?.[0]?.id)
      if (videoId) return videoId
    }
    return null
  }

  private async resolveWriteLiveChatId(videoId: string): Promise<void> {
    if (this.liveChatId || !this.youtubeWrite) return
    try {
      this.liveChatId = await this.findVideoLiveChatId(videoId)
    } catch (error) {
      console.warn('[youtube] Could not resolve live chat ID for sending:', error instanceof Error ? error.message : error)
    }
  }

  private hasDataApiCredentials(config: YouTubeConfig): boolean {
    return Boolean(normalizeOptionalText(config.apiKey)) || canUseOAuthConfig(config)
  }

  private handleInnertubeItems(items: InnertubeChatItem[]): void {
    for (const item of items) {
      // The first InnerTube fetch replays recent chat history; skip anything
      // from before this session (with a small grace window).
      if (item.timestampMs < this.sessionConnectTime - 5000) continue
      if (this.processedMessageIds.has(item.id)) continue
      this.trackMessageId(item.id)

      const event = this.mapInnertubeItem(item)
      if (event) this.emitEvent(event)
    }
  }

  private mapInnertubeItem(item: InnertubeChatItem): ChatEvent | GiftEvent | SubscriptionEvent | null {
    const user: UserInfo = {
      id: item.authorChannelId,
      username: item.authorChannelId || item.authorName,
      displayName: item.authorName,
      profilePictureUrl: item.authorPhotoUrl,
      isModerator: item.isModerator,
      isSubscriber: item.isMember,
      isVip: item.isOwner,
      isFanClubMember: item.isMember,
      isTeamMember: item.isOwner,
      badges: [
        ...(item.isOwner ? [{ id: 'owner', name: 'Owner', imageUrl: undefined }] : []),
        ...(item.isModerator ? [{ id: 'moderator', name: 'Moderator', imageUrl: undefined }] : []),
        ...(item.isMember ? [{ id: 'member', name: 'Member', imageUrl: undefined }] : [])
      ]
    }
    const timestamp = new Date(item.timestampMs)

    switch (item.type) {
      case 'text':
        return {
          id: item.id,
          platform: 'youtube',
          timestamp,
          type: 'chat',
          raw: item.raw,
          user,
          message: item.message,
          emotes: item.emotes
        }

      case 'superchat':
        return {
          id: item.id,
          platform: 'youtube',
          timestamp,
          type: 'gift',
          raw: item.raw,
          user,
          giftName: 'Super Chat',
          giftId: 'superchat',
          giftCount: 1,
          monetaryValue: item.purchaseAmountCents || 0,
          isCombo: false
        }

      case 'supersticker':
        return {
          id: item.id,
          platform: 'youtube',
          timestamp,
          type: 'gift',
          raw: item.raw,
          user,
          giftName: item.stickerAltText || 'Super Sticker',
          giftId: 'supersticker',
          giftCount: 1,
          monetaryValue: item.purchaseAmountCents || 0,
          isCombo: false
        }

      case 'membership':
        return {
          id: item.id,
          platform: 'youtube',
          timestamp,
          type: 'subscription',
          raw: item.raw,
          user,
          tier: 'member',
          months: 1,
          message: item.message || undefined,
          isGift: false,
          monetaryValue: 499
        }

      case 'membership-gift':
        return {
          id: item.id,
          platform: 'youtube',
          timestamp,
          type: 'subscription',
          raw: item.raw,
          user,
          tier: 'member',
          months: 1,
          isGift: true,
          gifterUser: user,
          monetaryValue: 499
        }

      default:
        return null
    }
  }

  private async findActiveLiveChatId(config: YouTubeConfig): Promise<string | null> {
    try {
      const input = normalizeOptionalText(config.channelId)
      const directVideoId = input ? parseYouTubeVideoId(input) : null

      if (directVideoId) {
        return await this.findVideoLiveChatId(directVideoId)
      }

      // If we have OAuth, we can look at "mine" — the cheap, quota-free way to
      // find the streamer's own active broadcast (what StreamElements /
      // Streamlabs do). Allowed whenever we have usable OAuth credentials, not
      // just a live accessToken: after an app restart the stored access token is
      // stale/empty but the refresh token + client credentials still authorize
      // the request (googleapis auto-refreshes), so discovery keeps working.
      if (canUseOAuthConfig(config)) {
        const chatId = await this.findOwnActiveLiveChatId()
        if (chatId) return chatId
      }

      if (input) {
        let channelInput = input
        let channelId: string | null = null

        // 1. Try to parse as a YouTube URL
        try {
          if (channelInput.includes('youtube.com/')) {
            const url = new URL(channelInput.startsWith('http') ? channelInput : `https://${channelInput}`)

            if (url.pathname.startsWith('/channel/')) {
              channelId = url.pathname.split('/')[2]
            } else if (url.pathname.startsWith('/@')) {
              channelInput = url.pathname.split('/')[1]
            }
          }
        } catch (e) {}

        if (!channelId) {
          if (channelInput.startsWith('@') || !channelInput.startsWith('UC')) {
            const handle = channelInput.startsWith('@') ? channelInput : `@${channelInput}`
            const channelRes = await this.youtube.channels.list({
              part: ['id'],
              forHandle: handle
            })
            channelId = channelRes.data.items?.[0]?.id || null
          } else {
            channelId = channelInput
          }
        }

        if (!channelId) return null

        // 4. Search for either LIVE or UPCOMING videos
        // We try 'live' first, then 'upcoming'
        const searchForEvent = async (type: 'live' | 'upcoming') => {
          const res = await this.youtube.search.list({
            part: ['id'],
            channelId: channelId,
            eventType: type,
            type: 'video',
            maxResults: 1
          })
          return res.data.items?.[0]?.id?.videoId
        }

        let foundVideoId = await searchForEvent('live')
        if (!foundVideoId) {
          foundVideoId = await searchForEvent('upcoming')
        }

        if (!foundVideoId) return null

        const videoRes = await this.youtube.videos.list({
          part: ['liveStreamingDetails'],
          id: [foundVideoId]
        })

        return this.readVideoLiveChatId(videoRes.data.items?.[0]) || null
      }
      return null
    } catch (error) {
      console.warn('[youtube] Discovery error:', error)
      if (isYouTubeQuotaExceeded(error)) {
        this.discoveryDisabled = true
        this.handleError(
          new Error(getYouTubeQuotaExceededMessage(error)),
          'discovery-quota',
          false
        )
      }
      return null
    }
  }

  /**
   * Cheap, quota-safe lookup of the authenticated user's own active (or
   * upcoming) broadcast via `liveBroadcasts.list({ mine: true })`. Unlike
   * search-based discovery (100 quota units), this costs a handful of units and
   * is safe to poll, so it can run on a loop until the streamer goes live.
   */
  private async findOwnActiveLiveChatId(): Promise<string | null> {
    const client = this.youtubeOAuth || this.youtube
    const params: any = {
      part: ['id', 'snippet', 'status'],
      broadcastType: 'all',
      maxResults: 50,
      mine: true
    }

    for (const broadcastStatus of ['active', 'upcoming'] as const) {
      const response = await client.liveBroadcasts.list({ ...params, broadcastStatus })
      const items = response.data.items || []
      const chatId = await this.resolveBroadcastLiveChatId(items)
      if (chatId) return chatId

      if (items.length > 0) {
        console.info(
          `[youtube] Found ${items.length} ${broadcastStatus} owned broadcast(s), but none exposed a live chat ID yet.`
        )
      }
    }

    return null
  }

  private readVideoLiveChatId(video: any): string | null {
    const details = video?.liveStreamingDetails
    return details?.activeLiveChatId || details?.liveChatId || null
  }

  private async resolveBroadcastLiveChatId(broadcasts: any[]): Promise<string | null> {
    for (const broadcast of broadcasts) {
      const chatId = normalizeOptionalText(broadcast?.snippet?.liveChatId)
      if (chatId) return chatId
    }

    for (const broadcast of broadcasts) {
      const broadcastId = normalizeOptionalText(broadcast?.id)
      if (!broadcastId) continue

      try {
        const chatId = await this.findVideoLiveChatId(broadcastId)
        if (chatId) return chatId
      } catch (error) {
        console.warn(`[youtube] Could not read live chat from owned broadcast ${broadcastId}:`, error)
      }
    }

    return null
  }

  private async findVideoLiveChatId(videoId: string): Promise<string | null> {
    const videoRes = await this.youtube.videos.list({
      part: ['liveStreamingDetails'],
      id: [videoId]
    })

    return this.readVideoLiveChatId(videoRes.data.items?.[0]) || null
  }

  private async resolveConfiguredLiveChatId(config: YouTubeConfig): Promise<string | null> {
    const input = classifyYouTubeLiveChatInput(config.liveChatId)
    if (!input) return null

    if (input.type === 'liveChatId') return input.liveChatId

    try {
      const chatId = await this.findVideoLiveChatId(input.videoId)
      if (!chatId) {
        console.info('[youtube] Live Chat ID override contained a video URL, but that video has no active live chat yet.')
      }
      return chatId
    } catch (error) {
      if (isYouTubeQuotaExceeded(error)) {
        this.discoveryDisabled = true
        throw new ConnectorFatalError(getYouTubeQuotaExceededMessage(error))
      }
      throw error
    }
  }

  override getChatCapability(): PlatformChatCapability {
    if (this.status !== 'connected') {
      return {
        platform: 'youtube',
        canSend: false,
        reason: 'Connect YouTube to send chat'
      }
    }

    if (!this.liveChatId && !(this.usingInnertube && this.innertubeVideoId && this.youtubeWrite)) {
      return {
        platform: 'youtube',
        canSend: false,
        reason: this.usingInnertube
          ? 'Waiting for your YouTube stream to go live'
          : 'YouTube live chat ID is missing'
      }
    }

    const config = this.currentConfig as YouTubeConfig | null
    if (!config?.accessToken || !this.youtubeWrite) {
      return {
        platform: 'youtube',
        canSend: false,
        reason: 'YouTube sending requires an OAuth access token'
      }
    }

    return {
      platform: 'youtube',
      canSend: true
    }
  }

  override async sendChatMessage(text: string): Promise<void> {
    // InnerTube reads don't need the liveChatId, but sending does — resolve it
    // lazily on first send (one cheap videos.list call).
    if (!this.liveChatId && this.innertubeVideoId && this.youtubeWrite) {
      await this.resolveWriteLiveChatId(this.innertubeVideoId)
    }

    if (this.status !== 'connected' || !this.liveChatId) {
      throw new Error('YouTube is not connected to an active live chat')
    }

    if (!this.youtubeWrite) {
      throw new Error('YouTube sending requires an OAuth access token')
    }

    await this.youtubeWrite.liveChatMessages.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          liveChatId: this.liveChatId,
          type: 'textMessageEvent',
          textMessageDetails: {
            messageText: text
          }
        }
      }
    })
  }

  private startPolling(): void {
    this.isPolling = false
    this.poll()
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer)
      this.pollTimer = null
    }
    this.isPolling = false
  }

  private async poll(): Promise<void> {
    if (this.isPolling || !this.youtube) return
    this.isPolling = true

    try {
      // 1. If we don't have a liveChatId, try to find one
      if (!this.liveChatId && this.currentConfig) {
        if (this.discoveryDisabled) {
          this.isPolling = false
          return
        }

        const config = this.currentConfig as YouTubeConfig
        const input = normalizeOptionalText(config.channelId)
        const isDirectVideo = input ? Boolean(parseYouTubeVideoId(input)) : false
        const canUseOAuth = canUseOAuthConfig(config)
        // Only re-poll for discovery via the two cheap paths — a direct video
        // ID (videos.list) or OAuth's own-broadcast lookup (mine=true). Never
        // loop on search-by-handle, which burns 100 quota units per call.
        if (!isDirectVideo && !canUseOAuth) {
          this.isPolling = false
          return
        }

        try {
          this.liveChatId = isDirectVideo
            ? await this.findActiveLiveChatId(config)
            : await this.findOwnActiveLiveChatId()
        } catch (error) {
          console.warn('[youtube] Re-discovery error:', error)
          this.liveChatId = null
        }

        if (!this.liveChatId) {
          if (this.discoveryDisabled) {
            this.isPolling = false
            return
          }

          // Still no stream? Wait and try again later
          this.pollIntervalMs = 30_000 // Slow down video discovery to 30s to save quota
          this.isPolling = false
          this.pollTimer = setTimeout(() => this.poll(), this.pollIntervalMs)
          return
        }
        
        // Found it! Reset interval for chat polling
        this.pollIntervalMs = 5000
        this.consecutiveErrors = 0
      }

      // 2. Poll the chat messages
      const response = await this.youtube.liveChatMessages.list({
        liveChatId: this.liveChatId!,
        part: ['snippet', 'authorDetails'],
        pageToken: this.nextPageToken
      })

      const data = response.data
      this.nextPageToken = data.nextPageToken
      this.pollIntervalMs = data.pollingIntervalMillis || 5000
      this.consecutiveErrors = 0

      for (const item of data.items || []) {
        const publishedAtStr = item.snippet?.publishedAt
        if (publishedAtStr) {
          const publishedAt = new Date(publishedAtStr).getTime()
          // Skip messages published before we first connected (with a 5s grace window)
          if (publishedAt < this.sessionConnectTime - 5000) {
            continue
          }
        }

        const event = this.mapMessage(item)
        if (event) {
          if (this.processedMessageIds.has(event.id)) {
            continue
          }
          this.trackMessageId(event.id)
          this.emitEvent(event)
        }
      }
    } catch (error: any) {
      this.consecutiveErrors++

      const status = error?.response?.status || error?.code
      const message = error?.message || String(error)

      if (status === 401 || status === 403) {
        console.error(`[youtube] Auth/quota error (${status}): ${message}`)
        this.isPolling = false

        let customError = error
        if (isYouTubeQuotaExceeded(error)) {
          customError = new Error(getYouTubeQuotaExceededMessage(error))
        }
        this.handleError(customError, 'poll-auth', false)
        return
      }

      if (status === 404) {
        // Live chat ended or ID became invalid
        console.warn('[youtube] Live chat not found or ended')
        this.liveChatId = null // Trigger re-discovery
        this.nextPageToken = undefined
      }

      console.warn(`[youtube] Poll error (attempt ${this.consecutiveErrors}): ${message}`)

      if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
        this.isPolling = false
        this.onRecoverableError(error, 'poll-max-errors')
        return
      }

      this.pollIntervalMs = Math.min(this.pollIntervalMs * 1.5, 30_000)
    }

    this.isPolling = false
    this.pollTimer = setTimeout(() => this.poll(), this.pollIntervalMs)
  }

  private mapMessage(item: any): ChatEvent | GiftEvent | SubscriptionEvent | null {
    const type = item.snippet?.type
    const user = this.mapUser(item.authorDetails)
    const timestamp = new Date(item.snippet?.publishedAt || Date.now())

    switch (type) {
      case 'textMessageEvent':
        return {
          id: item.id || randomUUID(),
          platform: 'youtube',
          timestamp,
          type: 'chat',
          raw: item,
          user,
          message: item.snippet.textMessageDetails?.messageText || '',
          emotes: []
        }

      case 'superChatEvent': {
        const details = item.snippet.superChatDetails
        return {
          id: item.id || randomUUID(),
          platform: 'youtube',
          timestamp,
          type: 'gift',
          raw: item,
          user,
          giftName: 'Super Chat',
          giftId: 'superchat',
          giftCount: 1,
          // amountMicros is in micro-units of the currency
          monetaryValue: Math.round((details?.amountMicros || 0) / 10000),
          isCombo: false
        }
      }

      case 'superStickerEvent': {
        const details = item.snippet.superStickerDetails
        return {
          id: item.id || randomUUID(),
          platform: 'youtube',
          timestamp,
          type: 'gift',
          raw: item,
          user,
          giftName: details?.superStickerMetadata?.altText || 'Super Sticker',
          giftId: details?.superStickerMetadata?.stickerId || 'supersticker',
          giftCount: 1,
          monetaryValue: Math.round((details?.amountMicros || 0) / 10000),
          isCombo: false
        }
      }

      case 'memberMilestoneChatEvent':
        return {
          id: item.id || randomUUID(),
          platform: 'youtube',
          timestamp,
          type: 'subscription',
          raw: item,
          user,
          tier: 'member',
          months: item.snippet.memberMilestoneChatDetails?.memberMonth || 1,
          message: item.snippet.memberMilestoneChatDetails?.userComment,
          isGift: false,
          monetaryValue: 499
        }

      case 'newSponsorEvent':
        return {
          id: item.id || randomUUID(),
          platform: 'youtube',
          timestamp,
          type: 'subscription',
          raw: item,
          user,
          tier: 'member',
          months: 1,
          isGift: false,
          monetaryValue: 499
        }

      case 'membershipGiftingEvent':
        return {
          id: item.id || randomUUID(),
          platform: 'youtube',
          timestamp,
          type: 'subscription',
          raw: item,
          user,
          tier: 'member',
          months: 1,
          isGift: true,
          gifterUser: user,
          monetaryValue: 499
        }

      default:
        return null
    }
  }

  private mapUser(authorDetails: any): UserInfo {
    return {
      id: authorDetails?.channelId || '',
      username: authorDetails?.channelId || '',
      displayName: authorDetails?.displayName || 'Unknown',
      profilePictureUrl: authorDetails?.profileImageUrl || undefined,
      isModerator: authorDetails?.isChatModerator || false,
      isSubscriber: authorDetails?.isChatSponsor || false,
      isVip: authorDetails?.isChatOwner || false,
      isFanClubMember: authorDetails?.isChatSponsor || false,
      isTeamMember: authorDetails?.isChatOwner || false,
      badges: [
        ...(authorDetails?.isChatOwner ? [{ id: 'owner', name: 'Owner', imageUrl: undefined }] : []),
        ...(authorDetails?.isChatModerator ? [{ id: 'moderator', name: 'Moderator', imageUrl: undefined }] : []),
        ...(authorDetails?.isChatSponsor ? [{ id: 'member', name: 'Member', imageUrl: undefined }] : [])
      ]
    }
  }
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * True when the config carries OAuth credentials good enough to authorize
 * `mine=true` broadcast discovery — either a live access token, or a refresh
 * token paired with client credentials (googleapis refreshes the rest).
 */
function canUseOAuthConfig(config: YouTubeConfig): boolean {
  const hasAccessToken = Boolean(normalizeOptionalText(config.accessToken))
  const hasRefreshFlow = Boolean(
    normalizeOptionalText(config.refreshToken) &&
      normalizeOptionalText(config.clientId) &&
      normalizeOptionalText(config.clientSecret)
  )
  return hasAccessToken || hasRefreshFlow
}

export function parseYouTubeVideoId(input: string): string | null {
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input

  if (!input.includes('youtube.com/') && !input.includes('youtu.be/')) return null

  try {
    const url = new URL(input.startsWith('http') ? input : `https://${input}`)

    if (url.hostname === 'youtu.be') {
      return normalizeVideoId(url.pathname.slice(1))
    }

    const watchId = url.searchParams.get('v')
    if (watchId) return normalizeVideoId(watchId)

    const match = url.pathname.match(/^\/(?:live|shorts|embed)\/([^/?#]+)/)
    return match ? normalizeVideoId(match[1]) : null
  } catch {
    return null
  }
}

export function classifyYouTubeLiveChatInput(
  input: unknown
): { type: 'video'; videoId: string } | { type: 'liveChatId'; liveChatId: string } | null {
  const normalized = normalizeOptionalText(input)
  if (!normalized) return null

  const videoId = parseYouTubeVideoId(normalized)
  if (videoId) return { type: 'video', videoId }

  return { type: 'liveChatId', liveChatId: normalized }
}

function normalizeVideoId(value: string | null | undefined): string | null {
  if (!value) return null
  const decoded = decodeURIComponent(value).trim()
  return /^[A-Za-z0-9_-]{11}$/.test(decoded) ? decoded : null
}

export function isYouTubeSearchQuotaExceeded(error: unknown): boolean {
  return getYouTubeQuotaExceededType(error) === 'search'
}

export function isYouTubeQuotaExceeded(error: unknown): boolean {
  return getYouTubeQuotaExceededType(error) !== null
}

function getYouTubeQuotaExceededMessage(error: unknown): string {
  return getYouTubeQuotaExceededType(error) === 'search'
    ? 'YouTube Search quota is exhausted for this Google Cloud project. Paste the exact live video URL to avoid search discovery, or use a fresh Google Cloud project.'
    : 'YouTube Data API quota is exhausted for this Google Cloud project. Wait for the daily quota reset or use a fresh Google Cloud project/API key/OAuth client.'
}

function getYouTubeQuotaExceededType(error: unknown): 'search' | 'project' | null {
  const err = error as any
  const status = err?.response?.status || err?.code
  const reason = String(err?.response?.data?.error?.errors?.[0]?.reason || err?.errors?.[0]?.reason || '').toLowerCase()
  const message = normalizeYouTubeApiErrorText(`${err?.message || ''} ${err?.response?.data?.error?.message || ''}`)

  const isQuota =
    (status === 403 || status === 429) &&
    (reason.includes('quota') ||
      reason.includes('limit') ||
      (message.includes('quota') && (message.includes('exceed') || message.includes('limit'))))

  if (!isQuota) return null
  return message.includes('search queries per day') || message.includes('search.list') ? 'search' : 'project'
}

function normalizeYouTubeApiErrorText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}
