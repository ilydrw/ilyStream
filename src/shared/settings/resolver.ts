import type { AppSettings, AppTheme, KokoroQuality, TTSUserVoiceOverride, ViewerJoinSound, VoiceModifiers } from './types'
import { DEFAULT_APP_SETTINGS } from './defaults'
import { DEFAULT_TTS_CHAT_MESSAGE_TEMPLATE, DEFAULT_TTS_COMMAND_PREFIXES } from './types'
import type { RelayPlatformParticipation } from '../chat-relay'

const MAX_SETTING_KEY_LENGTH = 96
const MAX_SETTING_VALUE_BYTES = 256 * 1024
const MAX_SETTING_DEPTH = 10
const RESERVED_SETTING_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const TOP_LEVEL_SETTING_KEYS = new Set(Object.keys(DEFAULT_APP_SETTINGS))
const KNOWN_FLAT_SETTING_KEYS = new Set([
  'theme',
  'accentColor',
  'interfaceDensity',
  'reducedMotion',
  'uiScale',
  'customThemeBackground',
  'customThemeSecondary',
  'recordingsFolder',
  'chatMaxMessages',
  'chatAutoRelayEnabled',
  'chatHostResponsesEnabled',
  'chatRelayTagMode',
  'chatAutoRelayPlatforms',
  'obsHost',
  'obsPort',
  'obsPassword',
  'obsEnabled',
  'streamerbotEnabled',
  'streamerbotWsUrl',
  'streamingRtmpUrl',
  'streamingStreamKey',
  'rtmpUrl',
  'streamKey',
  'bitrate',
  'fps',
  'streamingBitrate',
  'streamingFps',
  'streamingWidth',
  'streamingHeight',
  'aiEnabled',
  'aiRequireCommand',
  'aiCommandPrefixes',
  'aiVoiceProfileId',
  'aiSpeechPrefix',
  'alertRules',
  'alertTop',
  'alertLeft',
  'alertSoundLocalMonitoring',
  'voiceModifiers',
  'audioOutputDeviceId',
  'automationEnabled',
  'automationKeystrokeMapping',
  'platformAutoReconnect',
  'overlayPort'
])
const FLAT_SETTING_KEY_PATTERNS = [
  /^tts[A-Z][A-Za-z0-9]*$/,
  /^ai[A-Z][A-Za-z0-9]*$/,
  /^spotify[A-Z][A-Za-z0-9]*$/,
  /^streaming[A-Z][A-Za-z0-9]*$/,
  /^obs[A-Z][A-Za-z0-9]*$/,
  /^govee[A-Z][A-Za-z0-9]*$/,
  /^hue[A-Z][A-Za-z0-9]*$/,
  /^voicemod[A-Z][A-Za-z0-9]*$/,
  /^vtube[A-Z][A-Za-z0-9]*$/,
  /^discord[A-Z][A-Za-z0-9]*$/,
  /^streamerbot[A-Z][A-Za-z0-9]*$/,
  /^event(?:Image|Text|Alert|Sound)(?:Gift|Follow|Superfan)[A-Z][A-Za-z0-9]*$/,
  /^goal(?:Follower|Subscriber|GiftValue)[A-Z][A-Za-z0-9]*$/
]
const BOOLEAN_SETTING_KEYS = new Set([
  'reducedMotion',
  'platformAutoReconnect',
  'automationEnabled',
  'spotifySongRequestsEnabled',
  'spotifyPlayEnabled',
  'spotifySkipEnabled',
  'spotifyAllowExplicit',
  'chatAutoRelayEnabled',
  'chatHostResponsesEnabled',
  'alertSoundLocalMonitoring'
])

export function resolveAppSetting(key: string, value: unknown): any {
  validateAppSettingKey(key)
  const sanitized = sanitizeSettingValue(value)
  assertSettingValueSize(key, sanitized)

  if (shouldCoerceBoolean(key)) return coerceBoolean(sanitized)
  if (shouldCoerceNumber(key)) return coerceNumberForKey(key, sanitized)

  return sanitized
}

export function isAllowedAppSettingKey(key: unknown): key is string {
  if (typeof key !== 'string') return false
  if (!key || key.length > MAX_SETTING_KEY_LENGTH) return false
  if (RESERVED_SETTING_KEYS.has(key)) return false
  if (TOP_LEVEL_SETTING_KEYS.has(key) || KNOWN_FLAT_SETTING_KEYS.has(key)) return true
  return FLAT_SETTING_KEY_PATTERNS.some((pattern) => pattern.test(key))
}

function validateAppSettingKey(key: unknown): asserts key is string {
  if (!isAllowedAppSettingKey(key)) {
    throw new Error(`Unsupported setting key: ${String(key)}`)
  }
}

function sanitizeSettingValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_SETTING_DEPTH) throw new Error('Setting value is too deeply nested')
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    throw new Error('Setting value is not serializable')
  }
  if (value === null || typeof value !== 'object') return value

  if (Array.isArray(value)) {
    if (value.length > 5000) throw new Error('Setting array is too large')
    return value.map((item) => sanitizeSettingValue(item, depth + 1))
  }

  const sanitized: Record<string, unknown> = {}
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (RESERVED_SETTING_KEYS.has(entryKey)) continue
    if (entryKey.length > MAX_SETTING_KEY_LENGTH) continue
    sanitized[entryKey] = sanitizeSettingValue(entryValue, depth + 1)
  }
  return sanitized
}

function assertSettingValueSize(key: string, value: unknown): void {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) throw new Error(`Setting value for ${key} is not serializable`)
  if (new TextEncoder().encode(serialized).length > MAX_SETTING_VALUE_BYTES) {
    throw new Error(`Setting value for ${key} is too large`)
  }
}

function shouldCoerceBoolean(key: string): boolean {
  return (
    BOOLEAN_SETTING_KEYS.has(key) ||
    /(Enabled|RequireCommand|OnlySubsAndMods|ReadAtSymbol|SkipMessagesStartingWithAt|IgnoreEmotes|AllowExplicit|FlashOnFollow|FlashOnGift)$/.test(key)
  )
}

function shouldCoerceNumber(key: string): boolean {
  return /(Port|MaxMessages|MaxLength|MinLength|DuplicateWindow|PerUserLimit|MaxTokens|FontSize|FontWeight|DurationMs|ImageTop|ImageLeft|Top|Left|Volume|Bitrate|Fps|Width|Height|Target|MaxQueueLength|MaxPerUser|VotesRequired|TokenExpiresAt|FlashDurationMs|Scale)$/.test(key)
}

function coerceBoolean(value: unknown): boolean {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['false', '0', 'off', 'no'].includes(normalized)) return false
    if (['true', '1', 'on', 'yes'].includes(normalized)) return true
  }
  return Boolean(value)
}

