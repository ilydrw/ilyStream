import { randomUUID } from 'crypto'
import { BaseConnector, ConnectorFatalError } from '../base-connector'
import {
  Platform,
  YouTubeConfig,
  PlatformConfig,
  PlatformChatCapability,
  ChatEvent,
  GiftEvent,
  SubscriptionEvent,
  UserInfo
} from '../types'

export class YouTubeConnector extends BaseConnector {
  readonly platform: Platform = 'youtube'
  private youtube: any = null
  private youtubeWrite: any = null
  private pollTimer: ReturnType<typeof setTimeout> | null = null
  private nextPageToken: string | undefined = undefined
  private liveChatId: string | null = null
  private pollIntervalMs = 5000
  private isPolling = false
  private consecutiveErrors = 0
  private maxConsecutiveErrors = 10
  private discoveryDisabled = false

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

  validateConfig(config: PlatformConfig): string | null {
    const c = config as YouTubeConfig
    const hasApiKey = Boolean(c.apiKey?.trim())
    const hasAccessToken = Boolean(c.accessToken?.trim())
    const hasRefreshFlow = Boolean(c.refreshToken?.trim() && c.clientId?.trim() && c.clientSecret?.trim())
    if (!hasApiKey && !hasAccessToken && !hasRefreshFlow) {
      return 'YouTube API key, OAuth access token, or OAuth refresh token with client credentials is required'
    }
    return null
  }

  protected async doConnect(config: PlatformConfig): Promise<void> {
    const ytConfig = config as YouTubeConfig

    // Clean up any previous state
    this.stopPolling()
    this.nextPageToken = undefined
    this.consecutiveErrors = 0
    this.discoveryDisabled = false

    if (this.sessionConnectTime === 0) {
      this.sessionConnectTime = Date.now()
    }

    const { google } = await import('googleapis')

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

      this.youtubeWrite = google.youtube({
        version: 'v3',
        auth: oauthClient
      })
    } else {
      this.youtubeWrite = null
    }

    this.youtube = google.youtube({
      version: 'v3',
      auth: oauthClient || ytConfig.apiKey
    })

    const providedLiveChatId = normalizeOptionalText(ytConfig.liveChatId)

    // Use provided liveChatId or discover from active broadcast
    this.liveChatId = providedLiveChatId || (await this.findActiveLiveChatId(ytConfig))

    if (!this.liveChatId) {
      const input = normalizeOptionalText(ytConfig.channelId)
      const isDirectVideo = input ? Boolean(parseYouTubeVideoId(input)) : false
      if (!isDirectVideo) {
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
    this.youtube = null
    this.youtubeWrite = null
    this.liveChatId = null
    this.nextPageToken = undefined
    this.consecutiveErrors = 0
    this.discoveryDisabled = false
    this.sessionConnectTime = 0
    this.processedMessageIds.clear()
    this.messageIdQueue = []
  }

  private async findActiveLiveChatId(config: YouTubeConfig): Promise<string | null> {
    try {
      const input = normalizeOptionalText(config.channelId)
      const directVideoId = input ? parseYouTubeVideoId(input) : null

      if (directVideoId) {
        return await this.findVideoLiveChatId(directVideoId)
      }

      const params: any = {
        part: ['snippet'],
        broadcastType: 'all'
      }

      // If we have OAuth, we can look at "mine"
      if (config.accessToken) {
        params.mine = true
        // Try active first, then upcoming
        const activeResponse = await this.youtube.liveBroadcasts.list({ ...params, broadcastStatus: 'active' })
        let chatId = activeResponse.data.items?.[0]?.snippet?.liveChatId
        
        if (!chatId) {
          const upcomingResponse = await this.youtube.liveBroadcasts.list({ ...params, broadcastStatus: 'upcoming' })
          chatId = upcomingResponse.data.items?.[0]?.snippet?.liveChatId
        }
        
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
      if (isYouTubeSearchQuotaExceeded(error)) {
        this.discoveryDisabled = true
        this.handleError(
          new Error('YouTube Search quota is exhausted for this Google Cloud project. Paste the Live Chat ID or exact live video URL to connect without search discovery.'),
          'discovery-quota',
          false
        )
      }
      return null
    }
  }

  private readVideoLiveChatId(video: any): string | null {
    const details = video?.liveStreamingDetails
    return details?.activeLiveChatId || details?.liveChatId || null
  }

  private async findVideoLiveChatId(videoId: string): Promise<string | null> {
    const videoRes = await this.youtube.videos.list({
      part: ['liveStreamingDetails'],
      id: [videoId]
    })

    return this.readVideoLiveChatId(videoRes.data.items?.[0]) || null
  }

  override getChatCapability(): PlatformChatCapability {
    if (this.status !== 'connected') {
      return {
        platform: 'youtube',
        canSend: false,
        reason: 'Connect YouTube to send chat'
      }
    }

    if (!this.liveChatId) {
      return {
        platform: 'youtube',
        canSend: false,
        reason: 'YouTube live chat ID is missing'
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
        if (!isDirectVideo) {
          // Prevent any search polling loops
          this.isPolling = false
          return
        }

        this.liveChatId = await this.findActiveLiveChatId(config)
        
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
        if (isYouTubeSearchQuotaExceeded(error)) {
          customError = new Error(
            'YouTube API quota exceeded. Please wait for the daily quota reset or check your Google Cloud Console project credentials.'
          )
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

function parseYouTubeVideoId(input: string): string | null {
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

function normalizeVideoId(value: string | null | undefined): string | null {
  if (!value) return null
  const decoded = decodeURIComponent(value).trim()
  return /^[A-Za-z0-9_-]{11}$/.test(decoded) ? decoded : null
}

function isYouTubeSearchQuotaExceeded(error: unknown): boolean {
  const err = error as any
  const status = err?.response?.status || err?.code
  const reason = err?.response?.data?.error?.errors?.[0]?.reason || err?.errors?.[0]?.reason
  const message = `${err?.message || ''} ${err?.response?.data?.error?.message || ''}`.toLowerCase()

  return (
    status === 403 &&
    (reason === 'quotaExceeded' ||
      reason === 'dailyLimitExceeded' ||
      reason === 'rateLimitExceeded' ||
      message.includes('quota exceeded') ||
      message.includes('search queries per day'))
  )
}
