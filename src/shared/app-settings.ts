import {
  DEFAULT_AUTO_RELAY_PLATFORMS,
  resolveRelayPlatformParticipation,
  resolveRelayTagMode,
  type RelayPlatformParticipation,
  type RelayTagMode
} from './chat-relay'
import {
  DEFAULT_KOKORO_VOICE,
  DEFAULT_TTS_PROVIDER,
  ELEVENLABS_DEFAULT_VOICE_ID,
  isKokoroVoiceId,
  type TTSVoiceProvider
} from './tts-providers'
import {
  ALERT_RULE_EVENT_TYPES,
  ALERT_RULE_PLATFORMS,
  DEFAULT_ALERT_RULES,
  type AlertRule,
  type AlertRuleAnimationIn,
  type AlertRuleAnimationOut,
  type AlertRuleEventType,
  type AlertRuleLayout,
  type AlertRulePlatform
} from './alert-rules'

export interface VoiceModifiers {
  radioFilter: boolean
  speedRamping: boolean
  pitchShifting: 'low' | 'normal' | 'high' | 'dynamic'
}

export type AppTheme = 'dark' | 'midnight' | 'aurora' | 'ember' | 'light'
export type InterfaceDensity = 'comfortable' | 'compact'

export interface AppSettings {
  ttsEnabled: boolean
  ttsMaxLength: number
  ttsDuplicateWindow: number
  ttsPerUserLimit: number
  ttsRequireCommand: boolean
  ttsCommandPrefixes: string[]
  ttsAllowedRoles: TTSAudiencePermission[]
  ttsChatVoiceProfileId: string
  ttsGiftVoiceProfileId: string
  ttsSubscriptionVoiceProfileId: string
  alertRules: AlertRule[]
  eventSoundGiftEnabled: boolean
  eventSoundGiftSoundId: string
  eventSoundGiftVolume: number
  eventSoundFollowEnabled: boolean
  eventSoundFollowSoundId: string
  eventSoundFollowVolume: number
  eventSoundSuperfanEnabled: boolean
  eventSoundSuperfanSoundId: string
  eventSoundSuperfanVolume: number
  eventImageGiftEnabled: boolean
  eventImageGiftAssetId: string
  eventAlertGiftImageTop: number
  eventAlertGiftImageLeft: number
  eventImageFollowEnabled: boolean
  eventImageFollowAssetId: string
  eventAlertFollowImageTop: number
  eventAlertFollowImageLeft: number
  eventImageSuperfanEnabled: boolean
  eventImageSuperfanAssetId: string
  eventAlertSuperfanImageTop: number
  eventAlertSuperfanImageLeft: number
  eventTextGiftEnabled: boolean
  eventTextGiftTemplate: string
  eventTextGiftColor: string
  eventTextGiftBackgroundColor: string
  eventTextGiftBorderColor: string
  eventTextGiftFontSize: number
  eventTextFollowEnabled: boolean
  eventTextFollowTemplate: string
  eventTextFollowColor: string
  eventTextFollowBackgroundColor: string
  eventTextFollowBorderColor: string
  eventTextFollowFontSize: number
  eventTextSuperfanEnabled: boolean
  eventTextSuperfanTemplate: string
  eventTextSuperfanColor: string
  eventTextSuperfanBackgroundColor: string
  eventTextSuperfanBorderColor: string
  eventTextSuperfanFontSize: number
  eventAlertGiftLayout: 'stacked' | 'side-by-side' | 'text-only' | 'image-only'
  eventAlertGiftAnimationIn: 'fade' | 'slide' | 'bounce' | 'zoom'
  eventAlertGiftAnimationOut: 'fade' | 'slide' | 'tv-warp'
  eventAlertGiftDurationMs: number
  eventAlertGiftTextShadow: string
  eventAlertGiftFontWeight: number
  eventAlertFollowLayout: 'stacked' | 'side-by-side' | 'text-only' | 'image-only'
  eventAlertFollowAnimationIn: 'fade' | 'slide' | 'bounce' | 'zoom'
  eventAlertFollowAnimationOut: 'fade' | 'slide' | 'tv-warp'
  eventAlertFollowDurationMs: number
  eventAlertFollowTextShadow: string
  eventAlertFollowFontWeight: number
  eventAlertSuperfanLayout: 'stacked' | 'side-by-side' | 'text-only' | 'image-only'
  eventAlertSuperfanAnimationIn: 'fade' | 'slide' | 'bounce' | 'zoom'
  eventAlertSuperfanAnimationOut: 'fade' | 'slide' | 'tv-warp'
  eventAlertSuperfanDurationMs: number
  eventAlertSuperfanTextShadow: string
  eventAlertSuperfanFontWeight: number
  chatMaxMessages: number
  chatAutoRelayEnabled: boolean
  chatRelayTagMode: RelayTagMode
  chatAutoRelayPlatforms: RelayPlatformParticipation
  overlayPort: number
  obsEnabled: boolean
  obsHost: string
  obsPort: number
  obsPassword: string
  theme: AppTheme
  accentColor: string
  interfaceDensity: InterfaceDensity
  reducedMotion: boolean
  aiEnabled: boolean
  aiApiKey: string
  aiModel: string
  aiEndpoint: string
  aiSystemPrompt: string
  aiMaxTokens: number
  ttsOnlySubsAndMods: boolean
  ttsMinLength: number
  ttsUserVoiceOverrides: TTSUserVoiceOverride[]
  elevenlabsApiKey: string
  spotifyClientId: string
  spotifyAccessToken: string
  spotifyRefreshToken: string
  spotifyTokenExpiresAt: number
  spotifySongRequestsEnabled: boolean
  spotifyPlayEnabled: boolean
  spotifySkipEnabled: boolean
  spotifyAllowExplicit: boolean
  spotifyMaxQueueLength: number
  spotifyMaxPerUser: number
  spotifyUserId: string
  spotifyDisplayName: string
  spotifyVotesRequired: number
  goalFollowerEnabled: boolean
  goalFollowerTitle: string
  goalFollowerTarget: number
  goalFollowerColor: string
  goalSubscriberEnabled: boolean
  goalSubscriberTitle: string
  goalSubscriberTarget: number
  goalSubscriberColor: string
  goalGiftValueEnabled: boolean
  goalGiftValueTitle: string
  goalGiftValueTarget: number
  goalGiftValueColor: string
  ttsReadAtSymbol: boolean
  ttsSkipMessagesStartingWithAt: boolean
  ttsIgnoreEmotes: boolean
  audioOutputDeviceId: string
  automationEnabled: boolean
  automationKeystrokeMapping: AutomationKeystrokeMapping[]

