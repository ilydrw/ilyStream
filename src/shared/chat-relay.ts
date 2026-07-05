import {
  ALL_PLATFORMS,
  STREAM_PLATFORMS,
  type Platform,
  type PlatformChatCapability
} from '../main/platforms/types'
import { htmlToSingleLinePlainText } from './plain-text'

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
  kick: 'Kick',
  x: 'X',
  discord: 'Discord',
  facebook: 'Facebook',
  instagram: 'Instagram',
  restream: 'Restream',
  linkedin: 'LinkedIn',
  telegram: 'Telegram'
}

export const RELAY_TAG_MODES: RelayTagMode[] = [
  'platform-and-user',
  'user-only',
  'platform-only',
  'message-only'
]

export const DEFAULT_AUTO_RELAY_PLATFORMS: RelayPlatformParticipation = Object.fromEntries(
  ALL_PLATFORMS.map((platform) => [
    platform,
    (STREAM_PLATFORMS as readonly Platform[]).includes(platform)
  ])
) as RelayPlatformParticipation

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

  return Object.fromEntries(
    ALL_PLATFORMS.map((platform) => [
      platform,
      candidate[platform] === undefined
        ? DEFAULT_AUTO_RELAY_PLATFORMS[platform]
        : Boolean(candidate[platform])
    ])
  ) as RelayPlatformParticipation
}

export function getSendablePlatforms(
  capabilities: Partial<Record<Platform, PlatformChatCapability>>
): Platform[] {
  return (Object.keys(capabilities) as Platform[]).filter(
    (platform) => capabilities[platform]?.canSend
  )
}

export function getAutoRelayTargets(
  capabilities: Partial<Record<Platform, PlatformChatCapability>>,
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
  const displayName = htmlToSingleLinePlainText(source.displayName)
  const message = htmlToSingleLinePlainText(source.message)
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
  return htmlToSingleLinePlainText(text).toLowerCase()
}
