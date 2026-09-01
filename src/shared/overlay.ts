/** A user-role badge attached to a feed item (mod / member / super fan / vip / team). */
export interface OverlayFeedBadge {
  kind: 'mod' | 'member' | 'superfan' | 'vip' | 'team'
  title: string
  /** Platform-supplied badge art, when available. Falls back to a glyph. */
  imageUrl?: string
}

/** A platform emote positioned inside an overlay/companion chat message. */
export interface OverlayFeedEmote {
  id: string
  name: string
  imageUrl: string
  startIndex: number
  endIndex: number
}

export interface OverlayFeedItem {
  id: string
  kind: 'chat' | 'gift' | 'subscription' | 'follow' | 'raid' | 'like' | 'share'
  platform: string
  platformLabel: string
  displayName: string
  profilePictureUrl?: string
  message: string
  amount?: number
  meta?: string
  accentColor: string
  timestamp: string
  emphasis: boolean
  /** Role badges to render next to the name (mod, sub/fan-club, super fan). */
  badges?: OverlayFeedBadge[]
  /** Platform emote art and text positions for rich chat clients. */
  emotes?: OverlayFeedEmote[]
}

export interface OverlayAlertItem {
  id: string
  platform: string
  eventType?: string
  variant?: string
  eyebrow?: string
  headline?: string
  subtitle?: string
  meta?: string
  accentColor?: string
  html: string
  imageUrl?: string
  audioUrl?: string
  audioVolume?: number
  durationMs: number
  animationIn: 'fade' | 'slide' | 'bounce' | 'zoom' | 'wave'
  animationOut: 'fade' | 'slide' | 'tv-warp' | 'dissolve'
  createdAt: string
  textColor?: string
  backgroundColor?: string
  borderColor?: string
  fontSize?: number
  fontWeight?: number
  textShadow?: string
  layout?: 'stacked' | 'side-by-side' | 'text-only' | 'image-only'
  imageTop?: number
  imageLeft?: number
  alertTop?: number
  alertLeft?: number
}

export interface OverlayGoalState {
  totalLikes: number
  totalGiftCount: number
  totalGiftValueCents: number
  totalSubscriptions: number
  totalFollows: number
  totalShares: number
  totalRaids: number
  currentViewerCount: number

  // Platform specific
  twitchFollows: number
  twitchSubs: number
  tiktokFollows: number
  tiktokLikes: number
  tiktokGifts: number

  lastUpdatedAt: string | null
}

export interface OverlayRuntimeStatus {
  running: boolean
  port: number | null
  requestedPort: number | null
  listenHost?: string | null
  devicePort?: number | null
  deviceListenHost?: string | null
  deviceLastError?: string | null
  deviceHost?: string | null
  deviceHosts?: string[]
  devicePairUrl?: string | null
  devicePairUrls?: string[]
  lastError: string | null
  startedAt: string | null
  chatUrl: string | null
  alertsUrl: string | null
  goalsUrl: string | null
  healthUrl: string | null
  /** IPC-only secret used to opt trusted browser-source URLs into WebSocket transport. */
  webSocketCapability?: string
  deckUrl?: string | null
  particlesUrl?: string | null
  dualVerticalUrl?: string | null
  chatClientCount: number
  alertClientCount: number
  goalClientCount: number
  followerGoalClientCount?: number
  textWidgetClientCount?: number
  socialsClientCount?: number
  borderClientCount?: number
  particleClientCount?: number
  roseClientCount?: number
  likesClientCount?: number
  discordCallClientCount?: number
  leaderboardClientCount?: number
  webSocketClientCount?: number
  dualVerticalClientCount?: number
}
