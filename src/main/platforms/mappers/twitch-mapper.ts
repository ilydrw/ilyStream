import { randomUUID } from 'crypto'
import type { 
  ChatEvent, 
  GiftEvent, 
  SubscriptionEvent, 
  RaidEvent, 
  UserInfo,
  FollowEvent,
  Emote
} from '../types'
import { formatSubscriptionTier } from '../../../shared/subscription-display'

export class TwitchMapper {
  mapUserFromMsg(user: string, msg: any, isFollower: boolean): UserInfo {
    const userInfo = msg?.userInfo
    const badges = userInfo?.badges
      ? Array.from(userInfo.badges.entries() as Iterable<[string, string]>).map(([id, version]) => ({
          id,
          name: id,
          imageUrl: version ? `https://static-cdn.jtvnw.net/badges/v1/${id}/${version}/1` : undefined
        }))
      : []
    const badgeText = badges.map((badge) => `${badge.id} ${badge.name}`).join(' ').toLowerCase()

    return {
      id: userInfo?.userId || msg?.userId || msg?.tags?.get?.('user-id') || user,
      username: user,
      displayName: userInfo?.displayName || user,
      profilePictureUrl: undefined,
      isModerator: userInfo?.isMod || false,
      isSubscriber: userInfo?.isSubscriber || false,
      isVip: userInfo?.isVip || false,
      isFollower,
      isFanClubMember: Boolean(userInfo?.isSubscriber),
      isTeamMember: badgeText.includes('staff'),
      badges
    }
  }

  mapChat(user: string, message: string, msg: any, isFollower: boolean): ChatEvent {
    const emotes = extractTwitchEmotes(message, msg)

    return {
      id: msg?.id || randomUUID(),
      platform: 'twitch',
      timestamp: new Date(),
      type: 'chat',
      raw: msg,
      user: this.mapUserFromMsg(user, msg, isFollower),
      message,
      emotes,
      isReply: !!msg.parentMessageId,
      replyToUsername: msg.parentDisplayName || undefined
    }
  }

  mapFollow(e: any): FollowEvent {
    return {
      id: randomUUID(),
      platform: 'twitch',
      timestamp: e.followDate ?? new Date(),
      type: 'follow',
      raw: e,
      user: {
        id: e.userId,
        username: e.userName,
        displayName: e.userDisplayName || e.userName,
        isModerator: false,
        isSubscriber: false,
        isVip: false,
        isFollower: true,
        badges: []
      }
    }
  }

  mapSubscription(user: string, subInfo: any, isGift: boolean): SubscriptionEvent {
    const gifterUsername = subInfo?.gifter || subInfo?.gifterDisplayName
    return {
      id: randomUUID(),
      platform: 'twitch',
      timestamp: new Date(),
      type: 'subscription',
      raw: subInfo,
      user: {
        id: subInfo?.userId || user,
        username: user,
        displayName: subInfo?.displayName || user,
        isModerator: false,
        isSubscriber: true,
        isVip: false,
        badges: []
      },
      tier: formatSubscriptionTier('twitch', subInfo?.plan || '1000'),
      months: subInfo?.months || 1,
      message: subInfo?.message,
      isGift,
      gifterUser: isGift && gifterUsername
        ? {
            id: subInfo?.gifterUserId || gifterUsername,
            username: subInfo?.gifter || gifterUsername,
            displayName: subInfo?.gifterDisplayName || gifterUsername,
            isModerator: false,
            isSubscriber: false,
            isVip: false,
            badges: []
          }
        : undefined,
      monetaryValue: subInfo?.plan === '3000' ? 2499 : subInfo?.plan === '2000' ? 999 : 499
    }
  }

  mapGiftEvent(user: string, msg: any, isFollower: boolean): GiftEvent {
    return {
      id: msg?.id || randomUUID(),
      platform: 'twitch',
      timestamp: new Date(),
      type: 'gift',
      raw: msg,
      user: this.mapUserFromMsg(user, msg, isFollower),
      giftName: 'Bits',
      giftId: 'bits',
      giftCount: msg.bits || 0,
      monetaryValue: msg.bits || 0,
      isCombo: false
    }
  }

  mapRaid(user: string, raidInfo: any): RaidEvent {
    return {
      id: randomUUID(),
      platform: 'twitch',
      timestamp: new Date(),
      type: 'raid',
      raw: raidInfo,
      user: {
        id: user,
        username: user,
        displayName: raidInfo?.displayName || user,
        isModerator: false,
        isSubscriber: false,
        isVip: false,
        badges: []
      },
      viewerCount: raidInfo?.viewerCount || 0
    }
  }
}

