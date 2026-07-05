import { AnyStreamEvent } from '../platforms/types'
import type { OverlayAlertItem, OverlayFeedBadge, OverlayFeedItem } from '../../shared/overlay'
import { shouldSuppressStreamEventFromChat } from '../../shared/chat-event-filter'
import { htmlToPlainText, plainTextToSafeHtml } from '../../shared/plain-text'

const PLATFORM_LABELS: Record<string, string> = {
  tiktok: 'TikTok',
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick'
}

const PLATFORM_COLORS: Record<string, string> = {
  tiktok: '#ff0050',
  twitch: '#9147ff',
  youtube: '#ff3333',
  kick: '#53fc18'
}

function formatCurrency(cents: number): string {
  if (cents <= 0) return ''
  return `$${(cents / 100).toFixed(2)}`
}

function toISO(ts: Date | string): string {
  return ts instanceof Date ? ts.toISOString() : String(ts)
}

function feedBadgeLabel(badge: { id?: unknown; name?: unknown }): string {
  return `${badge?.id ?? ''} ${badge?.name ?? ''}`.toLowerCase()
}

function findFeedBadgeImage(
  badges: Array<{ id?: unknown; name?: unknown; imageUrl?: unknown }>,
  matcher: (label: string) => boolean
): string | undefined {
  const hit = badges.find(
    (b) => matcher(feedBadgeLabel(b)) && typeof b.imageUrl === 'string' && b.imageUrl.trim()
  )
  return typeof hit?.imageUrl === 'string' ? hit.imageUrl : undefined
}

/**
 * Role badges for a feed item — every role the app tracks on a chat user
 * (moderator, member/sub/fan-club, super fan, VIP, team/staff), derived the
 * same way the in-app chat + stats surfaces do. Used to render badges next to
 * names on the chat overlays.
 */
function deriveFeedBadges(event: AnyStreamEvent): OverlayFeedBadge[] | undefined {
  const user = (event as { user?: any }).user
  if (!user) return undefined

  const rawBadges: Array<{ id?: unknown; name?: unknown; imageUrl?: unknown }> =
    Array.isArray(user.badges) ? user.badges : []
  const has = (matcher: (label: string) => boolean) => rawBadges.some((b) => matcher(feedBadgeLabel(b)))
  const isSuperFanLabel = (l: string) => l.includes('super fan') || l.includes('superfan')
  const isFanClubLabel = (l: string) => l.includes('fan club') || l.includes('fanclub') || l.includes('subscriber') || l.includes('member')
  const isModLabel = (l: string) => l === 'mod' || l.includes('moderator')
  const isVipLabel = (l: string) => l.includes('vip')
  const isTeamLabel = (l: string) => l.includes('staff') || l.includes('team') || l.includes('owner') || l.includes('broadcaster')

  const memberTitle =
    event.platform === 'tiktok' ? 'TikTok Fan Club' :
    event.platform === 'twitch' ? 'Twitch Sub' :
    event.platform === 'youtube' ? 'YouTube Member' :
    event.platform === 'kick' ? 'Kick Sub' :
    'Member'

  const superFan = Boolean(user.isSuperFan || has(isSuperFanLabel))
  const member = Boolean(superFan || user.isFanClubMember || user.isSubscriber || has(isFanClubLabel))

  const badges: OverlayFeedBadge[] = []

  if (user.isModerator) {
    badges.push({ kind: 'mod', title: 'Moderator', imageUrl: findFeedBadgeImage(rawBadges, isModLabel) })
  }
  if (member) {
    badges.push({ kind: 'member', title: memberTitle, imageUrl: findFeedBadgeImage(rawBadges, isFanClubLabel) })
  }
  if (superFan) {
    badges.push({ kind: 'superfan', title: 'Super Fan', imageUrl: findFeedBadgeImage(rawBadges, isSuperFanLabel) })
  }
  if (user.isVip) {
    badges.push({ kind: 'vip', title: 'VIP', imageUrl: findFeedBadgeImage(rawBadges, isVipLabel) })
  }
  if (user.isTeamMember) {
    badges.push({ kind: 'team', title: 'Team', imageUrl: findFeedBadgeImage(rawBadges, isTeamLabel) })
  }

  return badges.length ? badges : undefined
}

