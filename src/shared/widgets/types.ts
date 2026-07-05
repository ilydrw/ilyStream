import type { SpotifySongRequest } from '../spotify-types'

export type WidgetType = 'chat' | 'alerts' | 'goal' | 'now-playing' | 'follower-goal' | 'socials' | 'screen-border' | 'event-particles' | 'falling-roses' | 'gift-overlays' | 'particles' | 'discord-promo' | 'node-network' | 'latest-gifter' | 'physics' | 'leaderboard' | 'chat-unified' | 'likes-tracker'

export interface Widget<TConfig = unknown> {
  id: string
  name: string
  type: WidgetType
  config: TConfig
}

export interface AlertsConfig {
  accentColor: string
  textColor: string
  backgroundOpacity: number
  blur: number
  duration: number
  fontFamily: string
  borderRadius: number
  glassIntensity: number
  animationStyle: 'slide' | 'fade' | 'zoom'
  animationDuration?: number
}

export interface LatestGifterConfig {
  label: string
  primaryColor: string
  secondaryColor: string
  textColor: string
  opacity: number
  scale: number
  showAmount: boolean
  aspectRatio: 'auto' | 'tiktok' | 'landscape'
  forceTikTokDimensions: boolean
  fontFamily: string
  borderRadius: number
  glassIntensity: number
  animationStyle: 'fade' | 'slide' | 'zoom' | 'none'
  animationDuration?: number
}

export interface ChatConfig {
  maxItems: number
  position: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'
  width: number
  fontSize: number
  backgroundOpacity: number
  blur: number
  showPlatformBadge: boolean
  chatOnly: boolean
  accentColor: string
  fadeOutAfterSeconds: number
  aspectRatio: 'auto' | 'tiktok' | 'landscape'
  forceTikTokDimensions: boolean
  fontFamily: string
  borderRadius: number
  glassIntensity: number
  animationStyle: 'fade' | 'slide' | 'none' | 'zoom'
  animationDuration?: number
}

export interface FollowerGoalConfig {
  goal: number
  startCount: number
  label: string
  goalType: 'follows' | 'likes' | 'gifts' | 'subs' | 'shares' | 'raids' | 'viewers'
  platform: 'all' | 'twitch' | 'tiktok'
  accentColor: string
  backgroundOpacity: number
  blur: number
  showCount: boolean
  showPercentage: boolean
  position: 'top-left' | 'top-right' | 'top-center' | 'bottom-left' | 'bottom-right' | 'bottom-center'
  width: number
  showBorder: boolean
  style: 'classic' | 'chroma' | 'cyber' | 'gob-the-stopper'
  fontFamily: string
  borderRadius: number
  glassIntensity: number
  animationStyle: 'fade' | 'slide' | 'zoom' | 'none'
  animationDuration?: number
  celebrateAt100?: boolean
  celebrationType?: 'confetti' | 'fireworks' | 'hearts'
}

export interface NowPlayingConfig {
  accentColor: string
  backgroundColor: string
  textColor: string
  backgroundOpacity: number
  showAlbumArt: boolean
  showProgressBar: boolean
  showRequester: boolean
  layout: 'compact' | 'wide'
  fontSize: number
  hideWhenIdle: boolean
  showQueue: boolean
  maxQueueItems: number
  width: number
  position: 'top-left' | 'top-right' | 'top-center' | 'bottom-left' | 'bottom-right' | 'bottom-center'
  showBorder: boolean
  borderWidth: number
  borderColor: string
  borderType: 'solid' | 'chroma' | 'cyber' | 'gob-the-stopper'
  fontFamily: string
  borderRadius: number
  glassIntensity: number
  animationStyle: 'fade' | 'zoom' | 'none' | 'slide'
  animationDuration?: number
}

export interface NowPlayingPayload {
  isPlaying: boolean
  trackId: string | null
  trackName: string
  artists: string[]
  albumName: string
  albumArtUrl: string | null
  durationMs: number
  progressMs: number
  requestedBy: string | null
  requesterPlatform: string | null
  queue: SpotifySongRequest[]
  status: 'ok' | 'no-content' | 'no-device' | 'unauthorized' | 'forbidden' | 'error'
  isRefreshing?: boolean
}

export interface SocialAccount {
  id: string
  platform: 'twitter' | 'youtube' | 'tiktok' | 'instagram' | 'discord' | 'twitch' | 'kick' | 'custom'
  username: string
  customIconUrl?: string
}

export interface SocialsConfig {
  accounts: SocialAccount[]
  interval: number
  animation: 'roll' | 'fade' | 'slide'
  position: 'top-left' | 'top-right' | 'top-center' | 'bottom-left' | 'bottom-right' | 'bottom-center'
  width: number
  backgroundOpacity: number
  backgroundColor: string
  blur: number
  accentColor: string
  showBorder: boolean
  style: 'classic' | 'chroma' | 'cyber' | 'gob-the-stopper'
  fontFamily: string
  borderRadius: number
  glassIntensity: number
  animationStyle?: 'fade' | 'slide' | 'zoom' | 'none'
  animationDuration?: number
}

export interface BorderConfig {
  style: 'classic' | 'chroma' | 'cyber' | 'gob-the-stopper'
  thickness: number
  borderRadius: number
  glowIntensity: number
  speed: number
  color1: string
  color2: string
  opacity: number
  aspectRatio: 'auto' | 'tiktok' | 'landscape'
  forceTikTokDimensions?: boolean
  showPreviewBackground?: boolean
  animationStyle?: 'fade' | 'slide' | 'zoom' | 'none'
  animationDuration?: number
}

