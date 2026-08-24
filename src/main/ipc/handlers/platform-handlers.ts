import { ipcMain, shell } from 'electron'
import { PlatformManager } from '../../platforms/platform-manager'
import { Database } from '../../db/database'
import { ChatRelayService } from '../../chat/chat-relay-service'
import { restorePlatformConnectionsOnce } from '../../platforms/platform-persistence'
import { AnyPlatformConfig, DiscordConfig, Emote, Platform } from '../../platforms/types'
import { prepareDiscordConfigForSave } from '../../platforms/discord/discord-config'
import { randomUUID } from 'crypto'
import { AnyStreamEvent, UserInfo } from '../../platforms/types'
import type { EventLabSimulationPayload } from '../../../shared/event-lab'
import { TikTokChatSender } from '../../platforms/tiktok/tiktok-chat-sender'
import {
  initiateYouTubeAuth,
  DEFAULT_YOUTUBE_CLIENT_ID,
  DEFAULT_YOUTUBE_CLIENT_SECRET
} from '../../platforms/youtube/youtube-auth'
import { ensureYouTubeLiveDestination, updateYouTubeStreamInfo } from '../../platforms/youtube/youtube-live'
import type { YouTubeConfig } from '../../platforms/types'
import { ensureKickEventSubscriptions } from '../../platforms/kick/kick-api'
import { initiateKickUserAuth, KICK_REDIRECT_URI, type KickUserTokens } from '../../platforms/kick/kick-user-auth'
import { isKickUserConnected, searchKickCategories, updateKickStreamInfo } from '../../platforms/kick/kick-stream-info'
import { searchTwitchCategories, updateTwitchStreamInfo } from '../../platforms/twitch/twitch-stream-info'
import type { KickConfig, TikTokConfig, TwitchConfig } from '../../platforms/types'
import {
  normalizeBroadcastStreamInfo,
  normalizeStreamInfoPresets,
  type BroadcastStreamInfo,
  type StreamInfoPreset
} from '../../../shared/stream-info'
import {
  DEFAULT_TIKTOK_AUTH_BRIDGE_URL,
  DEFAULT_TIKTOK_CLIENT_KEY,
  cancelTikTokNativeAuth,
  completeTikTokNativeLive,
  disconnectTikTokNativeAuth,
  getTikTokNativeAuthStatus,
  initiateTikTokNativeAuth,
  prepareTikTokNativeLive,
  type TikTokNativeAuthOptions
} from '../../platforms/tiktok/tiktok-native-auth'
import type {
  TikTokNativeAuthProgress,
  TikTokNativeAuthStatus
} from '../../../shared/tiktok-native'

