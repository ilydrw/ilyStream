import type {
  LatestGifterConfig,
  AlertsConfig,
  ChatConfig,
  FollowerGoalConfig,
  NowPlayingConfig,
  NowPlayingPayload,
  SocialsConfig,
  BorderConfig,
  ParticleConfig,
  RoseConfig,
  ParticlesWidgetConfig,
  DiscordPromoConfig,
  NodeNetworkConfig,
  PhysicsConfig,
  LeaderboardConfig,
  ChatUnifiedConfig,
  LikesTrackerConfig
} from './types'

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

export const DEFAULT_LIKES_TRACKER_CONFIG: LikesTrackerConfig = {
  title: 'Top Likers',
  maxAvatars: 3,
  showTotal: true,
  showHeader: true,
  showRankNumbers: true,
  showFirstPlaceCrown: true,
  avatarShape: 'circle',
  accentColor: '#FF3B5C',
  secondaryColor: '#25F4EE',
  backgroundColor: '#0F0F14',
  textColor: '#FFFFFF',
  crownColor: '#FFD60A',
  opacity: 1.0,
  scale: 1.0,
  rowHeight: 60,
  avatarSize: 40,
  fontFamily: 'Outfit',
  borderRadius: 20,
  glassIntensity: 0.5,
  animationStyle: 'zoom',
  animationDuration: 800,
  // Periodic all-time cycling defaults off: swapping the title every few
  // minutes can read as "the live leaderboard stopped." The overlay template
  // still uses all-time stats as an idle fallback until live likes arrive.
  lifetimeGlimpseEnabled: false,
  streamWindowMinutes: 4,
  lifetimeWindowMinutes: 1,
  lifetimeTitle: 'All-Time Top Likers',
  showPulsingHeart: true
}
