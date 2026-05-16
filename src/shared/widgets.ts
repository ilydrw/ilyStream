import type { SpotifySongRequest } from './spotify-types'

/**
 * Shared widget types for the overlay system.
 * Each widget instance is a configured copy of a widget template that can be
 * dragged into OBS as a browser source (URL: /overlay/<widget.id>).
 */

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
// ----- Latest Gifter widget ----------------------------------------------

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

export const DEFAULT_LATEST_GIFTER_CONFIG: LatestGifterConfig = {
  label: 'LATEST GIFTER',
  primaryColor: '#19C8FF',
  secondaryColor: '#D035F1',
  textColor: '#FFFFFF',
  opacity: 1.0,
  scale: 1.0,
  showAmount: true,
  aspectRatio: 'auto',
  forceTikTokDimensions: false,
  fontFamily: 'Outfit',
  borderRadius: 20,
  glassIntensity: 0.5,
  animationStyle: 'slide',
  animationDuration: 600
}

export const DEFAULT_ALERTS_CONFIG: AlertsConfig = {
  accentColor: '#ff7a45',
  textColor: '#ffffff',
  backgroundOpacity: 0.5,
  blur: 50,
  duration: 5000,
  fontFamily: 'Inter',
  borderRadius: 40,
  glassIntensity: 0.5,
  animationStyle: 'fade',
  animationDuration: 800
}


// ----- Chat widget ---------------------------------------------------------

export interface ChatConfig {
  maxItems: number
  position: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'
  width: number
  fontSize: number
  backgroundOpacity: number
  blur: number
  showPlatformBadge: boolean
  /** When true, hide non-chat events (gifts, subs, follows) from the feed. */
  chatOnly: boolean
  accentColor: string
  /** Auto-remove messages after N seconds. 0 = never. */
  fadeOutAfterSeconds: number
  aspectRatio: 'auto' | 'tiktok' | 'landscape'
  forceTikTokDimensions: boolean
  fontFamily: string
  borderRadius: number
  glassIntensity: number
  animationStyle: 'fade' | 'slide' | 'none' | 'zoom'
  animationDuration?: number
}

export const DEFAULT_CHAT_CONFIG: ChatConfig = {
  maxItems: 8,
  position: 'bottom-left',
  width: 480,
  fontSize: 15,
  backgroundOpacity: 0.65,
  blur: 40,
  showPlatformBadge: true,
  chatOnly: false,
  accentColor: '#ff7a45',
  fadeOutAfterSeconds: 0,
  aspectRatio: 'auto',
  forceTikTokDimensions: false,
  fontFamily: 'Inter',
  borderRadius: 12,
  glassIntensity: 0.5,
  animationStyle: 'slide',
  animationDuration: 600
}

// ----- Follower goal widget ------------------------------------------------

export interface FollowerGoalConfig {
  goal: number
  startCount: number
  label: string
  /** 'follows', 'likes', 'gifts', 'subs', etc. */
  goalType: 'follows' | 'likes' | 'gifts' | 'subs' | 'shares' | 'raids' | 'viewers'
  /** 'all', 'twitch', or 'tiktok' */
  platform: 'all' | 'twitch' | 'tiktok'
  accentColor: string
  backgroundOpacity: number
  blur: number
  showCount: boolean
  showPercentage: boolean
  position: 'top-left' | 'top-right' | 'top-center' | 'bottom-left' | 'bottom-right' | 'bottom-center'
  width: number
  showBorder: boolean
  style: 'classic' | 'chroma' | 'cyber'
  fontFamily: string
  borderRadius: number
  glassIntensity: number
  animationStyle: 'fade' | 'slide' | 'zoom' | 'none'
  animationDuration?: number
  celebrateAt100?: boolean
  celebrationType?: 'confetti' | 'fireworks' | 'hearts'
}

export const DEFAULT_FOLLOWER_GOAL_CONFIG: FollowerGoalConfig = {
  goal: 1000,
  startCount: 0,
  label: 'Follower Goal',
  goalType: 'follows',
  platform: 'all',
  accentColor: '#38bdf8',
  backgroundOpacity: 0.15,
  blur: 12,
  showCount: true,
  showPercentage: true,
  position: 'bottom-left',
  width: 280,
  showBorder: true,
  style: 'classic',
  fontFamily: 'Outfit',
  borderRadius: 50,
  glassIntensity: 0.3,
  animationStyle: 'slide',
  animationDuration: 800,
  celebrateAt100: true,
  celebrationType: 'confetti'
}

