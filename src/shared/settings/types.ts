import {
  DEFAULT_AUTO_RELAY_PLATFORMS,
  resolveRelayPlatformParticipation,
  resolveRelayTagMode,
  type RelayPlatformParticipation,
  type RelayTagMode
} from '../chat-relay'
import {
  DEFAULT_KOKORO_VOICE,
  DEFAULT_TTS_PROVIDER,
  ELEVENLABS_DEFAULT_VOICE_ID,
  isKokoroVoiceId,
  type TTSVoiceProvider
} from '../tts-providers'
import {
  DEFAULT_ALERT_RULES,
  type AlertRule
} from '../alert-rules'

export const DEFAULT_TTS_COMMAND_PREFIXES = ['!tts', '!say', '!speak']
export const DEFAULT_TTS_CHAT_MESSAGE_TEMPLATE = '{displayName} says: {message}'

/**
 * Local (Kokoro) voice model precision. fp32 sounds cleanest but holds
 * ~330MB of weights in memory; q8 is nearly as clean at ~90MB.
 */
export type KokoroQuality = 'fp32' | 'q8'
export const DEFAULT_KOKORO_QUALITY: KokoroQuality = 'fp32'

export interface VoiceModifiers {
  radioFilter: boolean
  speedRamping: boolean
  pitchShifting: 'low' | 'normal' | 'high' | 'dynamic'
}

export interface ElevenLabsApiKeyEntry {
  id: string
  label: string
  apiKey: string
}

export type AppTheme = 'dark' | 'midnight' | 'aurora' | 'ember' | 'light' | 'gob' | 'synthwave' | 'graphite' | 'custom'
export type InterfaceDensity = 'comfortable' | 'compact'

export type TTSAudiencePermission = 
  | 'everyone' 
  | 'followers' 
  | 'fanClub' 
  | 'subscribers' 
  | 'moderators' 
  | 'teamMembers' 
  | 'vips'


export interface TTSUserVoiceOverride {
  id: string
  platform: 'all' | 'tiktok' | 'twitch' | 'youtube' | 'kick'
  username: string
  viewerProfileId?: string
  mode: 'profile' | 'custom'
  voiceProfileId: string
  provider: TTSVoiceProvider
  voiceName: string
  kokoroVoice: string
  elevenlabsVoiceId: string
  elevenlabsApiKeyId?: string
  elevenlabsStability: number
  elevenlabsSimilarity: number
  elevenlabsStyle: number
  lang: string
  pitch: number
  rate: number
  volume: number
  enabled: boolean
}

export type TTSUserVoiceOverridePlatform = TTSUserVoiceOverride['platform']

/**
 * A sound that plays when a specific viewer joins the stream. Scoped either to
 * a linked viewer profile (preferred — follows the viewer across platforms) or
 * to a raw platform+username pair.
 */
export interface ViewerJoinSound {
  id: string
  /** Linked viewer profile id; empty when scoped by username. */
  viewerProfileId: string
  platform: 'all' | 'tiktok' | 'twitch' | 'youtube' | 'kick'
  username: string
  /** Soundboard sound id, e.g. "board/airhorn.mp3". */
  soundId: string
  volume: number
  /** Minutes before the same viewer's join sound can fire again. 0 = every join. */
  cooldownMinutes: number
  enabled: boolean
}

export interface AutomationKeystrokeMapping {
  id: string
  type: 'chat-command' | 'gift'
  trigger: string
  key: string
  modifiers: ('ctrl' | 'alt' | 'shift' | 'meta')[]
  enabled: boolean
}

// --- NAMESPACED SETTINGS ---

export interface TTSSettings {
  enabled: boolean
  maxLength: number
  minLength: number
  duplicateWindow: number
  perUserLimit: number
  requireCommand: boolean
  commandPrefixes: string[]
  chatMessageTemplate: string
  allowedRoles: TTSAudiencePermission[]
  chatVoiceProfileId: string
  giftVoiceProfileId: string
  subscriptionVoiceProfileId: string
  onlySubsAndMods: boolean
  userVoiceOverrides: TTSUserVoiceOverride[]
  readAtSymbol: boolean
  skipMessagesStartingWithAt: boolean
  ignoreEmotes: boolean
  volume: number
  modifiers: VoiceModifiers
  kokoroQuality: KokoroQuality
}

export interface AlertVisualSettings {
  enabled: boolean
  assetId: string
  template: string
  color: string
  backgroundColor: string
  borderColor: string
  fontSize: number
  fontWeight: number
  textShadow: string
  layout: 'stacked' | 'side-by-side' | 'text-only' | 'image-only'
  animationIn: 'fade' | 'slide' | 'bounce' | 'zoom'
  animationOut: 'fade' | 'slide' | 'tv-warp'
  durationMs: number
  imageTop: number
  imageLeft: number
  soundEnabled: boolean
  soundId: string
  soundVolume: number
}

