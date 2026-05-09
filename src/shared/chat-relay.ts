import type { Platform, PlatformChatCapability } from '../main/platforms/types'

export type RelayTagMode =
  | 'platform-and-user'
  | 'user-only'
  | 'platform-only'
  | 'message-only'

export type RelayPlatformParticipation = Record<Platform, boolean>

export interface RelayMessageSource {
  platform: Platform
  displayName: string
  message: string
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  tiktok: 'TikTok',
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick'
}

export const RELAY_TAG_MODES: RelayTagMode[] = [
  'platform-and-user',
  'user-only',
  'platform-only',
  'message-only'
]

export const DEFAULT_AUTO_RELAY_PLATFORMS: RelayPlatformParticipation = {
  tiktok: true,
  twitch: true,
  youtube: true,
  kick: true
}

export function resolveRelayTagMode(value: unknown): RelayTagMode {
  return RELAY_TAG_MODES.includes(value as RelayTagMode)
    ? (value as RelayTagMode)
    : 'platform-and-user'
}

export function resolveRelayPlatformParticipation(
  value: unknown
): RelayPlatformParticipation {
  const candidate =
    value && typeof value === 'object'
      ? (value as Partial<Record<Platform, unknown>>)
      : {}

  return {
    tiktok:
      candidate.tiktok === undefined
        ? DEFAULT_AUTO_RELAY_PLATFORMS.tiktok
        : Boolean(candidate.tiktok),
    twitch:
      candidate.twitch === undefined
        ? DEFAULT_AUTO_RELAY_PLATFORMS.twitch
        : Boolean(candidate.twitch),
    youtube:
      candidate.youtube === undefined
        ? DEFAULT_AUTO_RELAY_PLATFORMS.youtube
        : Boolean(candidate.youtube),
    kick:
      candidate.kick === undefined ? DEFAULT_AUTO_RELAY_PLATFORMS.kick : Boolean(candidate.kick)
  }
}

export function getSendablePlatforms(
  capabilities: Record<Platform, PlatformChatCapability>
): Platform[] {
  return (Object.keys(capabilities) as Platform[]).filter(
    (platform) => capabilities[platform]?.canSend
  )
}

export function getAutoRelayTargets(
  capabilities: Record<Platform, PlatformChatCapability>,
  participation: RelayPlatformParticipation,
  sourcePlatform: Platform
): Platform[] {
  return getSendablePlatforms(capabilities).filter(
    (platform) => platform !== sourcePlatform && participation[platform]
  )
}

export function buildRelayText(
  source: RelayMessageSource,
  tagMode: RelayTagMode = 'platform-and-user'
): string {
  const displayName = source.displayName.trim()
  const message = source.message.trim()
  const platformLabel = PLATFORM_LABELS[source.platform]

  if (message.length === 0) {
    return ''
  }

  switch (tagMode) {
    case 'user-only':
      return displayName.length > 0 ? `${displayName}: ${message}` : message

    case 'platform-only':
      return `[${platformLabel}] ${message}`

    case 'message-only':
      return message

    case 'platform-and-user':
    default:
      return displayName.length > 0 ? `[${platformLabel}] ${displayName}: ${message}` : `[${platformLabel}] ${message}`
  }
}

export function normalizeRelayText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase()
}
