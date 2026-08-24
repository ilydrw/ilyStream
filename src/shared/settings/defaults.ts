import {
  DEFAULT_KOKORO_QUALITY,
  DEFAULT_TTS_CHAT_MESSAGE_TEMPLATE,
  type AppSettings
} from './types'
import { DEFAULT_ALERT_RULES } from '../alert-rules'
import { DEFAULT_AUTO_RELAY_PLATFORMS } from '../chat-relay'
import { CHAT_MESSAGE_RETENTION_LIMIT } from './chat-retention'

export const DEFAULT_APP_SETTINGS: AppSettings = {
  tts: {
    enabled: true, maxLength: 500, minLength: 1, duplicateWindow: 30, perUserLimit: 3,
    requireCommand: false, commandPrefixes: ['!tts', '!say', '!speak'], chatMessageTemplate: DEFAULT_TTS_CHAT_MESSAGE_TEMPLATE, allowedRoles: ['everyone'],
    chatVoiceProfileId: '', giftVoiceProfileId: '', subscriptionVoiceProfileId: '',
    onlySubsAndMods: false, userVoiceOverrides: [], readAtSymbol: false,
    skipMessagesStartingWithAt: false, ignoreEmotes: true, volume: 0.8,
    modifiers: { radioFilter: false, speedRamping: true, pitchShifting: 'normal' },
    kokoroQuality: DEFAULT_KOKORO_QUALITY
  },
  alerts: {
    rules: DEFAULT_ALERT_RULES,
    gift: { enabled: true, assetId: '', template: '{displayName} sent {giftCount}x {giftName}!', color: '#ffffff', backgroundColor: 'rgba(18, 22, 30, 0.82)', borderColor: 'rgba(247, 201, 72, 0.26)', fontSize: 32, fontWeight: 760, textShadow: '0 8px 26px rgba(0,0,0,0.36)', layout: 'side-by-side', animationIn: 'slide', animationOut: 'fade', durationMs: 4200, imageTop: 0, imageLeft: 0, soundEnabled: true, soundId: '', soundVolume: 1 },
    follow: { enabled: true, assetId: '', template: '{displayName} is now following!', color: '#ffffff', backgroundColor: 'rgba(18, 22, 30, 0.82)', borderColor: 'rgba(56, 189, 248, 0.24)', fontSize: 31, fontWeight: 760, textShadow: '0 8px 26px rgba(0,0,0,0.36)', layout: 'side-by-side', animationIn: 'slide', animationOut: 'fade', durationMs: 3800, imageTop: 0, imageLeft: 0, soundEnabled: true, soundId: '', soundVolume: 1 },
    superfan: { enabled: true, assetId: '', template: '{displayName} joined the Superfan club!', color: '#fef3c7', backgroundColor: 'rgba(0, 0, 0, 0.05)', borderColor: 'gradient', fontSize: 46, fontWeight: 800, textShadow: '0 4px 12px rgba(0,0,0,0.5)', layout: 'stacked', animationIn: 'zoom', animationOut: 'fade', durationMs: 5000, imageTop: 0, imageLeft: 0, soundEnabled: true, soundId: '', soundVolume: 1 },
    likeMilestone: { enabled: false, repeatEveryMilestone: false, template: '{displayName}, thank you for {milestoneLikes} likes!', fallbackSoundId: '', fallbackSoundVolume: 1, durationMs: 6000 },
    top: 10, left: 50
  },
  chat: { maxMessages: CHAT_MESSAGE_RETENTION_LIMIT, autoRelayEnabled: false, hostResponsesEnabled: true, relayTagMode: 'platform-and-user', autoRelayPlatforms: DEFAULT_AUTO_RELAY_PLATFORMS },
  ai: {
    enabled: false,
    requireCommand: true,
    commandPrefixes: ['!ai'],
    voiceProfileId: '',
    speechPrefix: 'AI Co-Host says: ',
    apiKey: '',
    model: 'gpt-4',
    endpoint: 'https://api.antigravity.com/v1/chat/completions',
    systemPrompt: 'You are an upbeat ilyStream co-host. Keep replies short, specific, playful, and safe for a broad audience.',
    maxTokens: 500
  },
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
    discord: { enabled: false, webhookUrl: '', botToken: '' },
    streamerbot: { enabled: false, wsUrl: 'ws://127.0.0.1:8080' }
  },
  ui: { theme: 'dark', accentColor: '#19c8ff', density: 'comfortable', reducedMotion: false, uiScale: 1, customBackground: '#0b0d12', customSecondary: '#d035f1', customColorScheme: 'auto', customPalette: {}, customThemes: [], activeCustomThemeId: '' },
  streaming: { enabled: false, rtmpUrl: 'rtmp://...', streamKey: '', bitrate: 6000, fps: 30, width: 1920, height: 1080 },
  audio: { outputDeviceId: 'default' },
  automation: { enabled: false, keystrokeMapping: [] },
  platform: { autoReconnect: true },
  overlay: { port: 8899 },

  // Default flat aliases
  theme: 'dark',
  accentColor: '#19c8ff',
  interfaceDensity: 'comfortable',
  reducedMotion: false,
  uiScale: 1,
  customThemeBackground: '#0b0d12',
  customThemeSecondary: '#d035f1',
  customColorScheme: 'auto',
  customPalette: {},
  customThemes: [],
  activeCustomThemeId: '',
  recordingsFolder: '',
  chatMaxMessages: CHAT_MESSAGE_RETENTION_LIMIT,
  chatHostResponsesEnabled: true,
  obsHost: '127.0.0.1',
  obsPort: 4455,
  obsPassword: '',
  obsEnabled: false,
  streamerbotEnabled: false,
  streamerbotWsUrl: 'ws://127.0.0.1:8080',
  streamingRtmpUrl: 'rtmp://...',
  streamingStreamKey: '',
  streamingBitrate: 6000,
  streamingFps: 30,
  streamingWidth: 1920,
  streamingHeight: 1080,
  aiEnabled: false,
  aiRequireCommand: true,
  aiCommandPrefixes: ['!ai'],
  aiVoiceProfileId: '',
  aiSpeechPrefix: 'AI Co-Host says: ',
  ttsChatMessageTemplate: DEFAULT_TTS_CHAT_MESSAGE_TEMPLATE,
  elevenlabsApiKey: '',
  elevenlabsApiKeys: [],
  elevenlabsDefaultApiKeyId: '',
  alertRules: DEFAULT_ALERT_RULES,
  alertSoundLocalMonitoring: false,
  eventLikeMilestoneEnabled: false,
  eventLikeMilestoneRepeatEnabled: false,
  eventLikeMilestoneTemplate: '{displayName}, thank you for {milestoneLikes} likes!',
  eventLikeMilestoneFallbackSoundId: '',
  eventLikeMilestoneFallbackVolume: 1,
  eventLikeMilestoneDurationMs: 6000,
  viewerJoinSounds: []
}