export function extractTwitchEmotes(message: string, msg: any): Emote[] {
  const emoteOffsets = extractTwitchEmoteOffsets(msg)
  const emotes: Emote[] = []

  for (const [id, ranges] of emoteOffsets.entries()) {
    for (const range of ranges) {
      const parsed = parseTwitchUtf8Range(message, range)
      if (!parsed) continue

      const name = message.slice(parsed.startIndex, parsed.endIndex + 1)
      if (!name.trim()) continue

      emotes.push({
        id,
        name,
        imageUrl: buildTwitchEmoteImageUrl(id),
        startIndex: parsed.startIndex,
        endIndex: parsed.endIndex
      })
    }
  }

  return emotes.sort((a, b) => a.startIndex - b.startIndex)
}

export function buildTwitchEmoteImageUrl(id: string): string {
  return `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(id)}/default/dark/2.0`
}

function extractTwitchEmoteOffsets(msg: any): Map<string, string[]> {
  for (const candidate of [
    msg?.emoteOffsets,
    readTwitchTag(msg, 'emotes'),
    msg?.emotes,
    msg?.raw?.emotes
  ]) {
    const normalized = normalizeTwitchEmoteOffsets(candidate)
    if (normalized.size > 0) return normalized
  }

  return new Map()
}

function normalizeTwitchEmoteOffsets(value: unknown): Map<string, string[]> {
  if (!value) return new Map()

  if (value instanceof Map) {
    return mapOffsetEntries(Array.from(value.entries()))
  }

  if (typeof value === 'string') {
    return parseTwitchEmoteOffsetString(value)
  }

  if (Array.isArray(value)) {
    return mapOffsetEntries(value as Array<[unknown, unknown]>)
  }

  if (typeof value === 'object') {
    return mapOffsetEntries(Object.entries(value as Record<string, unknown>))
  }

  return new Map()
}

function parseTwitchEmoteOffsetString(value: string): Map<string, string[]> {
  const entries: Array<[string, string[]]> = []

  for (const segment of value.split('/')) {
    const [id, rangesText] = segment.split(':', 2)
    if (!id || !rangesText) continue
    entries.push([id, rangesText.split(',')])
  }

  return mapOffsetEntries(entries)
}

function mapOffsetEntries(entries: Array<[unknown, unknown]>): Map<string, string[]> {
  const offsets = new Map<string, string[]>()

  for (const [rawId, rawRanges] of entries) {
    const id = String(rawId || '').trim()
    if (!id) continue

    const ranges = normalizeTwitchRanges(rawRanges)
    if (ranges.length > 0) offsets.set(id, ranges)
  }

  return offsets
}

function normalizeTwitchRanges(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((range) => String(range).trim()).filter(Boolean)
  }

  if (typeof value === 'string') {
    return value.split(',').map((range) => range.trim()).filter(Boolean)
  }

  return []
}

function parseTwitchUtf8Range(
  message: string,
  range: string
): { startIndex: number; endIndex: number } | null {
  const [startText, endText] = range.split('-', 2)
  const start = Number.parseInt(startText, 10)
  const end = Number.parseInt(endText, 10)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null

  const startIndex = utf8OffsetToUtf16Index(message, start)
  const endIndex = utf8OffsetToUtf16Index(message, end + 1) - 1
  if (startIndex < 0 || endIndex < startIndex || startIndex >= message.length) return null

  return {
    startIndex,
    endIndex: Math.min(endIndex, message.length - 1)
  }
}

function utf8OffsetToUtf16Index(value: string, targetOffset: number): number {
  if (targetOffset <= 0) return 0

  let utf8Offset = 0
  for (let index = 0; index < value.length;) {
    if (utf8Offset >= targetOffset) return index

    const codePoint = value.codePointAt(index)
    if (codePoint === undefined) break

    const character = String.fromCodePoint(codePoint)
    const nextOffset = utf8Offset + Buffer.byteLength(character, 'utf8')
    if (targetOffset < nextOffset) return index

    utf8Offset = nextOffset
    index += character.length
  }

  return value.length
}

function readTwitchTag(msg: any, key: string): unknown {
  for (const tags of [msg?.tags, msg?._tags, msg?.rawTags, msg?.ircTags]) {
    if (!tags) continue

    if (typeof tags.get === 'function') {
      const value = tags.get(key)
      if (value) return value
    }

    if (typeof tags === 'object' && key in tags) {
      return tags[key]
    }
  }

  return undefined
}