export function registerPlatformHandlers(
  platformManager: PlatformManager,
  chatRelayService: ChatRelayService,
  db: Database,
  tiktokChatSender: TikTokChatSender
) {
  ipcMain.handle('platform:connect', async (_event, config: AnyPlatformConfig) => {
    const preparedConfig = preparePlatformConfigForSave(db, config)
    db.savePlatformConfig(preparedConfig)
    try {
      await platformManager.connect(preparedConfig)
    } catch (err) {
      db.setPlatformEnabled(preparedConfig.platform, false)
      throw err
    }
  })

  ipcMain.handle('platform:save-config', (_event, config: AnyPlatformConfig) => {
    db.savePlatformConfig(preparePlatformConfigForSave(db, config))
  })

  ipcMain.handle('platform:disconnect', async (_event, platform: Platform) => {
    await platformManager.disconnect(platform)
    db.setPlatformEnabled(platform, false)
  })

  ipcMain.handle('platform:get-statuses', () => {
    return platformManager.getAllStatuses()
  })

  ipcMain.handle('platform:get-errors', () => {
    return platformManager.getAllErrors()
  })

  ipcMain.handle('platform:get-configs', () => {
    return db.getAllPlatformConfigs()
  })

  ipcMain.handle('platform:get-chat-capabilities', () => {
    return platformManager.getChatCapabilities()
  })

  ipcMain.handle('discord:get-call-state', () => {
    return platformManager.getDiscordCallState()
  })

  ipcMain.handle(
    'event:simulate',
    (_event, payload: EventLabSimulationPayload) => {
      const simulatedEvent = createSimulatedEvent(payload)
      platformManager.emitTestEvent(simulatedEvent)
      return simulatedEvent
    }
  )

  ipcMain.handle(
    'platform:send-chat-message',
    async (_event, payload: { platforms: Platform[]; text: string }) => {
      const text = payload.text.trim()
      if (text.length === 0) {
        throw new Error('Cannot send an empty chat message')
      }

      const platforms = Array.from(new Set(payload.platforms))
      return chatRelayService.sendManualMessage(platforms, text)
    }
  )

  ipcMain.handle('platform:restore-connections', async () => {
    await restorePlatformConnectionsOnce(platformManager, db.getAllPlatformConfigs())
  })

  // Runs the interactive Google OAuth flow (opens the browser, listens on a
  // loopback port) and returns the resolved credentials + tokens. The renderer
  // merges these into the YouTube config and calls platform:connect, so the
  // access/refresh tokens get persisted through the normal save path.
  ipcMain.handle(
    'youtube:begin-auth',
    async (_event, payload: { clientId?: string; clientSecret?: string }) => {
      const savedConfig = db.getAllPlatformConfigs().youtube as
        | { clientId?: string; clientSecret?: string }
        | undefined
      const clientId = (
        payload?.clientId?.trim() ||
        savedConfig?.clientId?.trim() ||
        DEFAULT_YOUTUBE_CLIENT_ID
      ).trim()
      const clientSecret = (
        payload?.clientSecret?.trim() ||
        savedConfig?.clientSecret?.trim() ||
        DEFAULT_YOUTUBE_CLIENT_SECRET
      ).trim()

      const tokens = await initiateYouTubeAuth(clientId, clientSecret)
      return {
        clientId,
        clientSecret,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken
      }
    }
  )

  // Turnkey go-live: resolves (or creates) the signed-in account's live
  // stream + broadcast and returns the RTMP url/key the encoder should push
  // to. Called by the Broadcast page right before starting the YouTube
  // output, so users who signed in with Google never handle a stream key.
  const resolveYouTubeConfig = (): YouTubeConfig => {
    const saved = db.getAllPlatformConfigs().youtube as YouTubeConfig | undefined
    if (!saved) {
      throw new Error(
        'YouTube is not configured. Open the YouTube page and use "Connect with Google" first.'
      )
    }
    return {
      ...saved,
      clientId: saved.clientId?.trim() || DEFAULT_YOUTUBE_CLIENT_ID,
      clientSecret: saved.clientSecret?.trim() || DEFAULT_YOUTUBE_CLIENT_SECRET
    }
  }

  ipcMain.handle('youtube:prepare-live', async (_event, payload?: { title?: string; categoryId?: string }) => {
    const destination = await ensureYouTubeLiveDestination(resolveYouTubeConfig(), {
      title: payload?.title,
      categoryId: payload?.categoryId
    })
    console.log(
      `[youtube-live] Prepared broadcast "${destination.title}" (${destination.broadcastId}) — ` +
      `${destination.createdBroadcast ? 'created new' : 'reusing existing'}, autoStart=${destination.autoStart}`
    )
    return destination
  })

  ipcMain.handle(
    'youtube:update-stream-info',
    async (_event, payload: { title?: string; categoryId?: string }) => {
      const result = await updateYouTubeStreamInfo(resolveYouTubeConfig(), {
        title: payload?.title,
        categoryId: payload?.categoryId
      })
      console.log(`[youtube-live] Updated stream info on broadcast ${result.broadcastId}`)
      return result
    }
  )

  // Stream title/category the user sets before going live. Stored as a plain
  // DB setting so it survives restarts and prefills the next session.
  ipcMain.handle('stream-info:get', () => {
    return normalizeBroadcastStreamInfo(db.getSetting('broadcastStreamInfo'))
  })

  ipcMain.handle('stream-info:set', (_event, info: BroadcastStreamInfo) => {
    db.setSetting('broadcastStreamInfo', normalizeBroadcastStreamInfo(info))
  })

  ipcMain.handle('stream-info:get-presets', () => {
    return normalizeStreamInfoPresets(db.getSetting('broadcastStreamInfoPresets'))
  })

  ipcMain.handle('stream-info:set-presets', (_event, presets: StreamInfoPreset[]) => {
    db.setSetting('broadcastStreamInfoPresets', normalizeStreamInfoPresets(presets))
  })

  ipcMain.handle('twitch:search-categories', (_event, payload: { query: string }) => {
    const config = db.getPlatformConfig('twitch') as TwitchConfig | null
    return searchTwitchCategories(config, String(payload?.query || ''))
  })

  ipcMain.handle(
    'twitch:update-stream-info',
    async (_event, payload: { title?: string; categoryId?: string }) => {
      const config = db.getPlatformConfig('twitch') as TwitchConfig | null
      const result = await updateTwitchStreamInfo(config, {
        title: payload?.title,
        categoryId: payload?.categoryId
      })
      console.log(`[twitch-stream-info] Updated channel info for ${result.channel}`)
      return result
    }
  )

  // --- Kick user-account OAuth (channel:write for title/category) ---

  const persistKickUserTokens = (tokens: KickUserTokens) => {
    const existing = db.getPlatformConfig('kick') as KickConfig | null
    db.savePlatformConfig({
      ...existing,
      platform: 'kick',
      enabled: existing?.enabled ?? false,
      channelName: existing?.channelName || '',
      userAccessToken: tokens.accessToken,
      userRefreshToken: tokens.refreshToken,
      userTokenExpiresAt: tokens.expiresAt,
      userScopes: tokens.scopes
    })
  }

  ipcMain.handle('kick:begin-user-auth', async () => {
    const config = db.getPlatformConfig('kick') as KickConfig | null
    const tokens = await initiateKickUserAuth(config?.clientId || '', config?.clientSecret || '')
    persistKickUserTokens(tokens)
    return { connected: true }
  })

  ipcMain.handle('kick:disconnect-user-auth', () => {
    const existing = db.getPlatformConfig('kick') as KickConfig | null
    if (existing) {
      db.savePlatformConfig({
        ...existing,
        userAccessToken: '',
        userRefreshToken: '',
        userTokenExpiresAt: 0,
        userScopes: ''
      })
    }
    return { connected: false }
  })

  ipcMain.handle('kick:get-user-auth-status', () => {
    const config = db.getPlatformConfig('kick') as KickConfig | null
    return { connected: isKickUserConnected(config), redirectUri: KICK_REDIRECT_URI }
  })

  ipcMain.handle('kick:search-categories', (_event, payload: { query: string }) => {
    const config = db.getPlatformConfig('kick') as KickConfig | null
    return searchKickCategories(config, String(payload?.query || ''))
  })

  ipcMain.handle(
    'kick:update-stream-info',
    async (_event, payload: { title?: string; categoryId?: string }) => {
      const config = db.getPlatformConfig('kick') as KickConfig | null
      await updateKickStreamInfo(
        config,
        { title: payload?.title, categoryId: payload?.categoryId },
        persistKickUserTokens
      )
      console.log('[kick-stream-info] Updated Kick channel info')
      return { ok: true }
    }
  )

  ipcMain.handle(
    'kick:subscribe-events',
    async (_event, payload: { clientId: string; clientSecret: string; broadcasterUserId?: string | number; channelName?: string }) => {
      const existing = db.getPlatformConfig('kick') as Extract<AnyPlatformConfig, { platform: 'kick' }> | null
      db.savePlatformConfig({
        ...existing,
        platform: 'kick',
        enabled: existing?.enabled ?? false,
        channelName: payload.channelName || existing?.channelName || '',
        clientId: payload.clientId,
        clientSecret: payload.clientSecret,
        broadcasterUserId: String(payload.broadcasterUserId || '')
      })
      return ensureKickEventSubscriptions(payload)
    }
  )

  ipcMain.handle(
    'discord:test-webhook',
    async (_event, payload: { webhookUrl?: string; content?: string }) => {
      const webhookUrl = String(payload?.webhookUrl || '').trim()
      if (!/^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\//i.test(webhookUrl)) {
        throw new Error('Enter a valid Discord webhook URL first.')
      }

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'ilyStream',
          content: payload?.content || 'ilyStream Discord webhook test is working.',
          embeds: [{
            title: 'Webhook connected',
            description: 'Stream trigger alerts can now post to this Discord channel.',
            color: 0x19c8ff,
            timestamp: new Date().toISOString()
          }]
        }),
        signal: AbortSignal.timeout(3000)
      })

      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(`Discord webhook test failed (${response.status})${detail ? `: ${detail}` : ''}`)
      }

      return { ok: true }
    }
  )

  // --- TikTok Gift DB ---

  ipcMain.handle('tiktok:get-gifts', () => {
    return db.getAllTikTokGifts()
  })

  ipcMain.handle('tiktok:save-gift', (_event, gift) => {
    db.saveTikTokGift(gift)
  })

  ipcMain.handle('tiktok:fix-stats', () => {
    db.fixTikTokStats()
  })

  ipcMain.handle('tiktok:open-sender', async () => {
    const config = db.getPlatformConfig('tiktok') as TikTokConfig | null
    await tiktokChatSender.openWindow(config?.username)
  })

  ipcMain.handle('tiktok:close-sender', () => {
    tiktokChatSender.closeWindow()
  })

  ipcMain.handle('tiktok:get-sender-status', () => {
    return tiktokChatSender.getStatus()
  })

  ipcMain.handle('tiktok:capture-credentials', () => {
    return tiktokChatSender.captureAuthCredentials()
  })

  ipcMain.handle('tiktok:get-native-auth-status', async () => {
    const options = createTikTokNativeAuthOptions(db)
    const status = await getTikTokNativeAuthStatus(options)
    persistTikTokNativeStatus(db, status)
    return status
  })

  ipcMain.handle(
    'tiktok:begin-native-auth',
    async (event, payload?: { clientKey?: string }) => {
      const clientKey = String(payload?.clientKey || '').trim()
      const options = createTikTokNativeAuthOptions(db, clientKey, (progress) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('tiktok:native-auth-progress', progress)
        }
      })
      const status = await initiateTikTokNativeAuth(options)
      persistTikTokNativeStatus(db, status, options.clientKey)
      return status
    }
  )

  ipcMain.handle('tiktok:cancel-native-auth', async () => {
    await cancelTikTokNativeAuth()
    const options = createTikTokNativeAuthOptions(db)
    const status = await getTikTokNativeAuthStatus(options)
    persistTikTokNativeStatus(db, status)
    return status
  })

  ipcMain.handle('tiktok:disconnect-native-auth', async () => {
    const options = createTikTokNativeAuthOptions(db)
    const status = await disconnectTikTokNativeAuth(options)
    persistTikTokNativeStatus(db, status)
    return status
  })

  ipcMain.handle(
    'tiktok:prepare-live',
    async (_event, payload?: { title?: string; orientation?: 'portrait' | 'landscape' }) => {
      return prepareTikTokNativeLive(createTikTokNativeAuthOptions(db), payload)
    }
  )

  ipcMain.handle('tiktok:complete-live', async () => {
    await completeTikTokNativeLive(createTikTokNativeAuthOptions(db))
  })

  ipcMain.handle('tiktok:open-developer-portal', async () => {
    await shell.openExternal('https://developers.tiktok.com/apps/')
  })

  ipcMain.handle('tiktok:open-partner-support', async () => {
    await shell.openExternal('https://developers.tiktok.com/support/')
  })

  // Go-live automation toggles, persisted as plain DB settings. Consumed by the
  // status hook in ServiceRegistry when TikTok transitions to connected.
  ipcMain.handle('tiktok:get-automations', () => ({
    autoOpenSender: db.getSetting('tiktokAutoOpenSender') === true,
    autoPostGoLiveX: db.getSetting('tiktokAutoPostGoLiveX') === true
  }))

  ipcMain.handle('tiktok:set-automation', (_event, payload: { key: string; value: boolean }) => {
    const storageKey = TIKTOK_AUTOMATION_KEYS[payload?.key]
    if (!storageKey) return
    db.setSetting(storageKey, payload.value === true)
  })
}