// ----- Now Playing widget --------------------------------------------------

export interface NowPlayingConfig {
  /** Hex string. */
  accentColor: string
  /** Hex string. */
  backgroundColor: string
  /** Hex string. */
  textColor: string
  /** 0-1, controls the panel's background opacity. */
  backgroundOpacity: number
  showAlbumArt: boolean
  showProgressBar: boolean
  showRequester: boolean
  /** "compact" hides the artist line, "wide" shows everything. */
  layout: 'compact' | 'wide'
  /** Pixels. Affects the track-name line; other text scales relative to it. */
  fontSize: number
  /** Hide the panel entirely when nothing is playing. */
  hideWhenIdle: boolean
  showQueue: boolean
  maxQueueItems: number
  /** Pixels. Total width of the widget. */
  width: number
  position: 'top-left' | 'top-right' | 'top-center' | 'bottom-left' | 'bottom-right' | 'bottom-center'
  showBorder: boolean
  borderWidth: number
  borderColor: string
  borderType: 'solid' | 'chroma' | 'cyber'
  fontFamily: string
  borderRadius: number
  glassIntensity: number
  animationStyle: 'fade' | 'zoom' | 'none' | 'slide'
  animationDuration?: number
}

export const DEFAULT_NOW_PLAYING_CONFIG: NowPlayingConfig = {
  accentColor: '#1DB954',
  backgroundColor: '#0b0d10',
  textColor: '#ffffff',
  backgroundOpacity: 0.85,
  showAlbumArt: true,
  showProgressBar: true,
  showRequester: true,
  layout: 'wide',
  fontSize: 22,
  hideWhenIdle: false,
  showQueue: true,
  maxQueueItems: 5,
  width: 400,
  position: 'top-left',
  showBorder: true,
  borderWidth: 2,
  borderColor: '#1DB954',
  borderType: 'solid',
  fontFamily: 'Inter',
  borderRadius: 16,
  glassIntensity: 0.7,
  animationStyle: 'fade',
  animationDuration: 600
}

// ----- Spotify now-playing payload (broadcast over SSE) --------------------

export interface NowPlayingPayload {
  isPlaying: boolean
  /** Spotify track id; null when nothing playing. */
  trackId: string | null
  trackName: string
  artists: string[]
  albumName: string
  albumArtUrl: string | null
  /** Total length in ms. */
  durationMs: number
  /** Current playhead in ms. */
  progressMs: number
  /** Username of the chat-side requester, if this track was queued via !play. */
  requestedBy: string | null
  /** Source platform of the requester ("twitch", "tiktok", etc.) for the requester badge. */
  requesterPlatform: string | null
  /** Optional queue of upcoming songs. */
  queue: SpotifySongRequest[]
  /** Connection or playback status. */
  status: 'ok' | 'no-content' | 'no-device' | 'unauthorized' | 'forbidden' | 'error'
  /** Whether the service is currently refreshing its token. */
  isRefreshing?: boolean
}

export const EMPTY_NOW_PLAYING: NowPlayingPayload = {
  isPlaying: false,
  trackId: null,
  trackName: '',
  artists: [],
  albumName: '',
  albumArtUrl: null,
  durationMs: 0,
  progressMs: 0,
  requestedBy: null,
  requesterPlatform: null,
  queue: [],
  status: 'ok',
  isRefreshing: false
}

// ----- Socials widget ------------------------------------------------------

export interface SocialAccount {
  id: string
  platform: 'twitter' | 'youtube' | 'tiktok' | 'instagram' | 'discord' | 'twitch' | 'kick' | 'custom'
  username: string
  customIconUrl?: string
}

export interface SocialsConfig {
  accounts: SocialAccount[]
  interval: number // seconds
  animation: 'roll' | 'fade' | 'slide'
  position: 'top-left' | 'top-right' | 'top-center' | 'bottom-left' | 'bottom-right' | 'bottom-center'
  width: number
  backgroundOpacity: number
  backgroundColor: string
  blur: number
  accentColor: string
  showBorder: boolean
  style: 'classic' | 'chroma' | 'cyber'
  fontFamily: string
  borderRadius: number
  glassIntensity: number
  animationStyle?: 'fade' | 'slide' | 'zoom' | 'none'
  animationDuration?: number
}

