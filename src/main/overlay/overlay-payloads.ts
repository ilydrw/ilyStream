import { AnyStreamEvent } from '../platforms/types'
import type { OverlayAlertItem, OverlayFeedItem } from '../../shared/overlay'

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

export function eventToOverlayFeedItem(event: AnyStreamEvent): OverlayFeedItem | null {
  const platformLabel = PLATFORM_LABELS[event.platform] ?? event.platform
  const accentColor = PLATFORM_COLORS[event.platform] ?? '#ff7a45'

  switch (event.type) {
    case 'chat':
      return {
        id: event.id,
        kind: 'chat',
        platform: event.platform,
        platformLabel,
        displayName: event.user.displayName || event.user.username,
        profilePictureUrl: event.user.profilePictureUrl,
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
        message: `raided with ${event.viewerCount} viewers`,
        accentColor,
        timestamp: toISO(event.timestamp),
        emphasis: true
      }

    case 'like':
      return {
        id: event.id,
        kind: 'like',
        platform: event.platform,
        platformLabel,
        displayName: event.user.displayName || event.user.username,
        profilePictureUrl: event.user.profilePictureUrl,
        message: `sent ${event.likeCount} likes`,
        amount: event.likeCount,
        meta: event.totalLikes > 0 ? `${event.totalLikes.toLocaleString()} total` : undefined,
        accentColor,
        timestamp: toISO(event.timestamp),
        emphasis: false
      }

    case 'share':
      return {
        id: event.id,
        kind: 'share',
        platform: event.platform,
        platformLabel,
        displayName: event.user.displayName || event.user.username,
        profilePictureUrl: event.user.profilePictureUrl,
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
  return event.type !== 'gift' || !event.isCombo
}

export function sanitizeOverlayHtml(html: string): string {
  return (
    html
      // Remove <script> blocks (including multiline)
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      // Remove dangerous tags wholesale: iframe, object, embed, form, meta, link, base
      .replace(/<\/?(iframe|object|embed|form|input|button|textarea|select|meta|link|base)[^>]*>/gi, '')
      // Remove event handler attributes — allow optional whitespace around the =
      .replace(/\s+on[a-z]+\s*=\s*(['"])[\s\S]*?\1/gi, '')
      .replace(/\s+on[a-z]+\s*=\s*[^\s>]*/gi, '')
      // Remove dangerous URI schemes (javascript:, vbscript:, data: in href/src/action)
      .replace(/\b(javascript|vbscript):/gi, '')
      .replace(/([\s"'=])(data:)/gi, '$1data-blocked:')
  )
}

export function createOverlayAlertItem(
  payload: {
    id?: string
    template: string
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
    html: sanitizeOverlayHtml(payload.template),
    imageUrl: payload.imageUrl,
    audioUrl: payload.audioUrl,
    audioVolume: clampNumber(payload.audioVolume, 0, 1),
    durationMs: Math.min(Math.max(Math.round(payload.durationMs), 1000), 30000),
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

function clampNumber(value: unknown, min: number, max: number): number | undefined {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return undefined
  return Math.min(max, Math.max(min, numeric))
}