function preparePlatformConfigForSave(
  db: Database,
  config: AnyPlatformConfig
): AnyPlatformConfig {
  if (config.platform !== 'discord') return config

  const existing = db.getPlatformConfig('discord') as DiscordConfig | null
  return prepareDiscordConfigForSave(existing, config)
}

// Maps renderer-facing automation names to their DB setting keys.
const TIKTOK_AUTOMATION_KEYS: Record<string, string> = {
  autoOpenSender: 'tiktokAutoOpenSender',
  autoPostGoLiveX: 'tiktokAutoPostGoLiveX'
}

const TIKTOK_NATIVE_ACCESS_TOKEN_SETTING = 'tiktokNativeAccessToken'

function createTikTokNativeAuthOptions(
  db: Database,
  clientKeyOverride = '',
  onProgress?: (progress: TikTokNativeAuthProgress) => void
): TikTokNativeAuthOptions {
  const saved = db.getPlatformConfig('tiktok') as TikTokConfig | null
  return {
    clientKey: clientKeyOverride.trim() || saved?.oauthClientKey?.trim() || DEFAULT_TIKTOK_CLIENT_KEY,
    bridgeUrl: DEFAULT_TIKTOK_AUTH_BRIDGE_URL,
    getAccessToken: () => String(db.getSetting(TIKTOK_NATIVE_ACCESS_TOKEN_SETTING) || ''),
    setAccessToken: (token) => db.setSetting(TIKTOK_NATIVE_ACCESS_TOKEN_SETTING, token),
    onProgress
  }
}

