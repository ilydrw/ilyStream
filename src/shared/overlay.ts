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
}

export interface OverlayAlertItem {
  id: string
  platform: string
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
  lastUpdatedAt: string | null
}

export interface OverlayRuntimeStatus {
  running: boolean
  port: number | null
  requestedPort: number | null
  lastError: string | null
  startedAt: string | null
  chatUrl: string | null
  alertsUrl: string | null
  goalsUrl: string | null
  healthUrl: string | null
  deckUrl?: string | null
  particlesUrl?: string | null
  dualVerticalUrl?: string | null
  chatClientCount: number
  alertClientCount: number
  goalClientCount: number
  followerGoalClientCount?: number
  socialsClientCount?: number
  borderClientCount?: number
  particleClientCount?: number
  roseClientCount?: number
  likesClientCount?: number
  dualVerticalClientCount?: number
}
