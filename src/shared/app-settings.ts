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
  DEFAULT_ALERT_RULES,
  type AlertRule
} from './alert-rules'

export const DEFAULT_TTS_COMMAND_PREFIXES = ['!tts', '!say', '!speak']

export interface VoiceModifiers {
  radioFilter: boolean
  speedRamping: boolean
  pitchShifting: 'low' | 'normal' | 'high' | 'dynamic'
}

export type AppTheme = 'dark' | 'midnight' | 'aurora' | 'ember' | 'light' | 'joker'
export type InterfaceDensity = 'comfortable' | 'compact'

export interface TTSAudiencePermission {
  everyone: boolean
  followers: boolean
  fanClub: boolean
  subscribers: boolean
  moderators: boolean
  teamMembers: boolean
  vips: boolean
}

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
  allowedRoles: string[]
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
  obsHost: string
  obsPort: number
  obsPassword: string
  obsEnabled: boolean
  streamingWidth: number
  streamingHeight: number
  aiEnabled: boolean
}

export type AppSettingKey = string // Simplified for broad compatibility

export const DEFAULT_APP_SETTINGS: AppSettings = {
  tts: {
    enabled: true, maxLength: 500, minLength: 1, duplicateWindow: 30, perUserLimit: 3,
    requireCommand: true, commandPrefixes: ['!tts', '!say', '!speak'], allowedRoles: ['everyone'],
    chatVoiceProfileId: '', giftVoiceProfileId: '', subscriptionVoiceProfileId: '',
    onlySubsAndMods: false, userVoiceOverrides: [], readAtSymbol: false,
    skipMessagesStartingWithAt: false, ignoreEmotes: true, volume: 0.8,
    modifiers: { radioFilter: false, speedRamping: true, pitchShifting: 'normal' }
  },
  alerts: {
    rules: DEFAULT_ALERT_RULES,
    gift: { enabled: true, assetId: '', template: '{displayName} sent {giftCount}x {giftName}!', color: '#ffffff', backgroundColor: 'rgba(0, 0, 0, 0.05)', borderColor: 'gradient', fontSize: 48, fontWeight: 800, textShadow: '0 4px 12px rgba(0,0,0,0.5)', layout: 'stacked', animationIn: 'bounce', animationOut: 'fade', durationMs: 5000, imageTop: 0, imageLeft: 0, soundEnabled: true, soundId: '', soundVolume: 1 },
    follow: { enabled: true, assetId: '', template: '{displayName} is now following!', color: '#ffffff', backgroundColor: 'rgba(0, 0, 0, 0.05)', borderColor: 'gradient', fontSize: 44, fontWeight: 800, textShadow: '0 4px 12px rgba(0,0,0,0.5)', layout: 'stacked', animationIn: 'fade', animationOut: 'fade', durationMs: 5000, imageTop: 0, imageLeft: 0, soundEnabled: true, soundId: '', soundVolume: 1 },
    superfan: { enabled: true, assetId: '', template: '{displayName} joined the Superfan club!', color: '#fef3c7', backgroundColor: 'rgba(0, 0, 0, 0.05)', borderColor: 'gradient', fontSize: 46, fontWeight: 800, textShadow: '0 4px 12px rgba(0,0,0,0.5)', layout: 'stacked', animationIn: 'zoom', animationOut: 'fade', durationMs: 5000, imageTop: 0, imageLeft: 0, soundEnabled: true, soundId: '', soundVolume: 1 },
    top: 10, left: 50
  },
  chat: { maxMessages: 500, autoRelayEnabled: false, relayTagMode: 'platform-and-user', autoRelayPlatforms: DEFAULT_AUTO_RELAY_PLATFORMS },
  ai: { enabled: false, apiKey: '', model: 'gpt-4', endpoint: 'https://api.antigravity.com/v1/chat/completions', systemPrompt: 'You are ilyStream AI...', maxTokens: 500 },
  spotify: { clientId: '', accessToken: '', refreshToken: '', tokenExpiresAt: 0, songRequestsEnabled: true, playEnabled: true, skipEnabled: true, allowExplicit: true, maxQueueLength: 0, maxPerUser: 3, userId: '', displayName: '', votesRequired: 3 },
  goals: {
    follower: { enabled: false, title: 'Follower Goal', target: 100, color: '#00a3ff' },
    subscriber: { enabled: false, title: 'Subscriber Goal', target: 50, color: '#d946ef' },
    giftValue: { enabled: false, title: 'Daily Gift Goal', target: 5000, color: '#10b981' }
  },
  integrations: {
    obs: { enabled: false, host: '127.0.0.1', port: 4455, password: '' },
    govee: { apiKey: '', selectedDeviceIds: [], flashOnFollow: true, flashOnGift: true, flashDurationMs: 5000 },
    hue: { bridgeIp: '', username: '', selectedLightIds: [], flashOnFollow: true, flashOnGift: true, flashDurationMs: 5000 },
    voicemod: { enabled: false, host: '127.0.0.1', apiKey: '' },
    vtube: { enabled: false, host: '127.0.0.1', port: 8001, token: '' },
    discord: { enabled: false, webhookUrl: '', botToken: '' }
  },
  ui: { theme: 'dark', accentColor: '#19c8ff', density: 'comfortable', reducedMotion: false },
  streaming: { enabled: false, rtmpUrl: 'rtmp://...', streamKey: '', bitrate: 6000, fps: 60, width: 1920, height: 1080 },
  audio: { outputDeviceId: 'default' },
  automation: { enabled: false, keystrokeMapping: [] },
  platform: { autoReconnect: true },
  overlay: { port: 8899 },

  // Default flat aliases
  theme: 'dark',
  accentColor: '#19c8ff',
  interfaceDensity: 'comfortable',
  reducedMotion: false,
  chatMaxMessages: 500,
  obsHost: '127.0.0.1',
  obsPort: 4455,
  obsPassword: '',
  obsEnabled: false,
  streamingWidth: 1920,
  streamingHeight: 1080,
  aiEnabled: false,
  alertRules: DEFAULT_ALERT_RULES
}

