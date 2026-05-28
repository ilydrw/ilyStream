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

export interface VoiceModifiers {
  radioFilter: boolean
  speedRamping: boolean
  pitchShifting: 'low' | 'normal' | 'high' | 'dynamic'
}

export type AppTheme = 'dark' | 'midnight' | 'aurora' | 'ember' | 'light' | 'joker'
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
  mode: 'profile' | 'custom'
  voiceProfileId: string
  provider: TTSVoiceProvider
  voiceName: string
  kokoroVoice: string
  elevenlabsVoiceId: string
  elevenlabsStability: number
  elevenlabsSimilarity: number
  elevenlabsStyle: number
  lang: string
  pitch: number
  rate: number
  volume: number
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
}

export type AppSettingKey = string // Simplified for broad compatibility
