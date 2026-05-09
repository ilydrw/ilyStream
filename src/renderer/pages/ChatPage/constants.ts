import type { Platform, PlatformChatCapability } from '../../../main/platforms/types'
import { type RelayTagMode } from '../../../shared/chat-relay'

export const platforms = ['all', 'tiktok', 'twitch', 'youtube', 'kick'] as const

export const platformBadgeColors: Record<Platform, string> = {
  tiktok: 'border-tiktok/35 bg-tiktok/10 text-tiktok',
  twitch: 'border-twitch/35 bg-twitch/10 text-twitch',
  youtube: 'border-youtube/35 bg-youtube/10 text-youtube',
  kick: 'border-kick/35 bg-kick/10 text-kick'
}

export const defaultCapabilities: Record<Platform, PlatformChatCapability> = {
  tiktok: { platform: 'tiktok', canSend: false, reason: 'Not connected' },
  twitch: { platform: 'twitch', canSend: false, reason: 'Not connected' },
  youtube: { platform: 'youtube', canSend: false, reason: 'Not connected' },
  kick: { platform: 'kick', canSend: false, reason: 'Not connected' }
}

export const relayTagModeOptions: Array<{
  value: RelayTagMode
  label: string
  description: string
}> = [
  {
    value: 'platform-and-user',
    label: '[Platform] User: message',
    description: 'Clear source and username.'
  },
  {
    value: 'user-only',
    label: 'User: message',
    description: 'Keeps names, hides platform.'
  },
  {
    value: 'platform-only',
    label: '[Platform] message',
    description: 'Shows source only.'
  },
  {
    value: 'message-only',
    label: 'message only',
    description: 'Shortest relay format.'
  }
]