export const DEFAULT_SOCIALS_CONFIG: SocialsConfig = {
  accounts: [
    { id: '1', platform: 'twitter', username: '@IlyStreamer' },
    { id: '2', platform: 'youtube', username: 'IlyStream' }
  ],
  interval: 8,
  animation: 'roll',
  position: 'bottom-left',
  width: 280,
  backgroundOpacity: 0.6,
  backgroundColor: '#0b0d10',
  blur: 20,
  accentColor: '#ff7a45',
  showBorder: true,
  style: 'classic',
  fontFamily: 'Outfit',
  borderRadius: 20,
  glassIntensity: 0.5,
  animationStyle: 'slide',
  animationDuration: 800
}

// ----- Screen Border widget ------------------------------------------------

export interface BorderConfig {
  style: 'classic' | 'chroma' | 'cyber'
  thickness: number
  borderRadius: number
  glowIntensity: number
  speed: number
  color1: string
  color2: string
  opacity: number
  /** 'auto' fills the container, 'tiktok' forces 9:16, 'landscape' forces 16:9 */
  aspectRatio: 'auto' | 'tiktok' | 'landscape'
  forceTikTokDimensions?: boolean
  showPreviewBackground?: boolean
  animationStyle?: 'fade' | 'slide' | 'zoom' | 'none'
  animationDuration?: number
}

export const DEFAULT_BORDER_CONFIG: BorderConfig = {
  style: 'chroma',
  thickness: 8,
  borderRadius: 0,
  glowIntensity: 1,
  speed: 15,
  color1: '#19c8ff',
  color2: '#d035f1',
  opacity: 1,
  aspectRatio: 'auto',
  forceTikTokDimensions: false,
  showPreviewBackground: false,
  animationStyle: 'fade',
  animationDuration: 1000
}

// ----- Event Particles widget ----------------------------------------------

export interface ParticleConfig {
  style: 'hearts' | 'stars' | 'bubbles'
  count: number
  speed: number
  scale: number
  primaryColor: string
  secondaryColor: string
  textColor: string
  text: string
  /** If true, only spawn particles when an event occurs. If false, spawn continuously. */
  eventDriven: boolean
  animationStyle?: 'fade' | 'slide' | 'zoom' | 'none'
  animationDuration?: number
  audioReactive?: boolean
  audioThreshold?: number
}

export const DEFAULT_PARTICLE_CONFIG: ParticleConfig = {
  style: 'hearts',
  count: 35,
  speed: 1.5,
  scale: 1.0,
  primaryColor: '#D035F1',
  secondaryColor: '#19C8FF',
  textColor: '#FFFFFF',
  text: 'ily!',
  eventDriven: false,
  animationStyle: 'fade',
  animationDuration: 800,
  audioReactive: true,
  audioThreshold: 0.05
}

// ----- Falling Roses widget ------------------------------------------------

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

export const DEFAULT_ROSE_CONFIG: RoseConfig = {
  count: 45,
  speed: 0.8,
  scale: 1.0,
  primaryColor: '#D035F1',
  secondaryColor: '#19C8FF',
  eventDriven: true,
  fontFamily: 'Inter',
  borderRadius: 20,
  glassIntensity: 0.5,
  animationStyle: 'fade',
  animationDuration: 800
}

// ----- Unified Particles widget --------------------------------------------

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

// ----- Discord Promo widget ----------------------------------------------

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

export const DEFAULT_DISCORD_PROMO_CONFIG: DiscordPromoConfig = {
  message: 'JOIN THE DISCORD',
  subMessage: 'Link in the bio!',
  primaryColor: '#5865F2',
  secondaryColor: '#404EED',
  textColor: '#FFFFFF',
  iconColor: '#FFFFFF',
  opacity: 1.0,
  scale: 0.7,
  aspectRatio: 'auto',
  forceTikTokDimensions: false,
  fontFamily: 'Outfit',
  borderRadius: 20,
  glassIntensity: 0.5,
  animationStyle: 'slide',
  animationDuration: 800
}

