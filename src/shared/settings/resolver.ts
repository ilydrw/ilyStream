import type { AppSettings, TTSUserVoiceOverride } from './types'
import { DEFAULT_APP_SETTINGS } from './defaults'
import { DEFAULT_TTS_COMMAND_PREFIXES } from './types'
import type { RelayPlatformParticipation } from '../chat-relay'

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

  const normalizeVoiceOverrides = (overrides: any[] = []): TTSUserVoiceOverride[] => {
    return (overrides || []).map((o: any) => ({
      ...o,
      username: (o.username || '').toLowerCase().replace(/^@/, ''),
      mode: o.mode || 'profile',
      pitch: Math.max(0.1, Math.min(2, o.pitch ?? 1)),
      rate: Math.max(0.1, Math.min(3, o.rate ?? 1)),
      volume: Math.max(0, Math.min(1, o.volume ?? 1)),
      voiceProfileId: o.mode === 'custom' ? '' : (o.voiceProfileId || '')
    }))
  }

  const normalizeSoundId = (id: string): string => {
    if (!id) return ''
    if (id.startsWith('/')) return ''
    if (id.includes('\\')) return ''
    const parts = id.split('/').filter(Boolean)
    if (parts.length > 2) return ''
    if (parts.length === 2 && parts[0] !== 'alerts' && parts[0] !== 'board') return ''
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

  const nested: any = {
    ui: {
      theme: get('theme', flatValues.ui?.theme ?? s.ui.theme),
      accentColor: normalizeColor(get('accentColor', flatValues.ui?.accentColor ?? s.ui.accentColor), s.ui.accentColor),
      density: get('interfaceDensity', flatValues.ui?.density ?? s.ui.density),
      reducedMotion: get('reducedMotion', flatValues.ui?.reducedMotion ?? s.ui.reducedMotion)
    },
    chat: {
      maxMessages: get('chatMaxMessages', flatValues.chat?.maxMessages ?? s.chat.maxMessages),
      autoRelayEnabled: get('chatAutoRelayEnabled', flatValues.chat?.autoRelayEnabled ?? s.chat.autoRelayEnabled),
      hostResponsesEnabled: get('chatHostResponsesEnabled', flatValues.chat?.hostResponsesEnabled ?? s.chat.hostResponsesEnabled),
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
    chatHostResponsesEnabled: nested.chat.hostResponsesEnabled,
    obsHost: nested.integrations.obs.host,
    obsPort: nested.integrations.obs.port,
    obsPassword: nested.integrations.obs.password,
    obsEnabled: nested.integrations.obs.enabled,
    streamerbotEnabled: nested.integrations.streamerbot.enabled,
    streamerbotWsUrl: nested.integrations.streamerbot.wsUrl,
    streamingWidth: nested.streaming.width,
    streamingHeight: nested.streaming.height,
    aiEnabled: nested.ai.enabled,
    ttsEnabled: nested.tts.enabled,
    ttsCommandPrefixes: nested.tts.commandPrefixes,
    ttsAllowedRoles: nested.tts.allowedRoles,
    ttsUserVoiceOverrides: nested.tts.userVoiceOverrides,
    // Add legacy event sound aliases for test compatibility
    eventSoundGiftEnabled: nested.alerts.gift.soundEnabled,
    eventSoundGiftSoundId: nested.alerts.gift.soundId,
    eventSoundGiftVolume: nested.alerts.gift.soundVolume,
    eventSoundFollowEnabled: nested.alerts.follow.soundEnabled,
    eventSoundFollowSoundId: nested.alerts.follow.soundId,
    eventSoundFollowVolume: nested.alerts.follow.soundVolume,
    eventSoundSuperfanEnabled: nested.alerts.superfan.soundEnabled,
    eventSoundSuperfanSoundId: nested.alerts.superfan.soundId,
    eventSoundSuperfanVolume: nested.alerts.superfan.soundVolume,
    eventTextSuperfanColor: nested.alerts.superfan.color,
    eventTextSuperfanBackgroundColor: nested.alerts.superfan.backgroundColor,
    eventTextSuperfanBorderColor: nested.alerts.superfan.borderColor,
    eventTextSuperfanFontSize: nested.alerts.superfan.fontSize,
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