export interface AlertSettings {
  rules: AlertRule[]
  gift: AlertVisualSettings
  follow: AlertVisualSettings
  superfan: AlertVisualSettings
  top: number
  left: number
}

export interface ChatSettings {
  maxMessages: number
  autoRelayEnabled: boolean
  hostResponsesEnabled: boolean
  relayTagMode: RelayTagMode
  autoRelayPlatforms: RelayPlatformParticipation
}

export interface AISettings {
  enabled: boolean
  requireCommand: boolean
  commandPrefixes: string[]
  voiceProfileId: string
  speechPrefix: string
  apiKey: string
  model: string
  endpoint: string
  systemPrompt: string
  maxTokens: number
}

export interface SpotifySettings {
  clientId: string
  accessToken: string
  refreshToken: string
  tokenExpiresAt: number
  songRequestsEnabled: boolean
  playEnabled: boolean
  skipEnabled: boolean
  allowExplicit: boolean
  maxQueueLength: number
  maxPerUser: number
  userId: string
  displayName: string
  votesRequired: number
}

export interface GoalSettings {
  follower: { enabled: boolean; title: string; target: number; color: string }
  subscriber: { enabled: boolean; title: string; target: number; color: string }
  giftValue: { enabled: boolean; title: string; target: number; color: string }
}

export interface IntegrationSettings {
  obs: { enabled: boolean; host: string; port: number; password: string }
  govee: { apiKey: string; selectedDeviceIds: string[]; flashOnFollow: boolean; flashOnGift: boolean; flashDurationMs: number }
  hue: { bridgeIp: string; username: string; selectedLightIds: string[]; flashOnFollow: boolean; flashOnGift: boolean; flashDurationMs: number }
  voicemod: { enabled: boolean; host: string; apiKey: string }
  vtube: { enabled: boolean; host: string; port: number; token: string }
  discord: { enabled: boolean; webhookUrl: string; botToken: string }
  streamerbot: { enabled: boolean; wsUrl: string }
}

export interface UISettings {
  theme: AppTheme
  accentColor: string
  density: InterfaceDensity
  reducedMotion: boolean
  /** Global interface zoom, 0.8–1.3. 1 = 100%. */
  uiScale: number
  /** Base surface color when theme === 'custom'; the rest of the palette is derived. */
  customBackground: string
  /** Secondary/gradient color when theme === 'custom'. */
  customSecondary: string
}

export interface StreamingSettings {
  enabled: boolean
  rtmpUrl: string
  streamKey: string
  bitrate: number
  fps: number
  width: number
  height: number
}

export interface AppSettings {
  tts: TTSSettings
  alerts: AlertSettings
  chat: ChatSettings
  ai: AISettings
  spotify: SpotifySettings
  goals: GoalSettings
  integrations: IntegrationSettings
  ui: UISettings
  streaming: StreamingSettings
  audio: { outputDeviceId: string }
  automation: { enabled: boolean; keystrokeMapping: AutomationKeystrokeMapping[] }
  platform: { autoReconnect: boolean }
  overlay: { port: number }
  [key: string]: any
  
  // Flat aliases for UI compatibility (Runtime managed by resolveAppSettings)
  theme: AppTheme
  accentColor: string
  interfaceDensity: InterfaceDensity
  reducedMotion: boolean
  chatMaxMessages: number
  chatHostResponsesEnabled: boolean
  obsHost: string
  obsPort: number
  obsPassword: string
  obsEnabled: boolean
  streamerbotEnabled: boolean
  streamerbotWsUrl: string
  streamingWidth: number
  streamingHeight: number
  aiEnabled: boolean
  aiRequireCommand: boolean
  aiCommandPrefixes: string[]
  aiVoiceProfileId: string
  aiSpeechPrefix: string
  ttsChatMessageTemplate: string
  elevenlabsApiKey: string
  elevenlabsApiKeys: ElevenLabsApiKeyEntry[]
  elevenlabsDefaultApiKeyId: string
  /**
   * When true, alert sounds also play in the app (local monitoring) even while
   * an overlay browser source is connected. Off by default so users who monitor
   * their OBS overlay audio don't hear every alert twice.
   */
  alertSoundLocalMonitoring: boolean
  /** Per-viewer join sounds, managed from the viewer profile page. */
  viewerJoinSounds: ViewerJoinSound[]
}

export type AppSettingKey = string // Simplified for broad compatibility
