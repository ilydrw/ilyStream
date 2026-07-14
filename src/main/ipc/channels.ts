/**
 * Typed IPC channel definitions.
 * All communication between main and renderer is defined here.
 */

import {
  Platform,
  AnyPlatformConfig,
  ConnectionStatus,
  AnyStreamEvent,
  PlatformChatCapability,
  PlatformChatSendResult
} from '../platforms/types'
import { TTSQueueItem } from '../tts/queue'
import { VoiceProfile } from '../tts/voice-profiles'
import { TriggerRule } from '../triggers/trigger-types'
import { AppSettings, AppSettingKey } from '../../shared/app-settings'
import type { WindowsSettingsTarget } from '../system/windows-settings'
import type { OverlayRuntimeStatus } from '../../shared/overlay'
import type { OBSRuntimeStatus } from '../../shared/obs'
import type { SpotifySongRequest, SpotifyStatus } from '../../shared/spotify-types'
import type { XPostResult, XStatus } from '../../shared/x-types'
import type { NowPlayingPayload } from '../../shared/widgets'
import type {
  EventLabDeviceBroadcast,
  EventLabOverlayBroadcast,
  EventLabSimulationPayload
} from '../../shared/event-lab'
import type { AutomationRunReceipt } from '../../shared/automation-receipts'
import type { KickEventSubscriptionResult } from '../platforms/kick/kick-api'
import type {
  TikTokNativeAuthProgress,
  TikTokNativeAuthStatus,
  TikTokNativeLiveDestination
} from '../../shared/tiktok-native'
import type { BroadcastStreamInfo, StreamInfoPreset, TwitchCategory } from '../../shared/stream-info'

// --- Renderer -> Main (invoke/handle) ---

export interface IpcInvokeChannels {
  // Platform management
  'platform:connect': (config: AnyPlatformConfig) => Promise<void>
  'platform:save-config': (config: AnyPlatformConfig) => Promise<void>
  'platform:disconnect': (platform: Platform) => Promise<void>
  'platform:get-statuses': () => Promise<Record<Platform, ConnectionStatus>>
  'platform:get-errors': () => Promise<Record<Platform, string | null>>
  'platform:get-configs': () => Promise<Partial<Record<Platform, AnyPlatformConfig>>>
  'platform:get-chat-capabilities': () => Promise<Record<Platform, PlatformChatCapability>>
  'platform:send-chat-message': (payload: {
    platforms: Platform[]
    text: string
  }) => Promise<PlatformChatSendResult[]>
  'platform:restore-connections': () => Promise<void>
  'tiktok:get-native-auth-status': () => Promise<TikTokNativeAuthStatus>
  'tiktok:begin-native-auth': (payload?: { clientKey?: string }) => Promise<TikTokNativeAuthStatus>
  'tiktok:cancel-native-auth': () => Promise<TikTokNativeAuthStatus>
  'tiktok:disconnect-native-auth': () => Promise<TikTokNativeAuthStatus>
  'tiktok:prepare-live': (payload?: {
    title?: string
    orientation?: 'portrait' | 'landscape'
  }) => Promise<TikTokNativeLiveDestination>
  'tiktok:complete-live': () => Promise<void>
  'tiktok:open-developer-portal': () => Promise<void>
  'tiktok:open-partner-support': () => Promise<void>
  'youtube:begin-auth': (payload: {
    clientId?: string
    clientSecret?: string
  }) => Promise<{ clientId: string; clientSecret: string; accessToken: string; refreshToken: string }>
  'youtube:prepare-live': (payload?: { title?: string; categoryId?: string }) => Promise<{
    rtmpUrl: string
    streamKey: string
    broadcastId: string
    watchUrl: string
    title: string
    autoStart: boolean
    createdBroadcast: boolean
  }>
  'youtube:update-stream-info': (payload: {
    title?: string
    categoryId?: string
  }) => Promise<{ broadcastId: string }>
  'kick:subscribe-events': (payload: {
    clientId: string
    clientSecret: string
    broadcasterUserId?: string | number
    channelName?: string
  }) => Promise<KickEventSubscriptionResult>
  'twitch:search-categories': (payload: { query: string }) => Promise<TwitchCategory[]>
  'twitch:update-stream-info': (payload: {
    title?: string
    categoryId?: string
  }) => Promise<{ channel: string }>
  'kick:begin-user-auth': () => Promise<{ connected: boolean }>
  'kick:disconnect-user-auth': () => Promise<{ connected: boolean }>
  'kick:get-user-auth-status': () => Promise<{ connected: boolean; redirectUri: string }>
  'kick:search-categories': (payload: { query: string }) => Promise<TwitchCategory[]>
  'kick:update-stream-info': (payload: {
    title?: string
    categoryId?: string
  }) => Promise<{ ok: boolean }>
  'stream-info:get': () => Promise<BroadcastStreamInfo>
  'stream-info:set': (info: BroadcastStreamInfo) => Promise<void>
  'stream-info:get-presets': () => Promise<StreamInfoPreset[]>
  'stream-info:set-presets': (presets: StreamInfoPreset[]) => Promise<void>
  'event:simulate': (payload: EventLabSimulationPayload) => Promise<AnyStreamEvent>