export function resolveAppSetting(key: string, value: unknown): any {
  return value
}

/**
 * Robustly maps flat setting keys or nested settings objects into a canonical AppSettings structure.
 * This is used on both main and renderer to ensure state consistency and provide backward-compatible aliases.
 */
export function resolveAppSettings(flatValues: Record<string, any> = {}): AppSettings {
  const s = DEFAULT_APP_SETTINGS
  const get = (key: string, fallback: any) => (flatValues[key] !== undefined ? flatValues[key] : fallback)

  const nested: any = {
    ui: {
      theme: get('theme', flatValues.ui?.theme ?? s.ui.theme),
      accentColor: get('accentColor', flatValues.ui?.accentColor ?? s.ui.accentColor),
      density: get('interfaceDensity', flatValues.ui?.density ?? s.ui.density),
      reducedMotion: get('reducedMotion', flatValues.ui?.reducedMotion ?? s.ui.reducedMotion)
    },
    chat: {
      maxMessages: get('chatMaxMessages', flatValues.chat?.maxMessages ?? s.chat.maxMessages),
      autoRelayEnabled: get('chatAutoRelayEnabled', flatValues.chat?.autoRelayEnabled ?? s.chat.autoRelayEnabled),
      relayTagMode: get('chatRelayTagMode', flatValues.chat?.relayTagMode ?? s.chat.relayTagMode),
      autoRelayPlatforms: (flatValues.chat?.autoRelayPlatforms ?? s.chat.autoRelayPlatforms) as RelayPlatformParticipation
    },
    integrations: {
      obs: {
        enabled: get('obsEnabled', flatValues.integrations?.obs?.enabled ?? s.integrations.obs.enabled),
        host: get('obsHost', flatValues.integrations?.obs?.host ?? s.integrations.obs.host),
        port: get('obsPort', flatValues.integrations?.obs?.port ?? s.integrations.obs.port),
        password: get('obsPassword', flatValues.integrations?.obs?.password ?? s.integrations.obs.password)
      },
      govee: {
        apiKey: get('goveeApiKey', flatValues.integrations?.govee?.apiKey ?? s.integrations.govee.apiKey),
        selectedDeviceIds: (flatValues.integrations?.govee?.selectedDeviceIds ?? s.integrations.govee.selectedDeviceIds) as string[],
        flashOnFollow: get('goveeFlashOnFollow', flatValues.integrations?.govee?.flashOnFollow ?? s.integrations.govee.flashOnFollow),
        flashOnGift: get('goveeFlashOnGift', flatValues.integrations?.govee?.flashOnGift ?? s.integrations.govee.flashOnGift),
        flashDurationMs: get('goveeFlashDurationMs', flatValues.integrations?.govee?.flashDurationMs ?? s.integrations.govee.flashDurationMs)
      },
      hue: {
        bridgeIp: get('hueBridgeIp', flatValues.integrations?.hue?.bridgeIp ?? s.integrations.hue.bridgeIp),
        username: get('hueUsername', flatValues.integrations?.hue?.username ?? s.integrations.hue.username),
        selectedLightIds: (flatValues.integrations?.hue?.selectedLightIds ?? s.integrations.hue.selectedLightIds) as string[],
        flashOnFollow: get('hueFlashOnFollow', flatValues.integrations?.hue?.flashOnFollow ?? s.integrations.hue.flashOnFollow),
        flashOnGift: get('hueFlashOnGift', flatValues.integrations?.hue?.flashOnGift ?? s.integrations.hue.flashOnGift),
        flashDurationMs: get('hueFlashDurationMs', flatValues.integrations?.hue?.flashDurationMs ?? s.integrations.hue.flashDurationMs)
      },
      voicemod: {
        enabled: get('voicemodEnabled', flatValues.integrations?.voicemod?.enabled ?? s.integrations.voicemod.enabled),
        host: get('voicemodHost', flatValues.integrations?.voicemod?.host ?? s.integrations.voicemod.host),
        apiKey: get('voicemodApiKey', flatValues.integrations?.voicemod?.apiKey ?? s.integrations.voicemod.apiKey)
      },
      vtube: {
        enabled: get('vtubeEnabled', flatValues.integrations?.vtube?.enabled ?? s.integrations.vtube.enabled),
        host: get('vtubeHost', flatValues.integrations?.vtube?.host ?? s.integrations.vtube.host),
        port: get('vtubePort', flatValues.integrations?.vtube?.port ?? s.integrations.vtube.port),
        token: get('vtubeToken', flatValues.integrations?.vtube?.token ?? s.integrations.vtube.token)
      },
      discord: {
        enabled: get('discordEnabled', flatValues.integrations?.discord?.enabled ?? s.integrations.discord.enabled),
        webhookUrl: get('discordWebhookUrl', flatValues.integrations?.discord?.webhookUrl ?? s.integrations.discord.webhookUrl),
        botToken: get('discordBotToken', flatValues.integrations?.discord?.botToken ?? s.integrations.discord.botToken)
      }
    },
    tts: {
      enabled: get('ttsEnabled', flatValues.tts?.enabled ?? s.tts.enabled),
      maxLength: get('ttsMaxLength', flatValues.tts?.maxLength ?? s.tts.maxLength),
      minLength: get('ttsMinLength', flatValues.tts?.minLength ?? s.tts.minLength),
      duplicateWindow: get('ttsDuplicateWindow', flatValues.tts?.duplicateWindow ?? s.tts.duplicateWindow),
      perUserLimit: get('ttsPerUserLimit', flatValues.tts?.perUserLimit ?? s.tts.perUserLimit),
      requireCommand: get('ttsRequireCommand', flatValues.tts?.requireCommand ?? s.tts.requireCommand),
      commandPrefixes: get('ttsCommandPrefixes', flatValues.tts?.commandPrefixes ?? s.tts.commandPrefixes),
      allowedRoles: get('ttsAllowedRoles', flatValues.tts?.allowedRoles ?? s.tts.allowedRoles),
      chatVoiceProfileId: get('ttsChatVoiceProfileId', flatValues.tts?.chatVoiceProfileId ?? s.tts.chatVoiceProfileId),
      giftVoiceProfileId: get('ttsGiftVoiceProfileId', flatValues.tts?.giftVoiceProfileId ?? s.tts.giftVoiceProfileId),
      subscriptionVoiceProfileId: get('ttsSubscriptionVoiceProfileId', flatValues.tts?.subscriptionVoiceProfileId ?? s.tts.subscriptionVoiceProfileId),
      onlySubsAndMods: get('ttsOnlySubsAndMods', flatValues.tts?.onlySubsAndMods ?? s.tts.onlySubsAndMods),
      userVoiceOverrides: get('ttsUserVoiceOverrides', flatValues.tts?.userVoiceOverrides ?? s.tts.userVoiceOverrides),
      readAtSymbol: get('ttsReadAtSymbol', flatValues.tts?.readAtSymbol ?? s.tts.readAtSymbol),
      skipMessagesStartingWithAt: get('ttsSkipMessagesStartingWithAt', flatValues.tts?.skipMessagesStartingWithAt ?? s.tts.skipMessagesStartingWithAt),
      ignoreEmotes: get('ttsIgnoreEmotes', flatValues.tts?.ignoreEmotes ?? s.tts.ignoreEmotes),
      volume: get('ttsVolume', flatValues.tts?.volume ?? s.tts.volume),
      modifiers: get('voiceModifiers', flatValues.tts?.modifiers ?? s.tts.modifiers)
    },
    ai: {
      enabled: get('aiEnabled', flatValues.ai?.enabled ?? s.ai.enabled),
      apiKey: get('aiApiKey', flatValues.ai?.apiKey ?? s.ai.apiKey),
      model: get('aiModel', flatValues.ai?.model ?? s.ai.model),
      endpoint: get('aiEndpoint', flatValues.ai?.endpoint ?? s.ai.endpoint),
      systemPrompt: get('aiSystemPrompt', flatValues.ai?.systemPrompt ?? s.ai.systemPrompt),
      maxTokens: get('aiMaxTokens', flatValues.ai?.maxTokens ?? s.ai.maxTokens)
    },
    alerts: {
      rules: get('alertRules', flatValues.alerts?.rules ?? s.alerts.rules),
      gift: {
        enabled: get('eventImageGiftEnabled', flatValues.alerts?.gift?.enabled ?? s.alerts.gift.enabled),
        assetId: get('eventImageGiftAssetId', flatValues.alerts?.gift?.assetId ?? s.alerts.gift.assetId),
        template: get('eventTextGiftTemplate', flatValues.alerts?.gift?.template ?? s.alerts.gift.template),
        color: get('eventTextGiftColor', flatValues.alerts?.gift?.color ?? s.alerts.gift.color),
        backgroundColor: get('eventTextGiftBackgroundColor', flatValues.alerts?.gift?.backgroundColor ?? s.alerts.gift.backgroundColor),
        borderColor: get('eventTextGiftBorderColor', flatValues.alerts?.gift?.borderColor ?? s.alerts.gift.borderColor),
        fontSize: get('eventTextGiftFontSize', flatValues.alerts?.gift?.fontSize ?? s.alerts.gift.fontSize),
        fontWeight: get('eventAlertGiftFontWeight', flatValues.alerts?.gift?.fontWeight ?? s.alerts.gift.fontWeight),
        textShadow: get('eventAlertGiftTextShadow', flatValues.alerts?.gift?.textShadow ?? s.alerts.gift.textShadow),
        layout: get('eventAlertGiftLayout', flatValues.alerts?.gift?.layout ?? s.alerts.gift.layout),
        animationIn: get('eventAlertGiftAnimationIn', flatValues.alerts?.gift?.animationIn ?? s.alerts.gift.animationIn),
        animationOut: get('eventAlertGiftAnimationOut', flatValues.alerts?.gift?.animationOut ?? s.alerts.gift.animationOut),
        durationMs: get('eventAlertGiftDurationMs', flatValues.alerts?.gift?.durationMs ?? s.alerts.gift.durationMs),
        imageTop: get('eventAlertGiftImageTop', flatValues.alerts?.gift?.imageTop ?? s.alerts.gift.imageTop),
        imageLeft: get('eventAlertGiftImageLeft', flatValues.alerts?.gift?.imageLeft ?? s.alerts.gift.imageLeft),
        soundEnabled: get('eventSoundGiftEnabled', flatValues.alerts?.gift?.soundEnabled ?? s.alerts.gift.soundEnabled),
        soundId: get('eventSoundGiftSoundId', flatValues.alerts?.gift?.soundId ?? s.alerts.gift.soundId),
        soundVolume: get('eventSoundGiftVolume', flatValues.alerts?.gift?.soundVolume ?? s.alerts.gift.soundVolume)
      },
      follow: {
        enabled: get('eventImageFollowEnabled', flatValues.alerts?.follow?.enabled ?? s.alerts.follow.enabled),
        assetId: get('eventImageFollowAssetId', flatValues.alerts?.follow?.assetId ?? s.alerts.follow.assetId),
        template: get('eventTextFollowTemplate', flatValues.alerts?.follow?.template ?? s.alerts.follow.template),
        color: get('eventTextFollowColor', flatValues.alerts?.follow?.color ?? s.alerts.follow.color),
        backgroundColor: get('eventTextFollowBackgroundColor', flatValues.alerts?.follow?.backgroundColor ?? s.alerts.follow.backgroundColor),
        borderColor: get('eventTextFollowBorderColor', flatValues.alerts?.follow?.borderColor ?? s.alerts.follow.borderColor),
        fontSize: get('eventTextFollowFontSize', flatValues.alerts?.follow?.fontSize ?? s.alerts.follow.fontSize),
        fontWeight: get('eventAlertFollowFontWeight', flatValues.alerts?.follow?.fontWeight ?? s.alerts.follow.fontWeight),
        textShadow: get('eventAlertFollowTextShadow', flatValues.alerts?.follow?.textShadow ?? s.alerts.follow.textShadow),
        layout: get('eventAlertFollowLayout', flatValues.alerts?.follow?.layout ?? s.alerts.follow.layout),
        animationIn: get('eventAlertFollowAnimationIn', flatValues.alerts?.follow?.animationIn ?? s.alerts.follow.animationIn),
        animationOut: get('eventAlertFollowAnimationOut', flatValues.alerts?.follow?.animationOut ?? s.alerts.follow.animationOut),
        durationMs: get('eventAlertFollowDurationMs', flatValues.alerts?.follow?.durationMs ?? s.alerts.follow.durationMs),
        imageTop: get('eventAlertFollowImageTop', flatValues.alerts?.follow?.imageTop ?? s.alerts.follow.imageTop),
        imageLeft: get('eventAlertFollowImageLeft', flatValues.alerts?.follow?.imageLeft ?? s.alerts.follow.imageLeft),
        soundEnabled: get('eventSoundFollowEnabled', flatValues.alerts?.follow?.soundEnabled ?? s.alerts.follow.soundEnabled),
        soundId: get('eventSoundFollowSoundId', flatValues.alerts?.follow?.soundId ?? s.alerts.follow.soundId),
        soundVolume: get('eventSoundFollowVolume', flatValues.alerts?.follow?.soundVolume ?? s.alerts.follow.soundVolume)
      },
      superfan: {
        enabled: get('eventImageSuperfanEnabled', flatValues.alerts?.superfan?.enabled ?? s.alerts.superfan.enabled),
        assetId: get('eventImageSuperfanAssetId', flatValues.alerts?.superfan?.assetId ?? s.alerts.superfan.assetId),
        template: get('eventTextSuperfanTemplate', flatValues.alerts?.superfan?.template ?? s.alerts.superfan.template),
        color: get('eventTextSuperfanColor', flatValues.alerts?.superfan?.color ?? s.alerts.superfan.color),
        backgroundColor: get('eventTextSuperfanBackgroundColor', flatValues.alerts?.superfan?.backgroundColor ?? s.alerts.superfan.backgroundColor),
        borderColor: get('eventTextSuperfanBorderColor', flatValues.alerts?.superfan?.borderColor ?? s.alerts.superfan.borderColor),
        fontSize: get('eventTextSuperfanFontSize', flatValues.alerts?.superfan?.fontSize ?? s.alerts.superfan.fontSize),
        fontWeight: get('eventAlertSuperfanFontWeight', flatValues.alerts?.superfan?.fontWeight ?? s.alerts.superfan.fontWeight),
        textShadow: get('eventAlertSuperfanTextShadow', flatValues.alerts?.superfan?.textShadow ?? s.alerts.superfan.textShadow),
        layout: get('eventAlertSuperfanLayout', flatValues.alerts?.superfan?.layout ?? s.alerts.superfan.layout),
        animationIn: get('eventAlertSuperfanAnimationIn', flatValues.alerts?.superfan?.animationIn ?? s.alerts.superfan.animationIn),
        animationOut: get('eventAlertSuperfanAnimationOut', flatValues.alerts?.superfan?.animationOut ?? s.alerts.superfan.animationOut),
        durationMs: get('eventAlertSuperfanDurationMs', flatValues.alerts?.superfan?.durationMs ?? s.alerts.superfan.durationMs),
        imageTop: get('eventAlertSuperfanImageTop', flatValues.alerts?.superfan?.imageTop ?? s.alerts.superfan.imageTop),
        imageLeft: get('eventAlertSuperfanImageLeft', flatValues.alerts?.superfan?.imageLeft ?? s.alerts.superfan.imageLeft),
        soundEnabled: get('eventSoundSuperfanEnabled', flatValues.alerts?.superfan?.soundEnabled ?? s.alerts.superfan.soundEnabled),
        soundId: get('eventSoundSuperfanSoundId', flatValues.alerts?.superfan?.soundId ?? s.alerts.superfan.soundId),
        soundVolume: get('eventSoundSuperfanVolume', flatValues.alerts?.superfan?.soundVolume ?? s.alerts.superfan.soundVolume)
      },
      top: get('alertTop', flatValues.alerts?.top ?? s.alerts.top),
      left: get('alertLeft', flatValues.alerts?.left ?? s.alerts.left)
    },
    goals: {
      follower: {
        enabled: get('goalFollowerEnabled', flatValues.goals?.follower?.enabled ?? s.goals.follower.enabled),
        title: get('goalFollowerTitle', flatValues.goals?.follower?.title ?? s.goals.follower.title),
        target: get('goalFollowerTarget', flatValues.goals?.follower?.target ?? s.goals.follower.target),
        color: get('goalFollowerColor', flatValues.goals?.follower?.color ?? s.goals.follower.color)
      },
      subscriber: {
        enabled: get('goalSubscriberEnabled', flatValues.goals?.subscriber?.enabled ?? s.goals.subscriber.enabled),
        title: get('goalSubscriberTitle', flatValues.goals?.subscriber?.title ?? s.goals.subscriber.title),
        target: get('goalSubscriberTarget', flatValues.goals?.subscriber?.target ?? s.goals.subscriber.target),
        color: get('goalSubscriberColor', flatValues.goals?.subscriber?.color ?? s.goals.subscriber.color)
      },
      giftValue: {
        enabled: get('goalGiftValueEnabled', flatValues.goals?.giftValue?.enabled ?? s.goals.giftValue.enabled),
        title: get('goalGiftValueTitle', flatValues.goals?.giftValue?.title ?? s.goals.giftValue.title),
        target: get('goalGiftValueTarget', flatValues.goals?.giftValue?.target ?? s.goals.giftValue.target),
        color: get('goalGiftValueColor', flatValues.goals?.giftValue?.color ?? s.goals.giftValue.color)
      }
    },
    spotify: {
      clientId: get('spotifyClientId', flatValues.spotify?.clientId ?? s.spotify.clientId),
      accessToken: get('spotifyAccessToken', flatValues.spotify?.accessToken ?? s.spotify.accessToken),
      refreshToken: get('spotifyRefreshToken', flatValues.spotify?.refreshToken ?? s.spotify.refreshToken),
      tokenExpiresAt: get('spotifyTokenExpiresAt', flatValues.spotify?.tokenExpiresAt ?? s.spotify.tokenExpiresAt),
      songRequestsEnabled: get('spotifySongRequestsEnabled', flatValues.spotify?.songRequestsEnabled ?? s.spotify.songRequestsEnabled),
      playEnabled: get('spotifyPlayEnabled', flatValues.spotify?.playEnabled ?? s.spotify.playEnabled),
      skipEnabled: get('spotifySkipEnabled', flatValues.spotify?.skipEnabled ?? s.spotify.skipEnabled),
      allowExplicit: get('spotifyAllowExplicit', flatValues.spotify?.allowExplicit ?? s.spotify.allowExplicit),
      maxQueueLength: get('spotifyMaxQueueLength', flatValues.spotify?.maxQueueLength ?? s.spotify.maxQueueLength),
      maxPerUser: get('spotifyMaxPerUser', flatValues.spotify?.maxPerUser ?? s.spotify.maxPerUser),
      userId: get('spotifyUserId', flatValues.spotify?.userId ?? s.spotify.userId),
      displayName: get('spotifyDisplayName', flatValues.spotify?.displayName ?? s.spotify.displayName),
      votesRequired: get('spotifyVotesRequired', flatValues.spotify?.votesRequired ?? s.spotify.votesRequired)
    },
    streaming: {
      enabled: get('streamingEnabled', flatValues.streaming?.enabled ?? s.streaming.enabled),
      rtmpUrl: get('rtmpUrl', flatValues.streaming?.rtmpUrl ?? s.streaming.rtmpUrl),
      streamKey: get('streamKey', flatValues.streaming?.streamKey ?? s.streaming.streamKey),
      bitrate: get('bitrate', flatValues.streaming?.bitrate ?? s.streaming.bitrate),
      fps: get('fps', flatValues.streaming?.fps ?? s.streaming.fps),
      width: get('streamingWidth', flatValues.streaming?.width ?? s.streaming.width),
      height: get('streamingHeight', flatValues.streaming?.height ?? s.streaming.height)
    },
    audio: {
      outputDeviceId: get('audioOutputDeviceId', flatValues.audio?.outputDeviceId ?? s.audio.outputDeviceId)
    },
    automation: {
      enabled: get('automationEnabled', flatValues.automation?.enabled ?? s.automation.enabled),
      keystrokeMapping: (flatValues.automation?.keystrokeMapping ?? s.automation.keystrokeMapping) as any[]
    },
    platform: {
      autoReconnect: get('platformAutoReconnect', flatValues.platform?.autoReconnect ?? s.platform.autoReconnect)
    },
    overlay: {
      port: get('overlayPort', flatValues.overlay?.port ?? s.overlay.port)
    }
  }

  // Inject aliases back into the root for UI components that rely on flat keys
  return {
    ...s,
    ...flatValues,
    ...nested,
    theme: nested.ui.theme,
    accentColor: nested.ui.accentColor,
    interfaceDensity: nested.ui.density,
    reducedMotion: nested.ui.reducedMotion,
    chatMaxMessages: nested.chat.maxMessages,
    obsHost: nested.integrations.obs.host,
    obsPort: nested.integrations.obs.port,
    obsPassword: nested.integrations.obs.password,
    obsEnabled: nested.integrations.obs.enabled,
    streamingWidth: nested.streaming.width,
    streamingHeight: nested.streaming.height,
    aiEnabled: nested.ai.enabled
  }
}