function persistTikTokNativeStatus(
  db: Database,
  status: TikTokNativeAuthStatus,
  clientKeyOverride = ''
): void {
  const existing = db.getPlatformConfig('tiktok') as TikTokConfig | null
  db.savePlatformConfig({
    ...existing,
    platform: 'tiktok',
    enabled: existing?.enabled ?? false,
    username: existing?.username || status.account?.displayName || '',
    oauthClientKey: clientKeyOverride.trim() || existing?.oauthClientKey || DEFAULT_TIKTOK_CLIENT_KEY,
    nativeAuthConnected: status.state === 'connected',
    nativeLiveAccess: status.liveAccess
  })
}

function createSimulatedEvent(payload: {
  platform?: Platform
  type: EventLabSimulationPayload['type']
  username?: string
  displayName?: string
  message?: string
  giftName?: string
  giftId?: string
  giftCount?: number
  likeCount?: number
  totalLikes?: number
  viewerCount?: number
  months?: number
  suppressSound?: boolean
}): AnyStreamEvent {
  const platform = resolveSimulationPlatform(payload.platform)
  const user = createSimulatedUser(payload)
  const raw = { simulated: true, suppressEventSound: payload.suppressSound === true }

  if (payload.type === 'gift') {
    const giftName = cleanText(payload.giftName, 'Test Rose', 80)
    const giftCount = clampInteger(payload.giftCount, 1, 999, 1)
    return {
      id: randomUUID(),
      platform,
      timestamp: new Date(),
      type: 'gift',
      raw,
      user,
      giftName,
      giftId: cleanText(payload.giftId, giftName.toLowerCase().replace(/[^a-z0-9]+/g, '-'), 80),
      giftImageUrl: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/7060293123849551105~tplv-obj.png',
      giftCount,
      monetaryValue: giftCount,
      isCombo: false
    }
  }

  if (payload.type === 'superfan') {
    const months = clampInteger(payload.months, 1, 120, 1)
    return {
      id: randomUUID(),
      platform,
      timestamp: new Date(),
      type: 'subscription',
      raw,
      user: {
        ...user,
        isSubscriber: true,
        isFanClubMember: true,
        badges: [{ id: 'superfan', name: 'Superfan' }]
      },
      tier: 'Superfan',
      months,
      isGift: false,
      monetaryValue: 499
    }
  }

  if (payload.type === 'subscription') {
    const months = clampInteger(payload.months, 1, 120, 3)
    return {
      id: randomUUID(),
      platform,
      timestamp: new Date(),
      type: 'subscription',
      raw,
      user: { ...user, isSubscriber: true },
      tier: platform === 'youtube' ? 'Member' : platform === 'twitch' ? 'Tier 1' : 'Subscriber',
      months,
      isGift: false,
      monetaryValue: 499
    }
  }

  if (payload.type === 'raid') {
    const viewerCount = clampInteger(payload.viewerCount, 1, 50000, 24)
    return {
      id: randomUUID(),
      platform,
      timestamp: new Date(),
      type: 'raid',
      raw,
      user,
      viewerCount
    }
  }

  if (payload.type === 'like') {
    const likeCount = clampInteger(payload.likeCount, 1, 100000, 25)
    const totalLikes = clampInteger(payload.totalLikes, 0, 100000000, 2500)
    return {
      id: randomUUID(),
      platform,
      timestamp: new Date(),
      type: 'like',
      raw,
      user,
      likeCount,
      totalLikes
    }
  }

  if (payload.type === 'share') {
    return {
      id: randomUUID(),
      platform,
      timestamp: new Date(),
      type: 'share',
      raw,
      user
    }
  }

  if (payload.type === 'join') {
    return {
      id: randomUUID(),
      platform,
      timestamp: new Date(),
      type: 'join',
      raw,
      user: { ...user, isFanClubMember: true }
    }
  }

  if (payload.type === 'chat') {
    const message = createSimulatedChatMessage(platform, payload.message)
    return {
      id: randomUUID(),
      platform,
      timestamp: new Date(),
      type: 'chat',
      raw,
      user,
      message,
      emotes: createSimulatedChatEmotes(platform, message)
    }
  }

  if (payload.type === 'viewer-count') {
    return {
      id: randomUUID(),
      platform,
      timestamp: new Date(),
      type: 'viewer-count',
      raw,
      count: clampInteger(payload.viewerCount, 0, 50000, 24)
    }
  }

  return {
    id: randomUUID(),
    platform,
    timestamp: new Date(),
    type: 'follow',
    raw,
    user
  }
}