export interface ParticleConfig {
  style: 'hearts' | 'stars' | 'bubbles'
  count: number
  speed: number
  scale: number
  primaryColor: string
  secondaryColor: string
  textColor: string
  text: string
  eventDriven: boolean
  animationStyle?: 'fade' | 'slide' | 'zoom' | 'none'
  animationDuration?: number
  audioReactive?: boolean
  audioThreshold?: number
}

export interface RoseConfig {
  count: number
  speed: number
  scale: number
  primaryColor: string
  secondaryColor: string
  eventDriven: boolean
  fontFamily: string
  borderRadius: number
  glassIntensity: number
  animationStyle?: 'fade' | 'slide' | 'zoom' | 'none'
  animationDuration?: number
}

export interface FollowerHeartsLayerConfig {
  enabled: boolean
  count: number
  speed: number
  scale: number
  primaryColor: string
  secondaryColor: string
  textColor: string
  text: string
  audioReactive?: boolean
}

export interface FallingRosesLayerConfig {
  enabled: boolean
  count: number
  speed: number
  scale: number
  primaryColor: string
  secondaryColor: string
  audioReactive?: boolean
}

export interface GalaxyLayerConfig {
  enabled: boolean
  count: number
  speed: number
  scale: number
  primaryColor: string
  secondaryColor: string
  triggerOn: 'galaxyGift'
  audioReactive?: boolean
}

export interface GGsLayerConfig {
  enabled: boolean
  count: number
  speed: number
  scale: number
  color: string
  text: string
  triggerOn: 'ggGift'
  audioReactive?: boolean
}

export interface HeartMeLayerConfig {
  enabled: boolean
  count: number
  speed: number
  scale: number
  primaryColor: string
  secondaryColor: string
  audioReactive?: boolean
}

export interface ParticlesWidgetConfig {
  followerHearts: FollowerHeartsLayerConfig
  fallingRoses: FallingRosesLayerConfig
  galaxy: GalaxyLayerConfig
  ggs: GGsLayerConfig
  heartMe: HeartMeLayerConfig
  animationStyle?: 'fade' | 'slide' | 'zoom' | 'none'
  animationDuration?: number
  audioThreshold?: number
}

export interface DiscordPromoConfig {
  message: string
  subMessage: string
  primaryColor: string
  secondaryColor: string
  textColor: string
  iconColor: string
  opacity: number
  scale: number
  aspectRatio: 'auto' | 'tiktok' | 'landscape'
  forceTikTokDimensions: boolean
  fontFamily: string
  borderRadius: number
  glassIntensity: number
  animationStyle?: 'fade' | 'slide' | 'zoom' | 'none'
  animationDuration?: number
}

export interface NodeNetworkConfig {
  nodeCount: number
  maxDistance: number
  speed: number
  primaryColor: string
  secondaryColor: string
  opacity: number
  aspectRatio: 'auto' | 'tiktok' | 'landscape'
  forceTikTokDimensions: boolean
  fontFamily: string
  borderRadius: number
  glassIntensity: number
  animationStyle?: 'fade' | 'slide' | 'zoom' | 'none'
  animationDuration?: number
}

export interface PhysicsConfig {
  gravity: number
  friction: number
  restitution: number
  enableWalls: boolean
  particleLifeSec: number
  maxObjects: number
  aspectRatio: 'auto' | 'tiktok' | 'landscape'
  forceTikTokDimensions: boolean
  fontFamily: string
  borderRadius: number
  glassIntensity: number
  animationStyle?: 'fade' | 'slide' | 'zoom' | 'none'
  animationDuration?: number
}

export interface LeaderboardConfig {
  accentColor: string
  opacity: number
  scale: number
  aspectRatio: 'auto' | 'tiktok' | 'landscape'
  fontFamily: string
  borderRadius: number
  glassIntensity: number
  animationStyle: 'fade' | 'slide' | 'zoom' | 'none'
  animationDuration?: number
}

export interface ChatUnifiedConfig {
  maxItems: number
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  opacity: number
  scale: number
  backgroundOpacity: number
  blur: number
  aspectRatio: 'auto' | 'tiktok' | 'landscape'
  fontFamily: string
  borderRadius: number
  glassIntensity: number
  animationStyle: 'fade' | 'slide' | 'zoom' | 'none'
  animationDuration?: number
}

export interface LikesTrackerConfig {
  title: string
  maxAvatars: number
  showTotal: boolean
  showHeader: boolean
  showRankNumbers: boolean
  showFirstPlaceCrown: boolean
  avatarShape: 'circle' | 'square'
  accentColor: string
  secondaryColor: string
  backgroundColor: string
  textColor: string
  crownColor: string
  opacity: number
  scale: number
  rowHeight: number
  avatarSize: number
  fontFamily: string
  borderRadius: number
  glassIntensity: number
  animationStyle: 'fade' | 'slide' | 'zoom' | 'none'
  animationDuration?: number
  lifetimeGlimpseEnabled: boolean
  streamWindowMinutes: number
  lifetimeWindowMinutes: number
  lifetimeTitle: string
  showPulsingHeart: boolean
}