  // Govee Integration
  goveeApiKey: string
  goveeSelectedDeviceIds: string[]
  goveeFlashOnFollow: boolean
  goveeFlashOnGift: boolean
  goveeFlashDurationMs: number

  // Hue Integration
  hueBridgeIp: string
  hueUsername: string
  hueSelectedLightIds: string[]
  hueFlashOnFollow: boolean
  hueFlashOnGift: boolean
  hueFlashDurationMs: number

  // Voicemod Integration
  voicemodEnabled: boolean
  voicemodHost: string
  voicemodApiKey: string

  // VTube Studio Integration
  vtubeEnabled: boolean
  vtubeHost: string
  vtubePort: number
  vtubeToken: string

  // Discord Integration
  discordEnabled: boolean
  discordWebhookUrl: string
  discordBotToken: string

  // Minigame Settings
  physicsOverlayEnabled: boolean
  physicsGravity: number

  // Streaming Settings
  streamingEnabled: boolean
  streamingRtmpUrl: string
  streamingStreamKey: string
  streamingBitrate: number
  streamingFps: number
  streamingWidth: number
  streamingHeight: number
  
  // Alert Position
  alertTop: number
  alertLeft: number
}

export interface AutomationKeystrokeMapping {
  id: string
  type: 'chat-command' | 'gift'
  trigger: string // command name or gift name
  key: string // e.g. "space", "enter", "f5"
  modifiers: ('ctrl' | 'alt' | 'shift' | 'meta')[]
  enabled: boolean
}

export type AppSettingKey = keyof AppSettings

export type TTSUserVoiceOverridePlatform = 'all' | 'tiktok' | 'twitch' | 'youtube' | 'kick'
export type TTSUserVoiceOverrideMode = 'profile' | 'custom'
export type TTSAudiencePermission =
  | 'everyone'
  | 'followers'
  | 'fanClub'
  | 'subscribers'
  | 'moderators'
  | 'teamMembers'
  | 'vips'

export const DEFAULT_TTS_COMMAND_PREFIXES = ['!tts', '!say', '!speak']
export const TTS_AUDIENCE_PERMISSIONS: TTSAudiencePermission[] = [
  'everyone',
  'followers',
  'fanClub',
  'subscribers',
  'moderators',
  'teamMembers',
  'vips'
]