function createSimulatedUser(payload: Pick<EventLabSimulationPayload, 'username' | 'displayName'> = {}): UserInfo {
  const username = cleanText(payload.username, 'local_alert_test', 48).replace(/\s+/g, '_')
  const displayName = cleanText(payload.displayName, payload.username || 'Local Alert Test', 64)

  return {
    id: 'local-alert-test',
    username,
    displayName,
    isModerator: false,
    isSubscriber: false,
    isVip: false,
    isFollower: true,
    badges: [],
    profilePictureUrl: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/7060293123849551105~tplv-obj.png'
  }
}

function resolveSimulationPlatform(platform: Platform | undefined): Platform {
  const allowed = new Set<Platform>([
    'tiktok',
    'twitch',
    'youtube',
    'kick',
    'x',
    'discord',
    'facebook',
    'instagram',
    'restream',
    'linkedin',
    'telegram'
  ])
  return platform && allowed.has(platform) ? platform : 'tiktok'
}

function cleanText(value: unknown, fallback: string, maxLength: number): string {
  const text = String(value ?? '').trim()
  return (text || fallback).slice(0, maxLength)
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const numericValue = Math.floor(Number(value))
  if (!Number.isFinite(numericValue)) return fallback
  return Math.min(max, Math.max(min, numericValue))
}

