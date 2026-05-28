import type { AppSettings } from './types'
import { DEFAULT_ALERT_RULES } from '../alert-rules'
import { DEFAULT_AUTO_RELAY_PLATFORMS } from '../chat-relay'

export const DEFAULT_APP_SETTINGS: AppSettings = {
  tts: {
    enabled: true, maxLength: 500, minLength: 1, duplicateWindow: 30, perUserLimit: 3,
    requireCommand: false, commandPrefixes: ['!tts', '!say', '!speak'], allowedRoles: ['everyone'],
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
  chat: { maxMessages: 500, autoRelayEnabled: false, hostResponsesEnabled: true, relayTagMode: 'platform-and-user', autoRelayPlatforms: DEFAULT_AUTO_RELAY_PLATFORMS },
  ai: {
    enabled: false,
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
  chatHostResponsesEnabled: true,
  obsHost: '127.0.0.1',
  obsPort: 4455,
  obsPassword: '',
  obsEnabled: false,
  streamerbotEnabled: false,
  streamerbotWsUrl: 'ws://127.0.0.1:8080',
  streamingWidth: 1920,
  streamingHeight: 1080,
  aiEnabled: false,
  alertRules: DEFAULT_ALERT_RULES
}