export interface TTSUserVoiceOverride {
  id: string
  platform: TTSUserVoiceOverridePlatform
  username: string
  mode: TTSUserVoiceOverrideMode
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

export const DEFAULT_APP_SETTINGS: AppSettings = {
  ttsEnabled: true,
  ttsMaxLength: 500,
  ttsDuplicateWindow: 30,
  ttsPerUserLimit: 3,
  ttsRequireCommand: true,
  ttsCommandPrefixes: DEFAULT_TTS_COMMAND_PREFIXES,
  ttsAllowedRoles: ['everyone'],
  ttsChatVoiceProfileId: '',
  ttsGiftVoiceProfileId: '',
  ttsSubscriptionVoiceProfileId: '',
  alertRules: DEFAULT_ALERT_RULES,
  eventSoundGiftEnabled: true,
  eventSoundGiftSoundId: '',
  eventSoundGiftVolume: 1,
  eventSoundFollowEnabled: true,
  eventSoundFollowSoundId: '',
  eventSoundFollowVolume: 1,
  eventSoundSuperfanEnabled: true,
  eventSoundSuperfanSoundId: '',
  eventSoundSuperfanVolume: 1,
  eventImageGiftEnabled: true,
  eventImageGiftAssetId: '',
  eventAlertGiftImageTop: 0,
  eventAlertGiftImageLeft: 0,
  eventImageFollowEnabled: true,
  eventImageFollowAssetId: '',
  eventAlertFollowImageTop: 0,
  eventAlertFollowImageLeft: 0,
  eventImageSuperfanEnabled: true,
  eventImageSuperfanAssetId: '',
  eventAlertSuperfanImageTop: 0,
  eventAlertSuperfanImageLeft: 0,
  eventTextGiftEnabled: true,
  eventTextGiftTemplate: '{displayName} sent {giftCount}x {giftName}!',
  eventTextGiftColor: '#ffffff',
  eventTextGiftBackgroundColor: 'rgba(0, 0, 0, 0.05)',
  eventTextGiftBorderColor: 'gradient',
  eventTextGiftFontSize: 48,
  eventTextFollowEnabled: true,
  eventTextFollowTemplate: '{displayName} is now following!',
  eventTextFollowColor: '#ffffff',
  eventTextFollowBackgroundColor: 'rgba(0, 0, 0, 0.05)',
  eventTextFollowBorderColor: 'gradient',
  eventTextFollowFontSize: 44,
  eventTextSuperfanEnabled: true,
  eventTextSuperfanTemplate: '{displayName} joined the Superfan club!',
  eventTextSuperfanColor: '#fef3c7',
  eventTextSuperfanBackgroundColor: 'rgba(0, 0, 0, 0.05)',
  eventTextSuperfanBorderColor: 'gradient',
  eventTextSuperfanFontSize: 46,
  eventAlertGiftLayout: 'stacked',
  eventAlertGiftAnimationIn: 'bounce',
  eventAlertGiftAnimationOut: 'fade',
  eventAlertGiftDurationMs: 5000,
  eventAlertGiftTextShadow: '0 4px 12px rgba(0,0,0,0.5)',
  eventAlertGiftFontWeight: 800,
  eventAlertFollowLayout: 'stacked',
  eventAlertFollowAnimationIn: 'fade',
  eventAlertFollowAnimationOut: 'fade',
  eventAlertFollowDurationMs: 5000,
  eventAlertFollowTextShadow: '0 4px 12px rgba(0,0,0,0.5)',
  eventAlertFollowFontWeight: 800,
  eventAlertSuperfanLayout: 'stacked',
  eventAlertSuperfanAnimationIn: 'zoom',
  eventAlertSuperfanAnimationOut: 'fade',
  eventAlertSuperfanDurationMs: 5000,
  eventAlertSuperfanTextShadow: '0 4px 12px rgba(0,0,0,0.5)',
  eventAlertSuperfanFontWeight: 800,
  chatMaxMessages: 500,
  chatAutoRelayEnabled: false,
  chatRelayTagMode: 'platform-and-user',
  chatAutoRelayPlatforms: DEFAULT_AUTO_RELAY_PLATFORMS,
  overlayPort: 8899,
  obsEnabled: false,
  obsHost: '127.0.0.1',
  obsPort: 4455,
  obsPassword: '',
  theme: 'dark',
  accentColor: '#19c8ff',
  interfaceDensity: 'comfortable',
  reducedMotion: false,
  aiEnabled: false,
  aiApiKey: '',
  aiModel: 'gpt-4',
  aiEndpoint: 'https://api.antigravity.com/v1/chat/completions',
  aiSystemPrompt: 'You are ilyStream AI, a raunchy, edgy, and provocative co-host for a livestream. You are extremely funny, slightly horny, and never hold back. Use modern slang, be a bit of a degenerate, and keep the audience entertained with spicy takes. You are aware of the music commands (!play, .play, /play) which viewers can use to request songs. Keep responses concise but impactful.',
  aiMaxTokens: 500,
  ttsOnlySubsAndMods: false,
  ttsMinLength: 1,
  ttsUserVoiceOverrides: [],
  elevenlabsApiKey: '',
  spotifyClientId: '',
  spotifyAccessToken: '',
  spotifyRefreshToken: '',
  spotifyTokenExpiresAt: 0,
  spotifySongRequestsEnabled: true,
  spotifyPlayEnabled: true,
  spotifySkipEnabled: true,
  spotifyAllowExplicit: true,
  spotifyMaxQueueLength: 0,
  spotifyMaxPerUser: 3,
  spotifyUserId: '',
  spotifyDisplayName: '',
  spotifyVotesRequired: 3,
  goalFollowerEnabled: false,
  goalFollowerTitle: 'Follower Goal',
  goalFollowerTarget: 100,
  goalFollowerColor: '#00a3ff',
  goalSubscriberEnabled: false,
  goalSubscriberTitle: 'Subscriber Goal',
  goalSubscriberTarget: 50,
  goalSubscriberColor: '#d946ef',
  goalGiftValueEnabled: false,
  goalGiftValueTitle: 'Daily Gift Goal',
  goalGiftValueTarget: 5000,
  goalGiftValueColor: '#10b981',
  ttsReadAtSymbol: false,
  ttsSkipMessagesStartingWithAt: false,
  ttsIgnoreEmotes: true,
  ttsVolume: 0.8,
  voiceModifiers: {
    radioFilter: false,
    speedRamping: true,
    pitchShifting: 'normal'
  },
  audioOutputDeviceId: 'default',
  automationEnabled: false,
  automationKeystrokeMapping: [],

  // Govee
  goveeApiKey: '',
  goveeSelectedDeviceIds: [],
  goveeFlashOnFollow: true,
  goveeFlashOnGift: true,
  goveeFlashDurationMs: 5000,

  // Hue
  hueBridgeIp: '',
  hueUsername: '',
  hueSelectedLightIds: [],
  hueFlashOnFollow: true,
  hueFlashOnGift: true,
  hueFlashDurationMs: 5000,

  // Voicemod
  voicemodEnabled: false,
  voicemodHost: '127.0.0.1',
  voicemodApiKey: '',

  // VTube Studio
  vtubeEnabled: false,
  vtubeHost: '127.0.0.1',
  vtubePort: 8001,
  vtubeToken: '',

  // Discord
  discordEnabled: false,
  discordWebhookUrl: '',
  discordBotToken: '',

  // Minigame
  physicsOverlayEnabled: false,
  physicsGravity: 1.0,

  // Streaming
  streamingEnabled: false,
  streamingRtmpUrl: 'rtmp://ingest.global-contribute.live-video.net/app',
  streamingStreamKey: '',
  streamingBitrate: 6000,
  streamingFps: 60,
  streamingWidth: 1920,
  streamingHeight: 1080,
  alertTop: 10,
  alertLeft: 50
}

const NUMBER_RANGES: Record<
  Extract<
    AppSettingKey,
    | 'ttsMaxLength'
    | 'ttsMinLength'
    | 'ttsDuplicateWindow'
    | 'ttsPerUserLimit'
    | 'chatMaxMessages'
    | 'overlayPort'
    | 'obsPort'
    | 'streamingBitrate'
    | 'streamingFps'
    | 'streamingWidth'
    | 'streamingHeight'
    | 'spotifyMaxQueueLength'
    | 'spotifyMaxPerUser'
    | 'goalFollowerTarget'
    | 'goalSubscriberTarget'
    | 'goalGiftValueTarget'
    | 'aiMaxTokens'
    | 'eventTextGiftFontSize'
    | 'eventTextFollowFontSize'
    | 'eventTextSuperfanFontSize'
    | 'eventAlertGiftImageTop'
    | 'eventAlertGiftImageLeft'
    | 'eventAlertFollowImageTop'
    | 'eventAlertFollowImageLeft'
    | 'eventAlertSuperfanImageTop'
    | 'eventAlertSuperfanImageLeft'
    | 'alertTop'
    | 'alertLeft'
  >,
  { min: number; max: number }
> = {
  ttsMaxLength: { min: 20, max: 1000 },
  ttsMinLength: { min: 0, max: 100 },
  ttsDuplicateWindow: { min: 5, max: 120 },
  ttsPerUserLimit: { min: 1, max: 20 },
  chatMaxMessages: { min: 100, max: 5000 },
  overlayPort: { min: 1024, max: 65535 },
  obsPort: { min: 1, max: 65535 },
  streamingBitrate: { min: 500, max: 51000 },
  streamingFps: { min: 24, max: 240 },
  streamingWidth: { min: 640, max: 7680 },
  streamingHeight: { min: 360, max: 4320 },
  spotifyMaxQueueLength: { min: 0, max: 500 },
  spotifyMaxPerUser: { min: 1, max: 50 },
  goalFollowerTarget: { min: 1, max: 1000000 },
  goalSubscriberTarget: { min: 1, max: 1000000 },
  goalGiftValueTarget: { min: 1, max: 10000000 },
  aiMaxTokens: { min: 10, max: 4096 },
  eventTextGiftFontSize: { min: 16, max: 120 },
  eventTextFollowFontSize: { min: 16, max: 120 },
  eventTextSuperfanFontSize: { min: 16, max: 120 },
  eventAlertGiftImageTop: { min: -1000, max: 1000 },
  eventAlertGiftImageLeft: { min: -1000, max: 1000 },
  eventAlertFollowImageTop: { min: -1000, max: 1000 },
  eventAlertFollowImageLeft: { min: -1000, max: 1000 },
  eventAlertSuperfanImageTop: { min: -1000, max: 1000 },
  eventAlertSuperfanImageLeft: { min: -1000, max: 1000 },
  alertTop: { min: 0, max: 100 },
  alertLeft: { min: 0, max: 100 }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function resolveProfileId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function resolveAssetId(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  // Allow forward slashes for category-prefixed IDs (e.g. "alerts/filename.mp3")
  if (!trimmed || trimmed.includes('\\')) return ''
  return trimmed
}

function resolveSoundId(value: unknown): string {
  const assetId = resolveAssetId(value)
  return /\.(mp3|wav)$/i.test(assetId) ? assetId : ''
}

function resolveHexColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback

  const trimmed = value.trim()
  if (trimmed === '' || trimmed.toLowerCase() === 'transparent') return ''
  return /^#[0-9a-f]{6,8}$/i.test(trimmed) ? trimmed.toLowerCase() : fallback
}

function resolveUserVoiceOverrides(value: unknown): TTSUserVoiceOverride[] {
  if (!Array.isArray(value)) return []

  const overrides: TTSUserVoiceOverride[] = []
  const seen = new Set<string>()

  for (const item of value) {
    if (!item || typeof item !== 'object') continue

    const record = item as Record<string, unknown>
    const username = normalizeUsername(record.username)
    const voiceProfileId = resolveProfileId(record.voiceProfileId)
    const platform = resolveOverridePlatform(record.platform)
    const mode = resolveOverrideMode(record.mode, voiceProfileId)
    const provider = resolveTTSProvider(record.provider)

    if (!username) continue
    if (mode === 'profile' && !voiceProfileId) continue

    const dedupeKey = `${platform}:${username}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    overrides.push({
      id: typeof record.id === 'string' && record.id.trim() ? record.id.trim() : dedupeKey,
      platform,
      username,
      mode,
      voiceProfileId,
      provider,
      voiceName: typeof record.voiceName === 'string' ? record.voiceName.trim() : '',
      kokoroVoice:
        typeof record.kokoroVoice === 'string' && isKokoroVoiceId(record.kokoroVoice)
          ? record.kokoroVoice
          : DEFAULT_KOKORO_VOICE,
      elevenlabsVoiceId:
        typeof record.elevenlabsVoiceId === 'string' && record.elevenlabsVoiceId.trim()
          ? record.elevenlabsVoiceId.trim()
          : ELEVENLABS_DEFAULT_VOICE_ID,
      elevenlabsStability: resolveDecimal(record.elevenlabsStability, 0.5, 0, 1),
      elevenlabsSimilarity: resolveDecimal(record.elevenlabsSimilarity, 0.8, 0, 1),
      elevenlabsStyle: resolveDecimal(record.elevenlabsStyle, 0, 0, 1),
      lang: typeof record.lang === 'string' && record.lang.trim() ? record.lang.trim() : 'en-US',
      pitch: resolveDecimal(record.pitch, 1, 0.1, 2),
      rate: resolveDecimal(record.rate, 1, 0.1, 3),
      volume: resolveDecimal(record.volume, 1, 0, 1),
      enabled: record.enabled !== false
    })
  }

  return overrides
}

function resolveCommandPrefixes(value: unknown): string[] {
  const rawValues =
    Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? /[,\s]/.test(value)
          ? value.split(/[,\s]+/)
          : [...value]
        : DEFAULT_TTS_COMMAND_PREFIXES

  const prefixes: string[] = []
  const seen = new Set<string>()

  for (const rawValue of rawValues) {
    if (typeof rawValue !== 'string') continue

    const prefix = rawValue.trim()
    if (!prefix || /\s/.test(prefix) || prefix.length > 5 || seen.has(prefix)) continue
    prefixes.push(prefix)
    seen.add(prefix)
    if (prefixes.length >= 8) return prefixes
  }

  return prefixes.length > 0 ? prefixes : DEFAULT_TTS_COMMAND_PREFIXES
}

function resolveAudiencePermissions(value: unknown): TTSAudiencePermission[] {
  if (!Array.isArray(value)) return ['everyone']

  const allowed = value.filter((item): item is TTSAudiencePermission =>
    TTS_AUDIENCE_PERMISSIONS.includes(item as TTSAudiencePermission)
  )

  if (allowed.includes('everyone')) return ['everyone']

  const deduped = [...new Set(allowed)]
  return deduped.length > 0 ? deduped : ['everyone']
}

function resolveAlertRules(value: unknown): AlertRule[] {
  if (!Array.isArray(value)) return DEFAULT_ALERT_RULES.map(rule => ({ ...rule }))

  const rules: AlertRule[] = []
  const seen = new Set<string>()

  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const id = typeof record.id === 'string' && record.id.trim()
      ? record.id.trim()
      : `alert-${rules.length + 1}`
    if (seen.has(id)) continue
    seen.add(id)

    const platforms = resolveAlertPlatforms(record.platforms)
    const eventTypes = resolveAlertEventTypes(record.eventTypes)
    if (eventTypes.length === 0) continue

    rules.push({
      id,
      name: typeof record.name === 'string' && record.name.trim() ? record.name.trim().slice(0, 80) : 'Alert route',
      enabled: record.enabled !== false,
      platforms,
      eventTypes,
      priority: resolveInteger(record.priority, 0, 0, 999),
      cooldownMs: resolveInteger(record.cooldownMs, 0, 0, 3_600_000),
      minGiftCount: resolveInteger(record.minGiftCount, 0, 0, 999_999),
      minAmountCents: resolveInteger(record.minAmountCents, 0, 0, 100_000_000),
      keyword: typeof record.keyword === 'string' ? record.keyword.trim().slice(0, 120) : '',
      soundEnabled: Boolean(record.soundEnabled),
      soundId: resolveSoundId(record.soundId),
      soundVolume: resolveDecimal(record.soundVolume, 1, 0, 1),
      imageEnabled: Boolean(record.imageEnabled),
      imageAssetId: resolveAssetId(record.imageAssetId),
      useEventImage: record.useEventImage !== false,
      textEnabled: record.textEnabled !== false,
      textTemplate: typeof record.textTemplate === 'string' ? record.textTemplate.slice(0, 500) : '',
      textColor: resolveHexColor(record.textColor, '#ffffff') || '#ffffff',
      backgroundColor: typeof record.backgroundColor === 'string' ? record.backgroundColor : 'rgba(0, 0, 0, 0.05)',
      borderColor: typeof record.borderColor === 'string' ? record.borderColor : 'gradient',
      fontSize: resolveInteger(record.fontSize, 44, 16, 128),
      fontWeight: resolveInteger(record.fontWeight, 800, 100, 900),
      textShadow: typeof record.textShadow === 'string' ? record.textShadow.slice(0, 160) : '0 4px 12px rgba(0,0,0,0.5)',
      layout: resolveAlertLayout(record.layout),
      animationIn: resolveAlertAnimationIn(record.animationIn),
      animationOut: resolveAlertAnimationOut(record.animationOut),
      durationMs: resolveInteger(record.durationMs, 5000, 500, 30000),
      imageTop: resolveInteger(record.imageTop, 0, -1000, 1000),
      imageLeft: resolveInteger(record.imageLeft, 0, -1000, 1000)
    })
  }

  return rules.length > 0 ? rules : DEFAULT_ALERT_RULES.map(rule => ({ ...rule }))
}

function resolveAlertPlatforms(value: unknown): AlertRulePlatform[] {
  if (!Array.isArray(value)) return ['all']
  const platforms = value.filter((item): item is AlertRulePlatform =>
    ALERT_RULE_PLATFORMS.includes(item as AlertRulePlatform)
  )
  const deduped = [...new Set(platforms)]
  return deduped.length > 0 ? (deduped.includes('all') ? ['all'] : deduped) : ['all']
}

function resolveAlertEventTypes(value: unknown): AlertRuleEventType[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is AlertRuleEventType =>
    ALERT_RULE_EVENT_TYPES.includes(item as AlertRuleEventType)
  ))]
}

function resolveAlertLayout(value: unknown): AlertRuleLayout {
  return value === 'side-by-side' || value === 'text-only' || value === 'image-only' ? value : 'stacked'
}

function resolveAlertAnimationIn(value: unknown): AlertRuleAnimationIn {
  return value === 'slide' || value === 'bounce' || value === 'zoom' ? value : 'fade'
}

function resolveAlertAnimationOut(value: unknown): AlertRuleAnimationOut {
  return value === 'slide' || value === 'tv-warp' ? value : 'fade'
}

function resolveInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numericValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numericValue) ? clamp(Math.round(numericValue), min, max) : fallback
}

function resolveOverrideMode(value: unknown, voiceProfileId: string): TTSUserVoiceOverrideMode {
  if (value === 'custom' || value === 'profile') return value
  return voiceProfileId ? 'profile' : 'custom'
}

function resolveTTSProvider(value: unknown): TTSVoiceProvider {
  return value === 'kokoro' || value === 'system' || value === 'elevenlabs'
    ? value
    : DEFAULT_TTS_PROVIDER
}

function resolveDecimal(value: unknown, fallback: number, min: number, max: number): number {
  const numericValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numericValue)) return fallback
  return clamp(numericValue, min, max)
}

function normalizeUsername(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/^@+/, '').toLowerCase()
}

function resolveOverridePlatform(value: unknown): TTSUserVoiceOverridePlatform {
  switch (value) {
    case 'tiktok':
    case 'twitch':
    case 'youtube':
    case 'kick':
    case 'all':
      return value
    default:
      return 'tiktok'
  }
}

function resolveAppTheme(value: unknown): AppTheme {
  switch (value) {
    case 'dark':
    case 'midnight':
    case 'aurora':
    case 'ember':
    case 'light':
      return value
    default:
      return DEFAULT_APP_SETTINGS.theme
  }
}

function resolveInterfaceDensity(value: unknown): InterfaceDensity {
  return value === 'compact' ? 'compact' : 'comfortable'
}

function resolveHost(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

function resolvePassword(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function getDefaultAppSetting<K extends AppSettingKey>(key: K): AppSettings[K] {
  if (key === 'chatAutoRelayPlatforms') {
    return resolveRelayPlatformParticipation(DEFAULT_APP_SETTINGS.chatAutoRelayPlatforms) as AppSettings[K]
  }

  return DEFAULT_APP_SETTINGS[key]
}

export function resolveAppSetting<K extends AppSettingKey>(
  key: K,
  value: unknown
): AppSettings[K] {
  if (value === undefined) {
    return DEFAULT_APP_SETTINGS[key]
  }

  // 1. Custom complex resolvers
  if (key === 'voiceModifiers') {
    const v = value as Partial<VoiceModifiers> | null
    return {
      radioFilter: Boolean(v?.radioFilter),
      speedRamping: v?.speedRamping !== false,
      pitchShifting: (['low', 'normal', 'high', 'dynamic'].includes(v?.pitchShifting as string)
        ? v?.pitchShifting
        : 'normal') as VoiceModifiers['pitchShifting']
    } as AppSettings[K]
  }

  if (key === 'ttsUserVoiceOverrides') return resolveUserVoiceOverrides(value) as AppSettings[K]
  if (key === 'alertRules') return resolveAlertRules(value) as AppSettings[K]
  if (key === 'ttsCommandPrefixes') return resolveCommandPrefixes(value) as AppSettings[K]
  if (key === 'ttsAllowedRoles') return resolveAudiencePermissions(value) as AppSettings[K]
  if (key === 'chatAutoRelayPlatforms') return resolveRelayPlatformParticipation(value) as AppSettings[K]
  if (key === 'chatRelayTagMode') return resolveRelayTagMode(value) as AppSettings[K]
  if (key === 'theme') return resolveAppTheme(value) as AppSettings[K]
  if (key === 'interfaceDensity') return resolveInterfaceDensity(value) as AppSettings[K]
  if (key === 'accentColor') {
    const color = resolveHexColor(value, DEFAULT_APP_SETTINGS.accentColor)
    return (color.length === 9 ? color.slice(0, 7) : color) as AppSettings[K]
  }

  // 2. Type-based resolution groups
  const defaultValue = DEFAULT_APP_SETTINGS[key]

  // Boolean flags
  if (typeof defaultValue === 'boolean') {
    return Boolean(value) as AppSettings[K]
  }

  // Hex Colors
  if (key.toLowerCase().endsWith('color')) {
    return resolveHexColor(value, defaultValue as string) as AppSettings[K]
  }

  // Numeric values (clamped)
  if (typeof defaultValue === 'number' && key in NUMBER_RANGES) {
    const numericValue = typeof value === 'number' ? value : Number(value)
    const range = (NUMBER_RANGES as any)[key]
    return (Number.isFinite(numericValue)
      ? clamp(Math.round(numericValue), range.min, range.max)
      : defaultValue) as AppSettings[K]
  }

  // Durations (specific range)
  if (key.endsWith('DurationMs')) {
    const numericValue = typeof value === 'number' ? value : Number(value)
    return (Number.isFinite(numericValue)
      ? clamp(Math.round(numericValue), 500, 30000)
      : defaultValue) as AppSettings[K]
  }

  // Font Sizes
  if (key.endsWith('FontSize')) {
    const numericValue = typeof value === 'number' ? value : Number(value)
    return (Number.isFinite(numericValue)
      ? clamp(Math.round(numericValue), 16, 128)
      : defaultValue) as AppSettings[K]
  }

  // Font Weights
  if (key.endsWith('FontWeight')) {
    const numericValue = typeof value === 'number' ? value : Number(value)
    return (Number.isFinite(numericValue)
      ? clamp(Math.round(numericValue), 100, 900)
      : defaultValue) as AppSettings[K]
  }

  // Profile/Asset/Sound IDs
  if (key.endsWith('ProfileId')) return resolveProfileId(value) as AppSettings[K]
  if (key.endsWith('AssetId')) return resolveAssetId(value) as AppSettings[K]
  if (key.endsWith('SoundId')) return resolveSoundId(value) as AppSettings[K]
  if (key === 'audioOutputDeviceId') return (typeof value === 'string' ? value : 'default') as AppSettings[K]
  if (key === 'eventSoundGiftVolume' || key === 'eventSoundFollowVolume' || key === 'eventSoundSuperfanVolume') {
    return resolveDecimal(value, defaultValue as number, 0, 1) as AppSettings[K]
  }

  if (key === 'automationKeystrokeMapping') {
    if (!Array.isArray(value)) return [] as AppSettings[K]
    return value.filter(m => m && typeof m === 'object').map(m => ({
      id: String(m.id || Math.random().toString(36).substring(2, 11)),
      type: (m.type === 'gift' ? 'gift' : 'chat-command') as 'chat-command' | 'gift',
      trigger: String(m.trigger || ''),
      key: String(m.key || ''),
      modifiers: Array.isArray(m.modifiers) ? m.modifiers : [],
      enabled: m.enabled !== false
    })) as AppSettings[K]
  }

  // Default string resolution (pass-through if string)
  if (typeof defaultValue === 'string') {
    return (typeof value === 'string' ? value : defaultValue) as AppSettings[K]
  }

  return (value !== undefined ? (value as AppSettings[K]) : defaultValue) as AppSettings[K]
}

export function resolveAppSettings(
  values: Partial<Record<AppSettingKey, unknown>> = {}
): AppSettings {
  const resolved = {} as AppSettings
  for (const key of Object.keys(DEFAULT_APP_SETTINGS) as AppSettingKey[]) {
    resolved[key] = resolveAppSetting(key, values[key])
  }
  return resolved
}
