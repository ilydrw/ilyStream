// Unified event types - all platform connectors map to these

export type Platform =
  | 'tiktok'
  | 'twitch'
  | 'youtube'
  | 'kick'
  | 'x'
  | 'discord'
  | 'facebook'
  | 'instagram'
  | 'restream'
  | 'linkedin'
  | 'telegram'

export type EventType =
  | 'chat'
  | 'gift'
  | 'subscription'
  | 'follow'
  | 'raid'
  | 'like'
  | 'share'
  | 'join'
  | 'viewer-count'
  | 'follower-count'
  | 'stream-info'

export interface UserInfo {
  id: string
  username: string
  displayName: string
  profilePictureUrl?: string
  isModerator: boolean
  isSubscriber: boolean
  isVip: boolean
  isFollower?: boolean
  isFanClubMember?: boolean
  isTeamMember?: boolean
  badges: Badge[]
}

export interface Badge {
  id: string
  name: string
  imageUrl?: string
}

export interface Emote {
  id: string
  name: string
  imageUrl: string
  startIndex: number
  endIndex: number
}

// --- Base event ---

export interface StreamEvent {
  id: string
  platform: Platform
  timestamp: Date
  type: EventType
  raw: unknown
}

// --- Specific events ---

export interface ChatEvent extends StreamEvent {
  type: 'chat'
  user: UserInfo
  message: string
  emotes: Emote[]
  isReply?: boolean
  replyToUsername?: string
}

export interface GiftEvent extends StreamEvent {
  type: 'gift'
  user: UserInfo
  giftName: string
  giftId: string
  giftCount: number
  giftImageUrl?: string
  /** Value in USD cents */
  monetaryValue: number
  isCombo: boolean
}

export interface SubscriptionEvent extends StreamEvent {
  type: 'subscription'
  user: UserInfo
  tier: string
  months: number
  message?: string
  isGift: boolean
  gifterUser?: UserInfo
  /** Value in USD cents */
  monetaryValue: number
}

export interface FollowEvent extends StreamEvent {
  type: 'follow'
  user: UserInfo
}

export interface RaidEvent extends StreamEvent {
  type: 'raid'
  user: UserInfo
  viewerCount: number
}

export interface LikeEvent extends StreamEvent {
  type: 'like'
  user: UserInfo
  likeCount: number
  totalLikes: number
}

export interface ShareEvent extends StreamEvent {
  type: 'share'
  user: UserInfo
}

export interface JoinEvent extends StreamEvent {
  type: 'join'
  user: UserInfo
}

export interface ViewerCountEvent extends StreamEvent {
  type: 'viewer-count'
  count: number
}

export interface FollowerCountEvent extends StreamEvent {
  type: 'follower-count'
  count: number
}

/**
 * Periodic broadcast of the channel's "live snapshot" — title, category, live
 * flag, started-at timestamp. Currently emitted by Twitch via Helix polling.
 * Consumers (overlay, UI) should treat the absence of `isLive=true` as the
 * stream being offline rather than waiting for a separate offline event.
 */
export interface StreamInfoEvent extends StreamEvent {
  type: 'stream-info'
  isLive: boolean
  title?: string
  gameName?: string
  gameId?: string
  startedAt?: string
  thumbnailUrl?: string
}

export type AnyStreamEvent =
  | ChatEvent
  | GiftEvent
  | SubscriptionEvent
  | FollowEvent
  | RaidEvent
  | LikeEvent
  | ShareEvent
  | JoinEvent
  | ViewerCountEvent
  | FollowerCountEvent
  | StreamInfoEvent

// --- Connection types ---

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface PlatformChatCapability {
  platform: Platform
  canSend: boolean
  reason?: string
}

export interface PlatformChatSendResult {
  platform: Platform
  ok: boolean
  error?: string
}

export interface PlatformConfig {
  platform: Platform
  enabled: boolean
}

export interface TikTokConfig extends PlatformConfig {
  platform: 'tiktok'
  username: string
  sessionId?: string
  ttTargetIdc?: string
  signApiKey?: string
  streamKey?: string
}

export interface TwitchConfig extends PlatformConfig {
  platform: 'twitch'
  clientId: string
  clientSecret: string
  channel: string
  accessToken?: string
  refreshToken?: string
  streamKey?: string
}

export interface YouTubeConfig extends PlatformConfig {
  platform: 'youtube'
  apiKey: string
  channelId?: string
  liveChatId?: string
  accessToken?: string
  refreshToken?: string
  streamKey?: string
}

export interface KickConfig extends PlatformConfig {
  platform: 'kick'
  channelName: string
  streamKey?: string
}

export interface XConfig extends PlatformConfig {
  platform: 'x'
  apiKey: string
  apiSecret: string
  bearerToken: string
  username: string
}

export interface DiscordConfig extends PlatformConfig {
  platform: 'discord'
  webhookUrl: string
  botToken?: string
  clientId?: string
}

export interface FacebookConfig extends PlatformConfig {
  platform: 'facebook'
  pageId: string
  accessToken?: string
}

export interface InstagramConfig extends PlatformConfig {
  platform: 'instagram'
  username: string
}

export interface RestreamConfig extends PlatformConfig {
  platform: 'restream'
  apiKey?: string
}

export interface LinkedinConfig extends PlatformConfig {
  platform: 'linkedin'
  profileId: string
}

export interface TelegramConfig extends PlatformConfig {
  platform: 'telegram'
  botToken: string
  chatId: string
}

export type AnyPlatformConfig =
  | TikTokConfig
  | TwitchConfig
  | YouTubeConfig
  | KickConfig
  | XConfig
  | DiscordConfig
  | FacebookConfig
  | InstagramConfig
  | RestreamConfig
  | LinkedinConfig
  | TelegramConfig
