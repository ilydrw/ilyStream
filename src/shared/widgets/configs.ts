import type {
  LatestGifterConfig,
  AlertsConfig,
  ChatConfig,
  FollowerGoalConfig,
  TextWidgetConfig,
  NowPlayingConfig,
  NowPlayingPayload,
  SocialsConfig,
  BorderConfig,
  CameraFrameConfig,
  BrbScreenConfig,
  ParticleConfig,
  RoseConfig,
  ParticlesWidgetConfig,
  DiscordPromoConfig,
  DiscordCallWidgetConfig,
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
  backgroundColor: '#0a0c12',
  backgroundOpacity: 0.4,
  blur: 30,
  duration: 5000,
  fontFamily: 'Inter',
  borderRadius: 40,
  borderWidth: 1,
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

export const DEFAULT_TEXT_WIDGET_CONFIG: TextWidgetConfig = {
  text: 'YOUR TEXT HERE',
  fontFamily: 'Outfit',
  fontSize: 72,
  fontWeight: 700,
  fontStyle: 'normal',
  textAlign: 'center',
  verticalAlign: 'middle',
  textTransform: 'none',
  letterSpacing: 0,
  lineHeight: 1.1,
  textColor: '#FFFFFF',
  outlineColor: '#000000',
  outlineWidth: 0,
  shadowColor: '#000000',
  shadowOpacity: 0.55,
  shadowBlur: 12,
  shadowOffsetX: 0,
  shadowOffsetY: 4,
  backgroundEnabled: false,
  backgroundColor: '#000000',
  backgroundOpacity: 0.55,
  paddingHorizontal: 28,
  paddingVertical: 16,
  borderRadius: 16,
  canvasWidth: 800,
  canvasHeight: 240,
  animationStyle: 'fade',
  animationDuration: 500
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

export const DEFAULT_CAMERA_FRAME_CONFIG: CameraFrameConfig = {
  shape: 'rounded',
  frameStyle: 'accent',
  frameInset: 18,
  borderWidth: 8,
  secondaryBorderWidth: 3,
  cornerRadius: 36,
  doubleGap: 12,
  dashLength: 34,
  dashGap: 22,
  lineCap: 'round',
  primaryColor: '#19C8FF',
  secondaryColor: '#FF7A45',
  opacity: 1,
  glowIntensity: 0.45,
  shadowIntensity: 0.3,
  matteEnabled: false,
  matteColor: '#080A0F',
  matteOpacity: 0.82,
  decorationStyle: 'corners',
  decorationSize: 72,
  labelEnabled: false,
  labelText: 'LIVE',
  labelPosition: 'bottom-left',
  labelTextColor: '#FFFFFF',
  labelBackgroundColor: '#080A0F',
  labelBackgroundOpacity: 0.84,
  fontFamily: 'Outfit',
  animationStyle: 'orbit',
  animationSpeed: 8,
  showPreviewBackground: true
}

export const DEFAULT_BRB_SCREEN_CONFIG: BrbScreenConfig = {
  eyebrow: 'STREAM PAUSED',
  title: 'BE RIGHT BACK',
  message: 'Taking a quick break. The stream will resume shortly.',
  footerText: 'Thanks for hanging out.',
  showEyebrow: true,
  showMessage: true,
  showFooter: true,
  showLocalTime: true,
  clockFormat: '12-hour',
  countdownEnabled: false,
  countdownMinutes: 10,
  countdownLabel: 'BACK IN',
  countdownCompleteText: 'ANY MOMENT NOW',
  showCountdownProgress: true,
  contentPosition: 'middle-left',
  textAlign: 'left',
  contentWidth: 820,
  scale: 1,
  titleSize: 112,
  backgroundColor: '#08090D',
  backgroundOpacity: 1,
  backgroundImageUrl: '',
  backgroundImageOpacity: 0.45,
  backgroundImageBlur: 0,
  backgroundImageFit: 'cover',
  accentColor: '#FF7A45',
  secondaryColor: '#19C8FF',
  textColor: '#FFF9F4',
  mutedTextColor: '#9CA3AF',
  decorationStyle: 'orbit',
  decorationMotion: 'rotate',
  decorationSpeed: 18,
  decorationOpacity: 0.8,
  panelEnabled: false,
  panelColor: '#10131A',
  panelOpacity: 0.62,
  panelBlur: 18,
  showPanelBorder: true,
  aspectRatio: 'auto',
  forceTikTokDimensions: false,
  fontFamily: 'Outfit',
  borderRadius: 24,
  animationStyle: 'slide',
  animationDuration: 900
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

export const DEFAULT_DISCORD_CALL_CONFIG: DiscordCallWidgetConfig = {
  title: 'Discord Call',
  layout: 'grid',
  showHeader: true,
  showChannelName: true,
  showNames: true,
  showStatusIcons: true,
  showSpeakingGlow: true,
  showOfflineState: true,
  useLinkedProfileNames: true,
  maxParticipants: 8,
  panelWidth: 480,
  panelMaxHeight: 360,
  outerPadding: 8,
  avatarSize: 72,
  avatarShape: 'circle',
  cardGap: 12,
  cardPadding: 14,
  speakingColor: '#23A55A',
  accentColor: '#5865F2',
  backgroundColor: '#111318',
  textColor: '#FFFFFF',
  mutedColor: '#F23F43',
  backgroundOpacity: 0.72,
  opacity: 1,
  scale: 1,
  fontFamily: 'Outfit',
  borderRadius: 18,
  glassIntensity: 0.55,
  animationStyle: 'slide',
  animationDuration: 450
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

const LEGACY_HEART_GIFT_IDS = ['7934', '5487', '5924', '5660', '5586', '11809', '14661', '14660', '14659', '14658', '14657', '14656', '15194', '6247', '10802']
const LEGACY_HEART_GIFT_NAMES = ['Heart Me', 'Finger Heart', 'Hand Heart', 'Hand Hearts', 'Hearts', 'Beating Heart', 'Infinite Heart', 'Crystal Heart', 'Devoted Heart', 'Blooming Heart', 'Budding Heart', 'Greeting Heart', 'United Heart', 'Heart', 'Heart Me Flex']

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
    secondaryColor: '#19C8FF',
    giftIds: ['5655', '8913', '24770', '59845', '56560', '8914', '17983', '16896', '17004', '19132', '15909', '14906', '54558', '14532'],
    giftNames: ['Rose', 'Rosa', 'Roses', 'Derby Rose', 'My First Rose', 'Forever Rosa', 'Rose Soundwave', 'Rose Hand', 'Rose Bear', 'Bouquet', 'Spring Bouquet', 'Fully Bloomed Sakura']
  },
  galaxy: {
    enabled: false,
    count: 50,
    speed: 0.8,
    scale: 1.0,
    primaryColor: '#9B59B6',
    secondaryColor: '#3498DB',
    triggerOn: 'galaxyGift',
    giftIds: ['11046', '15649', '6563', '6149', '9101', '9072', '7312'],
    giftNames: ['Galaxy', 'Galaxy Globe', 'Meteor Shower', 'Interstellar', 'TikTok Universe', 'TikTok Universe+']
  },
  ggs: {
    enabled: false,
    count: 20,
    speed: 1.0,
    scale: 1.0,
    color: '#00FF9D',
    text: 'GG',
    triggerOn: 'ggGift',
    giftIds: ['6064'],
    giftNames: ['GG']
  },
  heartMe: {
    enabled: false,
    count: 15,
    speed: 1.2,
    scale: 0.8,
    primaryColor: '#FF6B9D',
    secondaryColor: '#FF1493',
    giftIds: [...LEGACY_HEART_GIFT_IDS, '9967'],
    giftNames: [...LEGACY_HEART_GIFT_NAMES, 'Heart Puff']
  },
  bubbles: {
    enabled: false,
    count: 28,
    speed: 1.1,
    scale: 1,
    primaryColor: '#8BE9FD',
    secondaryColor: '#D8B4FE',
    giftIds: ['14084'],
    giftNames: ['Blow Bubbles']
  },
  confetti: {
    enabled: false,
    count: 36,
    speed: 1.1,
    scale: 1,
    primaryColor: '#FF7A45',
    secondaryColor: '#19C8FF',
    giftIds: ['5585', '7121'],
    giftNames: ['Confetti', 'Marvelous Confetti']
  },
  fireworks: {
    enabled: false,
    count: 28,
    speed: 1.4,
    scale: 1,
    primaryColor: '#FFD166',
    secondaryColor: '#FF4D8D',
    giftIds: ['6090', '7529'],
    giftNames: ['Fireworks', 'Mystery Firework']
  },
  lightning: {
    enabled: false,
    count: 18,
    speed: 1.8,
    scale: 1,
    primaryColor: '#F9F871',
    secondaryColor: '#19C8FF',
    giftIds: ['6652', '10649', '59511', '59313', '59512', '8419', '12678'],
    giftNames: ['Lightning Bolt', 'Red Lightning', 'Blue Lightning', 'Yellow Lightning', 'Level-up Sparks']
  },
  moneyRain: {
    enabled: false,
    count: 28,
    speed: 1.1,
    scale: 1,
    primaryColor: '#65E572',
    secondaryColor: '#7DE7FF',
    giftIds: ['7168', '5587', '16344', '11838', '10588', '7122'],
    giftNames: ['Money Gun', 'Gold Mine', 'Diamond', 'Diamond Gun', 'Gem Gun']
  },
  animationStyle: 'fade',
  animationDuration: 1000,
  audioThreshold: 0.05
}

/**
 * Fill missing particle layers for saved widgets while preserving every
 * explicit user choice. The one targeted selection upgrade below only applies
 * to the exact legacy heart defaults, so a customized gift list stays custom.
 */
export function resolveParticlesWidgetConfig(config: unknown): ParticlesWidgetConfig {
  const raw = asConfigRecord(config)
  const rawHeartMe = asConfigRecord(raw.heartMe)
  const heartMe = mergeParticleLayer(DEFAULT_PARTICLES_CONFIG.heartMe, rawHeartMe)
  const bubbles = mergeParticleLayer(DEFAULT_PARTICLES_CONFIG.bubbles, raw.bubbles)

  if (
    stringArraysEqual(rawHeartMe.giftIds, LEGACY_HEART_GIFT_IDS) &&
    stringArraysEqual(rawHeartMe.giftNames, LEGACY_HEART_GIFT_NAMES)
  ) {
    heartMe.giftIds = [...LEGACY_HEART_GIFT_IDS, '9967']
    heartMe.giftNames = [...LEGACY_HEART_GIFT_NAMES, 'Heart Puff']
  }

  // Existing "all effects" widgets predate the bubble layer. Keep their
  // intent intact by enabling the new mapping in-place; new and selectively
  // configured widgets still start with bubbles disabled.
  if (raw.bubbles === undefined && legacyGiftEffectsAreAllEnabled(raw)) {
    bubbles.enabled = true
  }

  return {
    followerHearts: mergeParticleLayer(DEFAULT_PARTICLES_CONFIG.followerHearts, raw.followerHearts),
    fallingRoses: mergeParticleLayer(DEFAULT_PARTICLES_CONFIG.fallingRoses, raw.fallingRoses),
    galaxy: mergeParticleLayer(DEFAULT_PARTICLES_CONFIG.galaxy, raw.galaxy),
    ggs: mergeParticleLayer(DEFAULT_PARTICLES_CONFIG.ggs, raw.ggs),
    heartMe,
    bubbles,
    confetti: mergeParticleLayer(DEFAULT_PARTICLES_CONFIG.confetti, raw.confetti),
    fireworks: mergeParticleLayer(DEFAULT_PARTICLES_CONFIG.fireworks, raw.fireworks),
    lightning: mergeParticleLayer(DEFAULT_PARTICLES_CONFIG.lightning, raw.lightning),
    moneyRain: mergeParticleLayer(DEFAULT_PARTICLES_CONFIG.moneyRain, raw.moneyRain),
    animationStyle: (raw.animationStyle as ParticlesWidgetConfig['animationStyle']) || DEFAULT_PARTICLES_CONFIG.animationStyle,
    animationDuration: Number(raw.animationDuration) || DEFAULT_PARTICLES_CONFIG.animationDuration,
    audioThreshold: raw.audioThreshold === undefined
      ? DEFAULT_PARTICLES_CONFIG.audioThreshold
      : Number(raw.audioThreshold)
  }
}

function asConfigRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function mergeParticleLayer<T extends object>(defaults: T, value: unknown): T {
  return { ...defaults, ...asConfigRecord(value) }
}

function stringArraysEqual(value: unknown, expected: string[]): boolean {
  return Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => String(item) === expected[index])
}

function legacyGiftEffectsAreAllEnabled(config: Record<string, unknown>): boolean {
  return ['fallingRoses', 'galaxy', 'ggs', 'heartMe', 'confetti', 'fireworks', 'lightning', 'moneyRain']
    .every((key) => asConfigRecord(config[key]).enabled === true)
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
  maxItems: 5,
  fadeOutAfterSeconds: 30,
  position: 'top-left',
  opacity: 1.0,
  scale: 1.0,
  backgroundOpacity: 0.65,
  blur: 40,
  aspectRatio: 'tiktok',
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
  // minutes can read as "the live leaderboard stopped."
  lifetimeGlimpseEnabled: false,
  streamWindowMinutes: 4,
  lifetimeWindowMinutes: 1,
  lifetimeTitle: 'All-Time Top Likers',
  showPulsingHeart: true
}
