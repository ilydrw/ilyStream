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
  emotes?: Array<{
    name: string
    startIndex: number
    endIndex: number
  }>
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
  const message = formatRelayMessage(source)
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

/**
 * Replaces platform-native emote tokens with readable plain text before a
 * message is sent to another platform. TikTok only exposes numeric IDs for its
 * Fan Club emotes, while Twitch supplies a useful emote name.
 */
export function formatRelayMessage(source: RelayMessageSource): string {
  const rawMessage = String(source.message || '')
  const emotes = Array.isArray(source.emotes)
    ? [...source.emotes].sort((a, b) => a.startIndex - b.startIndex)
    : []
  if (emotes.length === 0) return htmlToSingleLinePlainText(rawMessage)

  const parts: string[] = []
  let cursor = 0

  for (const emote of emotes) {
    const startIndex = clampMessageIndex(emote.startIndex, rawMessage.length)
    if (startIndex < cursor) continue

    parts.push(rawMessage.slice(cursor, startIndex))
    parts.push(` ${relayEmoteFallback(source.platform, emote.name)} `)
    cursor = resolveEmoteEndIndex(rawMessage, emote, startIndex)
  }

  parts.push(rawMessage.slice(cursor))
  return htmlToSingleLinePlainText(parts.join(''))
}

function relayEmoteFallback(platform: Platform, value: string): string {
  const label = String(value || '').trim().replace(/^:+|:+$/g, '').trim()
  if (platform === 'tiktok' && (!label || /^\d+$/.test(label) || label === 'emote')) {
    return '[TikTok Fan Club emote]'
  }
  if (label && !/^\d+$/.test(label) && label !== 'emote') {
    return `[${label}]`
  }
  return `[${PLATFORM_LABELS[platform] || 'Platform'} emote]`
}

function resolveEmoteEndIndex(
  message: string,
  emote: { name: string; endIndex: number },
  startIndex: number
): number {
  const rawName = String(emote.name || '').trim()
  const bareName = rawName.replace(/^:+|:+$/g, '')
  const candidates = Array.from(new Set([rawName, bareName, bareName ? `:${bareName}:` : '']))
    .filter(Boolean)

  for (const candidate of candidates) {
    if (message.startsWith(candidate, startIndex)) {
      return Math.min(message.length, startIndex + candidate.length)
    }
  }

  // TikTok often reports an insertion position without putting any token in
  // the comment text. In that case the emote is zero-width and must not eat the
  // surrounding words. Trust the declared range only when it contains a name.
  const declaredEnd = clampMessageIndex(Number(emote.endIndex) + 1, message.length)
  const declaredText = message.slice(startIndex, declaredEnd)
  return candidates.includes(declaredText) ? declaredEnd : startIndex
}

function clampMessageIndex(value: number, length: number): number {
  const index = Number.isFinite(value) ? Math.floor(value) : 0
  return Math.max(0, Math.min(length, index))
}

export function normalizeRelayText(text: string): string {
  return htmlToSingleLinePlainText(text).toLowerCase()
}

/**
 * Minimum overlap for truncation-tolerant matching, so short coincidental
 * prefixes ("ok", "same") never count as the same message.
 */
const RELAY_MATCH_MIN_PREFIX = 20

/**
 * True when two normalized texts are the same relayed message, tolerating the
 * ways platforms mangle a sent message before echoing it back: hard length
 * caps (YouTube cuts at 200 chars), and trailing ellipsis from truncation.
 */
export function relayTextsMatch(a: string, b: string): boolean {
  const left = stripTrailingEllipsis(a)
  const right = stripTrailingEllipsis(b)
  if (left === right) return true
  if (left.length >= RELAY_MATCH_MIN_PREFIX && right.startsWith(left)) return true
  if (right.length >= RELAY_MATCH_MIN_PREFIX && left.startsWith(right)) return true
  return false
}

function stripTrailingEllipsis(text: string): string {
  return text.replace(/(?:\.{3}|…)\s*$/u, '').trimEnd()
}

const LABEL_TO_PLATFORM = new Map<string, Platform>(
  (Object.entries(PLATFORM_LABELS) as Array<[Platform, string]>).map(([platform, label]) => [
    label.toLowerCase(),
    platform
  ])
)

export interface RelayEchoCandidate {
  /** Normalized message text with the relay decoration(s) stripped. */
  core: string
  /** Author name implied by a leading "name:" prefix, if one was stripped. */
  displayName: string | null
  /** Platform implied by a leading "[Label]" tag, if one was stripped. */
  sourcePlatform: Platform | null
}

/**
 * Possible readings of a message as a relayed copy of someone else's message.
 * Covers the formats ilyStream's own relay produces in every tag mode, plus
 * the "name: message" shape third-party relay bots (StreamElements, Restream)
 * use. Callers decide whether a candidate is a real echo by checking its core
 * text (and implied author) against recently seen originals — a leading
 * "name:" alone proves nothing ("PSA: go follow ily" is a normal message).
 */
export function getRelayEchoCandidates(message: string): RelayEchoCandidate[] {
  const text = htmlToSingleLinePlainText(message).trim()
  if (!text) return []

  const candidates: RelayEchoCandidate[] = []
  let rest = text
  let sourcePlatform: Platform | null = null

  const labelMatch = rest.match(/^\[([^\]]{1,24})\]\s*/)
  if (labelMatch) {
    const platform = LABEL_TO_PLATFORM.get(labelMatch[1].trim().toLowerCase())
    if (platform) {
      sourcePlatform = platform
      rest = rest.slice(labelMatch[0].length)
      candidates.push({ core: rest.toLowerCase(), displayName: null, sourcePlatform })
    }
  }

  const nameMatch = rest.match(/^([^:]{1,64}?)\s*:\s+(\S[\s\S]*)$/)
  if (nameMatch) {
    candidates.push({
      core: nameMatch[2].trim().toLowerCase(),
      displayName: nameMatch[1].trim(),
      sourcePlatform
    })
  }

  return candidates
}