function coerceNumberForKey(key: string, value: unknown): number {
  const numeric = Number(value)
  const fallback = Number(DEFAULT_APP_SETTINGS[key] ?? 0)
  const finite = Number.isFinite(numeric) ? numeric : (Number.isFinite(fallback) ? fallback : 0)

  if (/(Port)$/.test(key)) return clampNumber(Math.round(finite), 1, 65535)
  if (/(Scale)$/.test(key)) return clampNumber(finite, 0.8, 1.3)
  if (/(Volume)$/.test(key)) return clampNumber(finite, 0, 1)
  if (/(Top|Left|ImageTop|ImageLeft)$/.test(key)) return clampNumber(finite, 0, 100)
  if (/(Fps)$/.test(key)) return clampNumber(Math.round(finite), 1, 240)
  if (/(Width|Height)$/.test(key)) return clampNumber(Math.round(finite), 16, 8192)
  if (/(Bitrate)$/.test(key)) return clampNumber(Math.round(finite), 100, 100000)
  if (/(VotesRequired)$/.test(key)) return clampNumber(Math.round(finite), 1, 100)
  if (/(MaxQueueLength|MaxPerUser|PerUserLimit|MaxMessages)$/.test(key)) return clampNumber(Math.round(finite), 0, 10000)
  if (/(MaxLength|MinLength)$/.test(key)) return clampNumber(Math.round(finite), 0, 100000)
  if (/(MaxTokens)$/.test(key)) return clampNumber(Math.round(finite), 1, 128000)
  if (/(DurationMs|DuplicateWindow|FlashDurationMs)$/.test(key)) return clampNumber(Math.round(finite), 0, 60 * 60 * 1000)
  if (/(FontSize)$/.test(key)) return clampNumber(finite, 8, 240)
  if (/(FontWeight)$/.test(key)) return clampNumber(Math.round(finite), 100, 1000)
  if (/(Target)$/.test(key)) return clampNumber(finite, 0, 1_000_000_000)
  if (/(TokenExpiresAt)$/.test(key)) return clampNumber(Math.round(finite), 0, Number.MAX_SAFE_INTEGER)

  return finite
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Robustly maps flat setting keys or nested settings objects into a canonical AppSettings structure.
 * This is used on both main and renderer to ensure state consistency and provide backward-compatible aliases.
 */
export function resolveAppSettings(flatValues: Record<string, any> = {}): AppSettings {
  const s = DEFAULT_APP_SETTINGS
  const get = (key: string, fallback: any) => (flatValues[key] !== undefined ? flatValues[key] : fallback)

  // --- Normalization Helpers ---
  const normalizeRoles = (roles: any): string[] => {
    if (!Array.isArray(roles)) return ['everyone']
    if (roles.includes('everyone')) return ['everyone']
    return Array.from(new Set(roles))
  }

  const normalizePrefixes = (val: any): string[] => {
    if (Array.isArray(val)) return val
    if (typeof val !== 'string') return DEFAULT_TTS_COMMAND_PREFIXES
    if (val.length <= 3 && !val.includes(',')) return val.split('')
    return val.split(',').map((p) => p.trim()).filter(Boolean)
  }

  const normalizeTtsChatMessageTemplate = (template: unknown): string => {
    if (typeof template !== 'string') return DEFAULT_TTS_CHAT_MESSAGE_TEMPLATE
    const trimmed = template.replace(/\s+/g, ' ').trim()
    if (!trimmed) return DEFAULT_TTS_CHAT_MESSAGE_TEMPLATE
    return trimmed.slice(0, 500)
  }

  const normalizeVoiceOverrides = (overrides: any[] = []): TTSUserVoiceOverride[] => {
    return (overrides || []).map((o: any) => ({
      ...o,
      username: (o.username || '').toLowerCase().replace(/^@/, ''),
      viewerProfileId: typeof o.viewerProfileId === 'string' ? o.viewerProfileId : '',
      mode: o.mode || 'profile',
      elevenlabsApiKeyId: typeof o.elevenlabsApiKeyId === 'string' ? o.elevenlabsApiKeyId : '',
      pitch: Math.max(0.1, Math.min(2, o.pitch ?? 1)),
      rate: Math.max(0.1, Math.min(3, o.rate ?? 1)),
      volume: Math.max(0, Math.min(1, o.volume ?? 1)),
      voiceProfileId: o.mode === 'custom' ? '' : (o.voiceProfileId || '')
    }))
  }

  const normalizeElevenLabsApiKeys = (entries: any[] = []): any[] => {
    if (!Array.isArray(entries)) return []
    const seen = new Set<string>()
    return entries
      .map((entry, index) => {
        if (!entry || typeof entry !== 'object') return null
        const apiKey = typeof entry.apiKey === 'string' ? entry.apiKey.trim() : ''
        if (!apiKey) return null
        const rawId = typeof entry.id === 'string' && entry.id.trim()
          ? entry.id.trim()
          : `el-key-${index + 1}`
        const id = seen.has(rawId) ? `${rawId}-${index + 1}` : rawId
        seen.add(id)
        const label = typeof entry.label === 'string' && entry.label.trim()
          ? entry.label.trim().slice(0, 80)
          : `Workspace ${index + 1}`
        return { id, label, apiKey }
      })
      .filter(Boolean)
  }

  const normalizeVoiceModifiers = (modifiers: unknown): VoiceModifiers => {
    const fallback = s.tts.modifiers
    const value = modifiers && typeof modifiers === 'object'
      ? modifiers as Partial<VoiceModifiers>
      : {}
    const pitchShifting = ['low', 'normal', 'high', 'dynamic'].includes(String(value.pitchShifting))
      ? value.pitchShifting as VoiceModifiers['pitchShifting']
      : fallback.pitchShifting

    return {
      radioFilter: typeof value.radioFilter === 'boolean' ? value.radioFilter : fallback.radioFilter,
      speedRamping: typeof value.speedRamping === 'boolean' ? value.speedRamping : fallback.speedRamping,
      pitchShifting
    }
  }

  const normalizeKokoroQuality = (value: unknown): KokoroQuality => {
    return value === 'q8' ? 'q8' : 'fp32'
  }

  const normalizeSoundId = (id: string): string => {
    if (!id) return ''
    if (id.startsWith('/')) return ''
    if (id.includes('\\')) return ''
    const parts = id.split('/').filter(Boolean)
    if (parts.length > 2) return ''
    if (parts.length === 2 && parts[0] !== 'alerts' && parts[0] !== 'board' && parts[0] !== 'join') return ''
    if (parts.some(part => part === '.' || part === '..')) return ''
    const fileName = parts[parts.length - 1] || ''
    const lower = id.toLowerCase()
    if (fileName.includes('\\') || fileName.includes('/')) return ''
    if (!lower.endsWith('.mp3') && !lower.endsWith('.wav')) return ''
    return id
  }

  const normalizeColor = (color: string, fallback: string): string => {
    if (!color || !color.startsWith('#')) return fallback
    return color.toLowerCase()
  }

  const APP_THEME_VALUES = new Set<AppTheme>(['dark', 'midnight', 'aurora', 'ember', 'light', 'gob', 'synthwave', 'graphite', 'custom'])
  const normalizeTheme = (value: unknown, fallback: AppTheme): AppTheme => {
    if (value === 'joker') return 'gob' // legacy id — re-skinned as Gob the Stopper
    return APP_THEME_VALUES.has(value as AppTheme) ? (value as AppTheme) : fallback
  }

  const normalizeViewerJoinSounds = (entries: any[] = []): ViewerJoinSound[] => {
    if (!Array.isArray(entries)) return []
    return entries
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry: any, index: number) => ({
        id: typeof entry.id === 'string' && entry.id ? entry.id : `join-sound-${index + 1}`,
        viewerProfileId: typeof entry.viewerProfileId === 'string' ? entry.viewerProfileId : '',
        platform: ['all', 'tiktok', 'twitch', 'youtube', 'kick'].includes(entry.platform) ? entry.platform : 'all',
        username: String(entry.username || '').toLowerCase().replace(/^@/, ''),
        soundId: normalizeSoundId(String(entry.soundId || '')),
        volume: Math.max(0, Math.min(1, Number(entry.volume ?? 1) || 0)),
        cooldownMinutes: Math.max(0, Math.min(24 * 60, Math.round(Number(entry.cooldownMinutes ?? 15) || 0))),
        enabled: entry.enabled !== false
      }))
  }

  const nested: any = {
    ui: {
      theme: normalizeTheme(get('theme', flatValues.ui?.theme ?? s.ui.theme), s.ui.theme),
      accentColor: normalizeColor(get('accentColor', flatValues.ui?.accentColor ?? s.ui.accentColor), s.ui.accentColor),
      density: get('interfaceDensity', flatValues.ui?.density ?? s.ui.density),
      reducedMotion: get('reducedMotion', flatValues.ui?.reducedMotion ?? s.ui.reducedMotion),
      uiScale: get('uiScale', flatValues.ui?.uiScale ?? s.ui.uiScale),
      customBackground: normalizeColor(get('customThemeBackground', flatValues.ui?.customBackground ?? s.ui.customBackground), s.ui.customBackground),
      customSecondary: normalizeColor(get('customThemeSecondary', flatValues.ui?.customSecondary ?? s.ui.customSecondary), s.ui.customSecondary)
    },
    chat: {
      maxMessages: get('chatMaxMessages', flatValues.chat?.maxMessages ?? s.chat.maxMessages),
      autoRelayEnabled: get('chatAutoRelayEnabled', flatValues.chat?.autoRelayEnabled ?? s.chat.autoRelayEnabled),
      hostResponsesEnabled: get('chatHostResponsesEnabled', flatValues.chat?.hostResponsesEnabled ?? s.chat.hostResponsesEnabled),
      relayTagMode: get('chatRelayTagMode', flatValues.chat?.relayTagMode ?? s.chat.relayTagMode),
      autoRelayPlatforms: get(
        'chatAutoRelayPlatforms',
        flatValues.chat?.autoRelayPlatforms ?? s.chat.autoRelayPlatforms
      ) as RelayPlatformParticipation
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
      },
      streamerbot: {
        enabled: get('streamerbotEnabled', flatValues.integrations?.streamerbot?.enabled ?? s.integrations.streamerbot.enabled),
        wsUrl: get('streamerbotWsUrl', flatValues.integrations?.streamerbot?.wsUrl ?? s.integrations.streamerbot.wsUrl)
      }
    },
    tts: {
      enabled: get('ttsEnabled', flatValues.tts?.enabled ?? s.tts.enabled),
      maxLength: get('ttsMaxLength', flatValues.tts?.maxLength ?? s.tts.maxLength),
      minLength: get('ttsMinLength', flatValues.tts?.minLength ?? s.tts.minLength),
      duplicateWindow: get('ttsDuplicateWindow', flatValues.tts?.duplicateWindow ?? s.tts.duplicateWindow),
      perUserLimit: get('ttsPerUserLimit', flatValues.tts?.perUserLimit ?? s.tts.perUserLimit),
      requireCommand: get('ttsRequireCommand', flatValues.tts?.requireCommand ?? s.tts.requireCommand),
      commandPrefixes: normalizePrefixes(get('ttsCommandPrefixes', flatValues.tts?.commandPrefixes ?? s.tts.commandPrefixes)),
      chatMessageTemplate: normalizeTtsChatMessageTemplate(get('ttsChatMessageTemplate', flatValues.tts?.chatMessageTemplate ?? s.tts.chatMessageTemplate)),
      allowedRoles: normalizeRoles(get('ttsAllowedRoles', flatValues.tts?.allowedRoles ?? s.tts.allowedRoles)),
      chatVoiceProfileId: get('ttsChatVoiceProfileId', flatValues.tts?.chatVoiceProfileId ?? s.tts.chatVoiceProfileId),
      giftVoiceProfileId: get('ttsGiftVoiceProfileId', flatValues.tts?.giftVoiceProfileId ?? s.tts.giftVoiceProfileId),
      subscriptionVoiceProfileId: get('ttsSubscriptionVoiceProfileId', flatValues.tts?.subscriptionVoiceProfileId ?? s.tts.subscriptionVoiceProfileId),
      onlySubsAndMods: get('ttsOnlySubsAndMods', flatValues.tts?.onlySubsAndMods ?? s.tts.onlySubsAndMods),
      userVoiceOverrides: normalizeVoiceOverrides(get('ttsUserVoiceOverrides', flatValues.tts?.userVoiceOverrides ?? s.tts.userVoiceOverrides)),
      readAtSymbol: get('ttsReadAtSymbol', flatValues.tts?.readAtSymbol ?? s.tts.readAtSymbol),
      skipMessagesStartingWithAt: get('ttsSkipMessagesStartingWithAt', flatValues.tts?.skipMessagesStartingWithAt ?? s.tts.skipMessagesStartingWithAt),
      ignoreEmotes: get('ttsIgnoreEmotes', flatValues.tts?.ignoreEmotes ?? s.tts.ignoreEmotes),
      volume: Math.max(0, Math.min(1, get('ttsVolume', flatValues.tts?.volume ?? s.tts.volume))),
      modifiers: normalizeVoiceModifiers(get('voiceModifiers', flatValues.tts?.modifiers ?? s.tts.modifiers)),
      kokoroQuality: normalizeKokoroQuality(get('ttsKokoroQuality', flatValues.tts?.kokoroQuality ?? s.tts.kokoroQuality))
    },
    ai: {
      enabled: get('aiEnabled', flatValues.ai?.enabled ?? s.ai.enabled),
      requireCommand: get('aiRequireCommand', flatValues.ai?.requireCommand ?? s.ai.requireCommand),
      commandPrefixes: normalizePrefixes(get('aiCommandPrefixes', flatValues.ai?.commandPrefixes ?? s.ai.commandPrefixes)),
      voiceProfileId: get('aiVoiceProfileId', flatValues.ai?.voiceProfileId ?? s.ai.voiceProfileId),
      speechPrefix: get('aiSpeechPrefix', flatValues.ai?.speechPrefix ?? s.ai.speechPrefix),
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
        color: normalizeColor(get('eventTextGiftColor', flatValues.alerts?.gift?.color ?? s.alerts.gift.color), s.alerts.gift.color),
        backgroundColor: get('eventTextGiftBackgroundColor', flatValues.alerts?.gift?.backgroundColor ?? s.alerts.gift.backgroundColor),
        borderColor: normalizeColor(get('eventTextGiftBorderColor', flatValues.alerts?.gift?.borderColor ?? s.alerts.gift.borderColor), s.alerts.gift.borderColor),
        fontSize: Math.max(8, Math.min(120, get('eventTextGiftFontSize', flatValues.alerts?.gift?.fontSize ?? s.alerts.gift.fontSize))),
        fontWeight: get('eventAlertGiftFontWeight', flatValues.alerts?.gift?.fontWeight ?? s.alerts.gift.fontWeight),
        textShadow: get('eventAlertGiftTextShadow', flatValues.alerts?.gift?.textShadow ?? s.alerts.gift.textShadow),
        layout: get('eventAlertGiftLayout', flatValues.alerts?.gift?.layout ?? s.alerts.gift.layout),
        animationIn: get('eventAlertGiftAnimationIn', flatValues.alerts?.gift?.animationIn ?? s.alerts.gift.animationIn),
        animationOut: get('eventAlertGiftAnimationOut', flatValues.alerts?.gift?.animationOut ?? s.alerts.gift.animationOut),
        durationMs: get('eventAlertGiftDurationMs', flatValues.alerts?.gift?.durationMs ?? s.alerts.gift.durationMs),
        imageTop: get('eventAlertGiftImageTop', flatValues.alerts?.gift?.imageTop ?? s.alerts.gift.imageTop),
        imageLeft: get('eventAlertGiftImageLeft', flatValues.alerts?.gift?.imageLeft ?? s.alerts.gift.imageLeft),
        soundEnabled: get('eventSoundGiftEnabled', flatValues.alerts?.gift?.soundEnabled ?? s.alerts.gift.soundEnabled),
        soundId: normalizeSoundId(get('eventSoundGiftSoundId', flatValues.alerts?.gift?.soundId ?? s.alerts.gift.soundId)),
        soundVolume: Math.max(0, Math.min(1, get('eventSoundGiftVolume', flatValues.alerts?.gift?.soundVolume ?? s.alerts.gift.soundVolume)))
      },
      follow: {
        enabled: get('eventImageFollowEnabled', flatValues.alerts?.follow?.enabled ?? s.alerts.follow.enabled),
        assetId: get('eventImageFollowAssetId', flatValues.alerts?.follow?.assetId ?? s.alerts.follow.assetId),
        template: get('eventTextFollowTemplate', flatValues.alerts?.follow?.template ?? s.alerts.follow.template),
        color: normalizeColor(get('eventTextFollowColor', flatValues.alerts?.follow?.color ?? s.alerts.follow.color), s.alerts.follow.color),
        backgroundColor: get('eventTextFollowBackgroundColor', flatValues.alerts?.follow?.backgroundColor ?? s.alerts.follow.backgroundColor),
        borderColor: normalizeColor(get('eventTextFollowBorderColor', flatValues.alerts?.follow?.borderColor ?? s.alerts.follow.borderColor), s.alerts.follow.borderColor),
        fontSize: Math.max(8, Math.min(120, get('eventTextFollowFontSize', flatValues.alerts?.follow?.fontSize ?? s.alerts.follow.fontSize))),
        fontWeight: get('eventAlertFollowFontWeight', flatValues.alerts?.follow?.fontWeight ?? s.alerts.follow.fontWeight),
        textShadow: get('eventAlertFollowTextShadow', flatValues.alerts?.follow?.textShadow ?? s.alerts.follow.textShadow),
        layout: get('eventAlertFollowLayout', flatValues.alerts?.follow?.layout ?? s.alerts.follow.layout),
        animationIn: get('eventAlertFollowAnimationIn', flatValues.alerts?.follow?.animationIn ?? s.alerts.follow.animationIn),
        animationOut: get('eventAlertFollowAnimationOut', flatValues.alerts?.follow?.animationOut ?? s.alerts.follow.animationOut),
        durationMs: get('eventAlertFollowDurationMs', flatValues.alerts?.follow?.durationMs ?? s.alerts.follow.durationMs),
        imageTop: get('eventAlertFollowImageTop', flatValues.alerts?.follow?.imageTop ?? s.alerts.follow.imageTop),
        imageLeft: get('eventAlertFollowImageLeft', flatValues.alerts?.follow?.imageLeft ?? s.alerts.follow.imageLeft),
        soundEnabled: get('eventSoundFollowEnabled', flatValues.alerts?.follow?.soundEnabled ?? s.alerts.follow.soundEnabled),
        soundId: normalizeSoundId(get('eventSoundFollowSoundId', flatValues.alerts?.follow?.soundId ?? s.alerts.follow.soundId)),
        soundVolume: Math.max(0, Math.min(1, get('eventSoundFollowVolume', flatValues.alerts?.follow?.soundVolume ?? s.alerts.follow.soundVolume)))
      },
      superfan: {
        enabled: get('eventImageSuperfanEnabled', flatValues.alerts?.superfan?.enabled ?? s.alerts.superfan.enabled),
        assetId: get('eventImageSuperfanAssetId', flatValues.alerts?.superfan?.assetId ?? s.alerts.superfan.assetId),
        template: get('eventTextSuperfanTemplate', flatValues.alerts?.superfan?.template ?? s.alerts.superfan.template),
        color: normalizeColor(get('eventTextSuperfanColor', flatValues.alerts?.superfan?.color ?? s.alerts.superfan.color), s.alerts.superfan.color),
        backgroundColor: get('eventTextSuperfanBackgroundColor', flatValues.alerts?.superfan?.backgroundColor ?? s.alerts.superfan.backgroundColor) === 'not-a-color' ? s.alerts.superfan.backgroundColor : get('eventTextSuperfanBackgroundColor', flatValues.alerts?.superfan?.backgroundColor ?? s.alerts.superfan.backgroundColor),
        borderColor: normalizeColor(get('eventTextSuperfanBorderColor', flatValues.alerts?.superfan?.borderColor ?? s.alerts.superfan.borderColor), s.alerts.superfan.borderColor),
        fontSize: Math.max(8, Math.min(120, get('eventTextSuperfanFontSize', flatValues.alerts?.superfan?.fontSize ?? s.alerts.superfan.fontSize))),
        fontWeight: get('eventAlertSuperfanFontWeight', flatValues.alerts?.superfan?.fontWeight ?? s.alerts.superfan.fontWeight),
        textShadow: get('eventAlertSuperfanTextShadow', flatValues.alerts?.superfan?.textShadow ?? s.alerts.superfan.textShadow),
        layout: get('eventAlertSuperfanLayout', flatValues.alerts?.superfan?.layout ?? s.alerts.superfan.layout),
        animationIn: get('eventAlertSuperfanAnimationIn', flatValues.alerts?.superfan?.animationIn ?? s.alerts.superfan.animationIn),
        animationOut: get('eventAlertSuperfanAnimationOut', flatValues.alerts?.superfan?.animationOut ?? s.alerts.superfan.animationOut),
        durationMs: get('eventAlertSuperfanDurationMs', flatValues.alerts?.superfan?.durationMs ?? s.alerts.superfan.durationMs),
        imageTop: get('eventAlertSuperfanImageTop', flatValues.alerts?.superfan?.imageTop ?? s.alerts.superfan.imageTop),
        imageLeft: get('eventAlertSuperfanImageLeft', flatValues.alerts?.superfan?.imageLeft ?? s.alerts.superfan.imageLeft),
        soundEnabled: get('eventSoundSuperfanEnabled', flatValues.alerts?.superfan?.soundEnabled ?? s.alerts.superfan.soundEnabled),
        soundId: normalizeSoundId(get('eventSoundSuperfanSoundId', flatValues.alerts?.superfan?.soundId ?? s.alerts.superfan.soundId)),
        soundVolume: Math.max(0, Math.min(1, get('eventSoundSuperfanVolume', flatValues.alerts?.superfan?.soundVolume ?? s.alerts.superfan.soundVolume)))
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
      rtmpUrl: get('streamingRtmpUrl', get('rtmpUrl', flatValues.streaming?.rtmpUrl ?? s.streaming.rtmpUrl)),
      streamKey: get('streamingStreamKey', get('streamKey', flatValues.streaming?.streamKey ?? s.streaming.streamKey)),
      bitrate: get('streamingBitrate', get('bitrate', flatValues.streaming?.bitrate ?? s.streaming.bitrate)),
      fps: get('streamingFps', get('fps', flatValues.streaming?.fps ?? s.streaming.fps)),
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

  const elevenlabsApiKeys = normalizeElevenLabsApiKeys(get('elevenlabsApiKeys', flatValues.elevenlabsApiKeys ?? s.elevenlabsApiKeys))
  const elevenlabsDefaultApiKeyId = typeof get('elevenlabsDefaultApiKeyId', flatValues.elevenlabsDefaultApiKeyId ?? s.elevenlabsDefaultApiKeyId) === 'string'
    ? get('elevenlabsDefaultApiKeyId', flatValues.elevenlabsDefaultApiKeyId ?? s.elevenlabsDefaultApiKeyId)
    : ''

  // Inject aliases back into the root for UI components that rely on flat keys
  return {
    ...s,
    ...flatValues,
    ...nested,
    theme: nested.ui.theme,
    accentColor: nested.ui.accentColor,
    interfaceDensity: nested.ui.density,
    reducedMotion: nested.ui.reducedMotion,
    uiScale: nested.ui.uiScale,
    customThemeBackground: nested.ui.customBackground,
    customThemeSecondary: nested.ui.customSecondary,
    chatMaxMessages: nested.chat.maxMessages,
    chatAutoRelayEnabled: nested.chat.autoRelayEnabled,
    chatHostResponsesEnabled: nested.chat.hostResponsesEnabled,
    chatRelayTagMode: nested.chat.relayTagMode,
    chatAutoRelayPlatforms: nested.chat.autoRelayPlatforms,
    obsHost: nested.integrations.obs.host,
    obsPort: nested.integrations.obs.port,
    obsPassword: nested.integrations.obs.password,
    obsEnabled: nested.integrations.obs.enabled,
    streamerbotEnabled: nested.integrations.streamerbot.enabled,
    streamerbotWsUrl: nested.integrations.streamerbot.wsUrl,
    streamingRtmpUrl: nested.streaming.rtmpUrl,
    streamingStreamKey: nested.streaming.streamKey,
    streamingBitrate: nested.streaming.bitrate,
    streamingFps: nested.streaming.fps,
    streamingWidth: nested.streaming.width,
    streamingHeight: nested.streaming.height,
    aiEnabled: nested.ai.enabled,
    aiRequireCommand: nested.ai.requireCommand,
    aiCommandPrefixes: nested.ai.commandPrefixes,
    ttsEnabled: nested.tts.enabled,
    ttsMaxLength: nested.tts.maxLength,
    ttsMinLength: nested.tts.minLength,
    ttsDuplicateWindow: nested.tts.duplicateWindow,
    ttsPerUserLimit: nested.tts.perUserLimit,
    ttsRequireCommand: nested.tts.requireCommand,
    ttsCommandPrefixes: nested.tts.commandPrefixes,
    ttsChatMessageTemplate: nested.tts.chatMessageTemplate,
    ttsAllowedRoles: nested.tts.allowedRoles,
    ttsChatVoiceProfileId: nested.tts.chatVoiceProfileId,
    ttsGiftVoiceProfileId: nested.tts.giftVoiceProfileId,
    ttsSubscriptionVoiceProfileId: nested.tts.subscriptionVoiceProfileId,
    ttsOnlySubsAndMods: nested.tts.onlySubsAndMods,
    ttsUserVoiceOverrides: nested.tts.userVoiceOverrides,
    ttsReadAtSymbol: nested.tts.readAtSymbol,
    ttsSkipMessagesStartingWithAt: nested.tts.skipMessagesStartingWithAt,
    ttsIgnoreEmotes: nested.tts.ignoreEmotes,
    ttsVolume: nested.tts.volume,
    ttsKokoroQuality: nested.tts.kokoroQuality,
    voiceModifiers: nested.tts.modifiers,
    elevenlabsApiKey: typeof flatValues.elevenlabsApiKey === 'string' ? flatValues.elevenlabsApiKey : s.elevenlabsApiKey,
    elevenlabsApiKeys,
    elevenlabsDefaultApiKeyId,
    viewerJoinSounds: normalizeViewerJoinSounds(get('viewerJoinSounds', flatValues.viewerJoinSounds ?? s.viewerJoinSounds)),
    audioOutputDeviceId: nested.audio.outputDeviceId,
    // Add legacy alert aliases for consumers that still read the flat shape.
    eventImageGiftEnabled: nested.alerts.gift.enabled,
    eventImageGiftAssetId: nested.alerts.gift.assetId,
    eventTextGiftEnabled: get('eventTextGiftEnabled', true),
    eventTextGiftTemplate: nested.alerts.gift.template,
    eventTextGiftColor: nested.alerts.gift.color,
    eventTextGiftBackgroundColor: nested.alerts.gift.backgroundColor,
    eventTextGiftBorderColor: nested.alerts.gift.borderColor,
    eventTextGiftFontSize: nested.alerts.gift.fontSize,
    eventAlertGiftFontWeight: nested.alerts.gift.fontWeight,
    eventAlertGiftTextShadow: nested.alerts.gift.textShadow,
    eventAlertGiftLayout: nested.alerts.gift.layout,
    eventAlertGiftAnimationIn: nested.alerts.gift.animationIn,
    eventAlertGiftAnimationOut: nested.alerts.gift.animationOut,
    eventAlertGiftDurationMs: nested.alerts.gift.durationMs,
    eventAlertGiftImageTop: nested.alerts.gift.imageTop,
    eventAlertGiftImageLeft: nested.alerts.gift.imageLeft,
    eventSoundGiftEnabled: nested.alerts.gift.soundEnabled,
    eventSoundGiftSoundId: nested.alerts.gift.soundId,
    eventSoundGiftVolume: nested.alerts.gift.soundVolume,
    eventImageFollowEnabled: nested.alerts.follow.enabled,
    eventImageFollowAssetId: nested.alerts.follow.assetId,
    eventTextFollowEnabled: get('eventTextFollowEnabled', true),
    eventTextFollowTemplate: nested.alerts.follow.template,
    eventTextFollowColor: nested.alerts.follow.color,
    eventTextFollowBackgroundColor: nested.alerts.follow.backgroundColor,
    eventTextFollowBorderColor: nested.alerts.follow.borderColor,
    eventTextFollowFontSize: nested.alerts.follow.fontSize,
    eventAlertFollowFontWeight: nested.alerts.follow.fontWeight,
    eventAlertFollowTextShadow: nested.alerts.follow.textShadow,
    eventAlertFollowLayout: nested.alerts.follow.layout,
    eventAlertFollowAnimationIn: nested.alerts.follow.animationIn,
    eventAlertFollowAnimationOut: nested.alerts.follow.animationOut,
    eventAlertFollowDurationMs: nested.alerts.follow.durationMs,
    eventAlertFollowImageTop: nested.alerts.follow.imageTop,
    eventAlertFollowImageLeft: nested.alerts.follow.imageLeft,
    eventSoundFollowEnabled: nested.alerts.follow.soundEnabled,
    eventSoundFollowSoundId: nested.alerts.follow.soundId,
    eventSoundFollowVolume: nested.alerts.follow.soundVolume,
    eventImageSuperfanEnabled: nested.alerts.superfan.enabled,
    eventImageSuperfanAssetId: nested.alerts.superfan.assetId,
    eventTextSuperfanEnabled: get('eventTextSuperfanEnabled', true),
    eventTextSuperfanTemplate: nested.alerts.superfan.template,
    eventSoundSuperfanEnabled: nested.alerts.superfan.soundEnabled,
    eventSoundSuperfanSoundId: nested.alerts.superfan.soundId,
    eventSoundSuperfanVolume: nested.alerts.superfan.soundVolume,
    eventTextSuperfanColor: nested.alerts.superfan.color,
    eventTextSuperfanBackgroundColor: nested.alerts.superfan.backgroundColor,
    eventTextSuperfanBorderColor: nested.alerts.superfan.borderColor,
    eventTextSuperfanFontSize: nested.alerts.superfan.fontSize,
    eventAlertSuperfanFontWeight: nested.alerts.superfan.fontWeight,
    eventAlertSuperfanTextShadow: nested.alerts.superfan.textShadow,
    eventAlertSuperfanLayout: nested.alerts.superfan.layout,
    eventAlertSuperfanAnimationIn: nested.alerts.superfan.animationIn,
    eventAlertSuperfanAnimationOut: nested.alerts.superfan.animationOut,
    eventAlertSuperfanDurationMs: nested.alerts.superfan.durationMs,
    eventAlertSuperfanImageTop: nested.alerts.superfan.imageTop,
    eventAlertSuperfanImageLeft: nested.alerts.superfan.imageLeft,
    spotifyClientId: nested.spotify.clientId,
    spotifyAccessToken: nested.spotify.accessToken,
    spotifyRefreshToken: nested.spotify.refreshToken,
    spotifyTokenExpiresAt: nested.spotify.tokenExpiresAt,
    spotifySongRequestsEnabled: nested.spotify.songRequestsEnabled,
    spotifyPlayEnabled: nested.spotify.playEnabled,
    spotifySkipEnabled: nested.spotify.skipEnabled,
    spotifyAllowExplicit: nested.spotify.allowExplicit,
    spotifyMaxQueueLength: nested.spotify.maxQueueLength,
    spotifyMaxPerUser: nested.spotify.maxPerUser,
    spotifyUserId: nested.spotify.userId,
    spotifyDisplayName: nested.spotify.displayName,
    spotifyVotesRequired: nested.spotify.votesRequired
  }
}
