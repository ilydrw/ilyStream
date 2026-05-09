import { randomUUID } from 'crypto'
import { BaseConnector } from '../base-connector'
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

  validateConfig(config: PlatformConfig): string | null {
    const c = config as YouTubeConfig
    if (!c.apiKey || c.apiKey.trim().length === 0) {
      return 'YouTube API key is required'
    }
    return null
  }

  protected async doConnect(config: PlatformConfig): Promise<void> {
    const ytConfig = config as YouTubeConfig

    // Clean up any previous state
    this.stopPolling()
    this.nextPageToken = undefined
    this.consecutiveErrors = 0

    const { google } = await import('googleapis')

    this.youtube = google.youtube({
      version: 'v3',
      auth: ytConfig.apiKey
    })

    if (ytConfig.accessToken) {
      const oauthClient = new google.auth.OAuth2()
      oauthClient.setCredentials({
        access_token: ytConfig.accessToken,
        refresh_token: ytConfig.refreshToken
      })

      this.youtubeWrite = google.youtube({
        version: 'v3',
        auth: oauthClient
      })
    } else {
      this.youtubeWrite = null
    }

    // Use provided liveChatId or discover from active broadcast
    this.liveChatId = ytConfig.liveChatId || (await this.findActiveLiveChatId())

    if (!this.liveChatId) {
      throw new Error(
        'No active live stream found. Either provide a Live Chat ID or ensure you are streaming.'
      )
    }

    this.startPolling()
  }

  protected async doDisconnect(): Promise<void> {
    this.stopPolling()
    this.youtube = null
    this.youtubeWrite = null
    this.liveChatId = null
    this.nextPageToken = undefined
    this.consecutiveErrors = 0
  }

  private async findActiveLiveChatId(): Promise<string | null> {
    try {
      const response = await this.youtube.liveBroadcasts.list({
        part: ['snippet'],
        broadcastStatus: 'active',
        broadcastType: 'all'
      })

      const broadcast = response.data.items?.[0]
      return broadcast?.snippet?.liveChatId || null
    } catch (error) {
      console.warn('[youtube] Could not find active broadcast:', error)
      return null
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
    // Guard against overlapping polls
    if (this.isPolling || !this.youtube || !this.liveChatId) return
    this.isPolling = true

    try {
      const response = await this.youtube.liveChatMessages.list({
        liveChatId: this.liveChatId,
        part: ['snippet', 'authorDetails'],
        pageToken: this.nextPageToken
      })

      const data = response.data
      this.nextPageToken = data.nextPageToken
      this.pollIntervalMs = data.pollingIntervalMillis || 5000
      this.consecutiveErrors = 0

      for (const item of data.items || []) {
        const event = this.mapMessage(item)
        if (event) this.emitEvent(event)
      }
    } catch (error: any) {
      this.consecutiveErrors++

      const status = error?.response?.status || error?.code
      const message = error?.message || String(error)

      if (status === 401 || status === 403) {
        // Auth error or quota exceeded - not recoverable without new key
        console.error(`[youtube] Auth/quota error (${status}): ${message}`)
        this.isPolling = false
        this.handleError(error, 'poll-auth', false)
        return
      }

      if (status === 404) {
        // Live chat ended
        console.warn('[youtube] Live chat not found (stream may have ended)')
        this.isPolling = false
        this.handleError(new Error('Live chat ended'), 'poll-ended', false)
        return
      }

      console.warn(`[youtube] Poll error (attempt ${this.consecutiveErrors}): ${message}`)

      if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
        this.isPolling = false
        this.onRecoverableError(error, 'poll-max-errors')
        return
      }

      // Back off on errors
      this.pollIntervalMs = Math.min(this.pollIntervalMs * 1.5, 30_000)
    }

    this.isPolling = false

    // Schedule next poll
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