  // TTS controls
  'tts:skip': () => void
  'tts:clear-queue': () => void
  'tts:pause': () => void
  'tts:resume': () => void
  'tts:set-enabled': (enabled: boolean) => void
  'tts:get-queue': () => TTSQueueItem[]
  'tts:test-speak': (payload: { text: string; voiceProfileId?: string }) => {
    ok: boolean
    reason?: string
  }

  // Voice profiles
  'voice:get-all': () => VoiceProfile[]
  'voice:save': (profile: VoiceProfile) => void
  'voice:delete': (id: string) => boolean

  // Triggers
  'triggers:get-all': () => TriggerRule[]
  'triggers:save': (rule: TriggerRule) => void
  'triggers:delete': (id: string) => void

  // Settings
  'settings:get': (key: AppSettingKey) => AppSettings[typeof key]
  'settings:set': (key: AppSettingKey, value: unknown) => AppSettings[typeof key]
  'settings:get-all': () => AppSettings

  // Overlay
  'overlay:get-status': () => OverlayRuntimeStatus

  // OBS
  'obs:get-status': () => OBSRuntimeStatus
  'obs:reconnect': () => OBSRuntimeStatus

  // Window controls
  'window:minimize': () => void
  'window:maximize': () => void
  'window:close': () => void
  'system:copy-to-clipboard': (text: string) => boolean
  'system:open-windows-settings': (target: WindowsSettingsTarget) => Promise<void>
  'system:get-resource-usage': () => Promise<{ cpuPercent: number; memoryMB: number; processCount: number }>

  // Spotify
  'spotify:connect': (clientId: string) => Promise<SpotifyStatus>
  'spotify:disconnect': () => Promise<void>
  'spotify:get-status': () => SpotifyStatus
  'spotify:get-queue': () => SpotifySongRequest[]
  'spotify:remove-from-queue': (requestId: string) => void
  'spotify:clear-queue': () => void
  'spotify:skip': () => Promise<void>

  // X (Twitter)
  'x:connect': (clientId: string) => Promise<XStatus>
  'x:disconnect': () => void
  'x:get-status': () => XStatus
  'x:get-template': () => string
  'x:set-template': (text: string) => void
  'x:post': (text: string) => Promise<XPostResult>

  // Hue
  'hue:discover-bridges': () => Promise<HueBridge[]>
  'hue:connect': (ip: string, username: string) => Promise<boolean>
  'hue:get-lights': () => Promise<HueLight[]>
  'hue:trigger-flash': (color?: { r: number; g: number; b: number }) => Promise<void>
  'hue:set-safety-lock': (locked: boolean) => Promise<void>
  'hue:get-status': () => { isConnected: boolean; bridgeIp: string | null; username: string | null; isSafetyLocked: boolean }
}

export interface HueBridge {
  id: string
  internalipaddress: string
}

export interface HueLight {
  id: string
  name: string
  on: boolean
  reachable: boolean
}

// --- Main -> Renderer (send/on) ---

export interface IpcEventChannels {
  'event:stream': AnyStreamEvent
  'event:overlay-broadcast': EventLabOverlayBroadcast
  'event:device-broadcast': EventLabDeviceBroadcast
  'automation:run-receipt': AutomationRunReceipt
  'platform:status-change': { platform: Platform; status: ConnectionStatus }
  'platform:error': { platform: Platform; message: string; code?: string }
  'platform:reconnecting': { platform: Platform; attempt: number; maxAttempts: number; delayMs: number; reason?: string }
  'tiktok:native-auth-progress': TikTokNativeAuthProgress
  'settings:changed': AppSettings
  'obs:status-changed': OBSRuntimeStatus
  'voice:changed': VoiceProfile[]
  'tts:queue-update': TTSQueueItem[]
  'tts:speak': { id: string; text: string; username: string; voice: VoiceProfile }
  'tts:prefetch': { id: string; text: string; voice: VoiceProfile | undefined }
  'tts:stop-speaking': void
  'tts:pause': void
  'tts:resume': void
  'action:play-sound': { filePath: string; volume: number }
  /** Panic-stop — renderer stops every active sound it's currently playing. */
  'action:stop-all-sounds': void
  'action:show-alert': {
    html?: string
    template?: string
    imageUrl?: string
    durationMs: number
    animationIn: string
    animationOut: string
  }
  'spotify:status-changed': SpotifyStatus
  'spotify:queue-update': SpotifySongRequest[]
  'spotify:now-playing': NowPlayingPayload
  'x:status-changed': XStatus
}