export function createSimulatedChatMessage(platform: Platform, message: unknown): string {
  return cleanText(message, getDefaultSimulatedChatMessage(platform), 500)
}

export function createSimulatedChatEmotes(platform: Platform, message: string): Emote[] {
  if (platform === 'twitch') {
    return createTwitchSimulatedEmotes(message)
  }

  if (platform === 'kick') {
    return createKickSimulatedEmotes(message)
  }

  return []
}

function getDefaultSimulatedChatMessage(platform: Platform): string {
  switch (platform) {
    case 'tiktok':
      return 'TikTok emoji test [laugh cry] [rocky love]'
    case 'twitch':
      return 'Twitch emote test Kappa'
    case 'kick':
      return 'Kick emote test [emote:37236:ThisIsFine]'
    case 'youtube':
      return 'YouTube chat test from Event Lab'
    default:
      return 'This is a local alert test message'
  }
}

function createTwitchSimulatedEmotes(message: string): Emote[] {
  return [
    createTextEmote({
      message,
      name: 'Kappa',
      id: '25',
      imageUrl: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0'
    })
  ].filter((emote): emote is Emote => Boolean(emote))
}

function createKickSimulatedEmotes(message: string): Emote[] {
  const emotes: Emote[] = []
  const pattern = /\[emote:(\d+):([^\]]+)\]/g
  let match: RegExpExecArray | null

  while ((match = pattern.exec(message)) !== null) {
    const [token, id, name] = match
    emotes.push({
      id,
      name,
      imageUrl: `https://files.kick.com/emotes/${id}/fullsize`,
      startIndex: match.index,
      endIndex: match.index + token.length - 1
    })
  }

  return emotes
}

function createTextEmote(input: {
  message: string
  name: string
  id: string
  imageUrl: string
}): Emote | null {
  const startIndex = input.message.indexOf(input.name)
  if (startIndex < 0) return null

  return {
    id: input.id,
    name: input.name,
    imageUrl: input.imageUrl,
    startIndex,
    endIndex: startIndex + input.name.length - 1
  }
}