// ----- Node Network widget ----------------------------------------------

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

export const DEFAULT_NODE_NETWORK_CONFIG: NodeNetworkConfig = {
  nodeCount: 60,
  maxDistance: 120,
  speed: 0.3,
  primaryColor: '#19C8FF',
  secondaryColor: '#D035F1',
  opacity: 1.0,
  aspectRatio: 'auto',
  forceTikTokDimensions: false,
  fontFamily: 'Inter',
  borderRadius: 0,
  glassIntensity: 0.5,
  animationStyle: 'fade',
  animationDuration: 1200
}

export const DEFAULT_PARTICLES_CONFIG: ParticlesWidgetConfig = {
  followerHearts: {
    enabled: false,
    count: 35,
    speed: 1.5,
    scale: 1.0,
    primaryColor: '#D035F1',
    secondaryColor: '#19C8FF',
    textColor: '#FFFFFF',
    text: 'ily!'
  },
  fallingRoses: {
    enabled: false,
    count: 45,
    speed: 0.8,
    scale: 1.0,
    primaryColor: '#D035F1',
    secondaryColor: '#19C8FF'
  },
  galaxy: {
    enabled: false,
    count: 50,
    speed: 0.8,
    scale: 1.0,
    primaryColor: '#9B59B6',
    secondaryColor: '#3498DB',
    triggerOn: 'galaxyGift'
  },
  ggs: {
    enabled: false,
    count: 20,
    speed: 1.0,
    scale: 1.0,
    color: '#00FF9D',
    text: 'GG',
    triggerOn: 'ggGift'
  },
  heartMe: {
    enabled: false,
    count: 15,
    speed: 1.2,
    scale: 0.8,
    primaryColor: '#FF6B9D',
    secondaryColor: '#FF1493'
  },
  animationStyle: 'fade',
  animationDuration: 1000,
  audioThreshold: 0.05
}

// ----- Physics widget ----------------------------------------------

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

export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
  gravity: 1.0,
  friction: 0.1,
  restitution: 0.6,
  enableWalls: true,
  particleLifeSec: 15,
  maxObjects: 50,
  aspectRatio: 'auto',
  forceTikTokDimensions: false,
  fontFamily: 'Inter',
  borderRadius: 20,
  glassIntensity: 0.5,
  animationStyle: 'fade',
  animationDuration: 1000
}

// ----- Leaderboard widget ----------------------------------------------
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

export const DEFAULT_LEADERBOARD_CONFIG: LeaderboardConfig = {
  accentColor: '#FF00FF',
  opacity: 1.0,
  scale: 1.0,
  aspectRatio: 'auto',
  fontFamily: 'Outfit',
  borderRadius: 16,
  glassIntensity: 0.6,
  animationStyle: 'fade',
  animationDuration: 600
}

// ----- Chat Unified widget ----------------------------------------------
export interface ChatUnifiedConfig {
  maxItems: number
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

export const DEFAULT_CHAT_UNIFIED_CONFIG: ChatUnifiedConfig = {
  maxItems: 75,
  opacity: 1.0,
  scale: 1.0,
  backgroundOpacity: 0.65,
  blur: 40,
  aspectRatio: 'auto',
  fontFamily: 'Inter',
  borderRadius: 12,
  glassIntensity: 0.5,
  animationStyle: 'slide',
  animationDuration: 400
}

// ----- Likes Tracker widget ----------------------------------------------
export interface LikesTrackerConfig {
  maxAvatars: number
  showTotal: boolean
  accentColor: string
  opacity: number
  scale: number
  fontFamily: string
  borderRadius: number
  glassIntensity: number
  animationStyle: 'fade' | 'slide' | 'zoom' | 'none'
  animationDuration?: number
}

export const DEFAULT_LIKES_TRACKER_CONFIG: LikesTrackerConfig = {
  maxAvatars: 12,
  showTotal: true,
  accentColor: '#FF3B5C',
  opacity: 1.0,
  scale: 1.0,
  fontFamily: 'Outfit',
  borderRadius: 20,
  glassIntensity: 0.5,
  animationStyle: 'zoom',
  animationDuration: 800
}