export function eventToOverlayFeedItem(event: AnyStreamEvent): OverlayFeedItem | null {
  const platformLabel = PLATFORM_LABELS[event.platform] ?? event.platform
  const accentColor = PLATFORM_COLORS[event.platform] ?? '#ff7a45'
  const badges = deriveFeedBadges(event)

  switch (event.type) {
    case 'chat':
      if (shouldSuppressStreamEventFromChat(event)) return null
      return {
        id: event.id,
        kind: 'chat',
        platform: event.platform,
        platformLabel,
        displayName: event.user.displayName || event.user.username,
        profilePictureUrl: event.user.profilePictureUrl,
        badges,
        message: event.message,
        accentColor,
        timestamp: toISO(event.timestamp),
        emphasis: false
      }

    case 'gift':
      if (event.isCombo) return null
      return {
        id: event.id,
        kind: 'gift',
        platform: event.platform,
        platformLabel,
        displayName: event.user.displayName || event.user.username,
        profilePictureUrl: event.user.profilePictureUrl,
        badges,
        message: `sent ${event.giftCount} ${event.giftName}`,
        meta: formatCurrency(event.monetaryValue) || undefined,
        accentColor,
        timestamp: toISO(event.timestamp),
        emphasis: true
      }

    case 'subscription':
      return {
        id: event.id,
        kind: 'subscription',
        platform: event.platform,
        platformLabel,
        displayName: event.user.displayName || event.user.username,
        profilePictureUrl: event.user.profilePictureUrl,
        badges,
        message: event.isGift
          ? `received a gifted ${event.tier} subscription`
          : `subscribed at ${event.tier}${event.months > 1 ? ` for ${event.months} months` : ''}`,
        accentColor,
        timestamp: toISO(event.timestamp),
        emphasis: true
      }

    case 'follow':
      return {
        id: event.id,
        kind: 'follow',
        platform: event.platform,
        platformLabel,
        displayName: event.user.displayName || event.user.username,
        profilePictureUrl: event.user.profilePictureUrl,
        badges,
        message: 'followed the stream',
        accentColor,
        timestamp: toISO(event.timestamp),
        emphasis: true
      }

    case 'raid':
      return {
        id: event.id,
        kind: 'raid',
        platform: event.platform,
        platformLabel,
        displayName: event.user.displayName || event.user.username,
        profilePictureUrl: event.user.profilePictureUrl,
        badges,
        message: `raided with ${event.viewerCount} viewers`,
        accentColor,
        timestamp: toISO(event.timestamp),
        emphasis: true
      }

    case 'like':
      return null

    case 'share':
      return {
        id: event.id,
        kind: 'share',
        platform: event.platform,
        platformLabel,
        displayName: event.user.displayName || event.user.username,
        profilePictureUrl: event.user.profilePictureUrl,
        badges,
        message: 'shared the stream',
        accentColor,
        timestamp: toISO(event.timestamp),
        emphasis: true
      }

    default:
      return null
  }
}

export function shouldBroadcastParticleEvent(event: AnyStreamEvent): boolean {
  // TikTok sends in-progress combo/streak updates as repeated gift events.
  // Particle overlays are heavy, so only the final non-combo gift should burst.
  if (event.type === 'gift') return !event.isCombo
  return event.type === 'follow' || event.type === 'like'
}

export function sanitizeOverlayHtml(html: string): string {
  return plainTextToSafeHtml(htmlToPlainText(html))
}

export function createOverlayAlertItem(
  payload: {
    id?: string
    eventType?: string
    variant?: string
    eyebrow?: string
    headline?: string
    subtitle?: string
    meta?: string
    accentColor?: string
    template?: string
    html?: string
    imageUrl?: string
    audioUrl?: string
    audioVolume?: number
    durationMs: number
    animationIn: 'fade' | 'slide' | 'bounce' | 'zoom' | 'wave'
    animationOut: 'fade' | 'slide' | 'tv-warp' | 'dissolve'
    textColor?: string
    backgroundColor?: string
    borderColor?: string
    fontSize?: number
    fontWeight?: number
    textShadow?: string
    layout?: 'stacked' | 'side-by-side' | 'text-only' | 'image-only'
    imageTop?: number
    imageLeft?: number
    alertTop?: number
    alertLeft?: number
  },
  platform: string
): OverlayAlertItem {
  return {
    id: payload.id || crypto.randomUUID(),
    platform,
    eventType: cleanOptionalString(payload.eventType),
    variant: cleanOptionalString(payload.variant),
    eyebrow: cleanOptionalString(payload.eyebrow),
    headline: cleanOptionalString(payload.headline),
    subtitle: cleanOptionalString(payload.subtitle),
    meta: cleanOptionalString(payload.meta),
    accentColor: cleanOptionalString(payload.accentColor),
    html: sanitizeOverlayHtml(payload.template ?? payload.html ?? ''),
    imageUrl: payload.imageUrl,
    audioUrl: payload.audioUrl,
    audioVolume: clampNumber(payload.audioVolume, 0, 1),
    durationMs: clampDuration(payload.durationMs),
    animationIn: payload.animationIn,
    animationOut: payload.animationOut,
    textColor: payload.textColor,
    backgroundColor: payload.backgroundColor,
    borderColor: payload.borderColor,
    fontSize: payload.fontSize,
    fontWeight: payload.fontWeight,
    textShadow: payload.textShadow,
    layout: payload.layout || 'stacked',
    imageTop: clampNumber(payload.imageTop, -1000, 1000),
    imageLeft: clampNumber(payload.imageLeft, -1000, 1000),
    alertTop: clampNumber(payload.alertTop, 0, 100),
    alertLeft: clampNumber(payload.alertLeft, 0, 100),
    createdAt: new Date().toISOString()
  }
}

export function limitHistory<T>(items: T[], maxItems: number): T[] {
  return items.slice(-maxItems)
}

function cleanOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function clampNumber(value: unknown, min: number, max: number): number | undefined {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return undefined
  return Math.min(max, Math.max(min, numeric))
}

function clampDuration(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 5000
  return Math.min(30000, Math.max(1000, Math.round(numeric)))
}
