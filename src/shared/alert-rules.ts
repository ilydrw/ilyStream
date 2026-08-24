import type { EventType, Platform } from '../main/platforms/types'

export type AlertRulePlatform = Platform | 'all'
export type AlertRuleEventType = Extract<EventType, 'chat' | 'gift' | 'subscription' | 'follow' | 'raid' | 'like' | 'share' | 'join'>
export type AlertRuleLayout = 'stacked' | 'side-by-side' | 'text-only' | 'image-only'
export type AlertRuleAnimationIn = 'fade' | 'slide' | 'bounce' | 'zoom'
export type AlertRuleAnimationOut = 'fade' | 'slide' | 'tv-warp'
export type AlertRuleImagePlacement = 'auto' | 'left' | 'right' | 'top' | 'bottom'
export type AlertRuleTextAlign = 'auto' | 'left' | 'center' | 'right'

export interface AlertRule {
  id: string
  name: string
  enabled: boolean
  platforms: AlertRulePlatform[]
  eventTypes: AlertRuleEventType[]
  priority: number
  cooldownMs: number
  minGiftCount: number
  minAmountCents: number
  keyword: string
  soundEnabled: boolean
  soundId: string
  soundVolume: number
  imageEnabled: boolean
  imageAssetId: string
  useEventImage: boolean
  textEnabled: boolean
  textTemplate: string
  textColor: string
  backgroundColor: string
  /** 0–100 card background alpha; -1 keeps whatever alpha backgroundColor itself carries (legacy rules). 0 renders fully transparent. */
  backgroundOpacity: number
  borderColor: string
  /** Card border thickness in px; 0 removes the border. */
  borderWidth: number
  /** Card corner radius in px; -1 inherits the alerts widget's radius. */
  borderRadius: number
  fontSize: number
  fontWeight: number
  textShadow: string
  /** 'auto' derives from layout: centered when stacked, left when side-by-side. */
  textAlign: AlertRuleTextAlign
  layout: AlertRuleLayout
  animationIn: AlertRuleAnimationIn
  animationOut: AlertRuleAnimationOut
  durationMs: number
  imageTop: number
  imageLeft: number
  /** Square image edge in px; 0 = automatic (200 stacked / 120 side-by-side). */
  imageSize: number
  /** Which side of the text the image sits on; 'auto' derives from layout. */
  imagePlacement: AlertRuleImagePlacement
  /** Card inner padding in px; -1 = automatic per layout. */
  paddingX: number
  paddingY: number
  /** Screen position in % of the overlay; -1 defers to the global alert position setting. */
  alertTop: number
  alertLeft: number
}

/**
 * Defaults for the style fields added after rules started being persisted.
 * Saved rules from older versions simply lack these keys — every consumer
 * (editor UI, payload builder, overlay template) treats `undefined` the same
 * as these sentinels, so old rules keep rendering exactly as before.
 */
export const ALERT_RULE_STYLE_DEFAULTS = {
  backgroundOpacity: -1,
  borderWidth: 1,
  borderRadius: -1,
  textAlign: 'auto' as AlertRuleTextAlign,
  imageSize: 0,
  imagePlacement: 'auto' as AlertRuleImagePlacement,
  paddingX: -1,
  paddingY: -1,
  alertTop: -1,
  alertLeft: -1
}

export interface ComposedAlertBackground {
  /** Final CSS color, or null when the input color couldn't be parsed. */
  css: string | null
  /** Effective alpha 0–1, or null when unknown (unparseable color). */
  alpha: number | null
}

/**
 * Combines a rule's background color with its 0–100 opacity slider.
 * The color may be hex (#rgb/#rrggbb/#rrggbbaa) or rgb()/rgba() — legacy
 * rules stored full rgba() strings with the alpha baked in. An opacity of
 * -1 (or anything non-finite) keeps the color's own alpha.
 */
export function composeAlertBackground(color: unknown, opacityPercent: unknown): ComposedAlertBackground {
  const parsed = parseCssColor(typeof color === 'string' ? color : '')
  if (!parsed) return { css: null, alpha: null }

  const pct = Number(opacityPercent)
  const alpha = Number.isFinite(pct) && pct >= 0
    ? Math.min(100, Math.max(0, pct)) / 100
    : parsed.alpha

  return {
    css: `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${roundAlpha(alpha)})`,
    alpha
  }
}

function parseCssColor(value: string): { r: number; g: number; b: number; alpha: number } | null {
  const raw = value.trim()

  const hexMatch = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i)
  if (hexMatch) {
    let hex = hexMatch[1]
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    const alpha = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
    return { r, g, b, alpha }
  }

  const rgbMatch = raw.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([0-9.]+)\s*)?\)$/i)
  if (rgbMatch) {
    const clamp255 = (n: number) => Math.min(255, Math.max(0, n))
    const alpha = rgbMatch[4] === undefined ? 1 : Math.min(1, Math.max(0, Number(rgbMatch[4])))
    if (!Number.isFinite(alpha)) return null
    return {
      r: clamp255(Number(rgbMatch[1])),
      g: clamp255(Number(rgbMatch[2])),
      b: clamp255(Number(rgbMatch[3])),
      alpha
    }
  }

  return null
}

function roundAlpha(alpha: number): number {
  return Math.round(alpha * 1000) / 1000
}

export const ALERT_RULE_PLATFORMS: AlertRulePlatform[] = ['all', 'tiktok', 'twitch', 'youtube', 'kick']
export const ALERT_RULE_EVENT_TYPES: AlertRuleEventType[] = ['chat', 'gift', 'subscription', 'follow', 'raid', 'like', 'share', 'join']

/**
 * Which event types each platform actually emits. Used by the Alerts page to
 * scope the event-type picker per platform section so users can't configure
 * rules for events that will never fire.
 *
 * `Partial` because only the four live-chat platforms emit alertable events;
 * the rest of the Platform union (x, discord, restream, ...) are listed for
 * other features but don't push stream events through the alert pipeline.
 *
 * Verified against the connectors:
 *  - TikTok:  tiktok-connector.ts setupEventListeners (chat, gift, like, follow, share, member→join)
 *  - Twitch:  twitch-connector.ts (subscription, raid, gift/bits, chat, follow via EventSub)
 *  - YouTube: youtube-connector.ts (textMessageEvent → chat, superChatEvent → gift)
 *  - Kick:    kick-connector.ts (chat, subscription, follow; raid mapped but
 *             only wired through the Pusher fallback — kept here because the
 *             mapping is real and works on that path)
 */
export const SUPPORTED_EVENTS_BY_PLATFORM: Partial<Record<Platform, AlertRuleEventType[]>> = {
  tiktok:  ['chat', 'gift', 'like', 'follow', 'share', 'join'],
  twitch:  ['chat', 'gift', 'follow', 'subscription', 'raid'],
  youtube: ['chat', 'gift'],
  kick:    ['chat', 'follow', 'subscription', 'raid']
}

export const DEFAULT_ALERT_RULES: AlertRule[] = [
  {
    id: 'default-gifts',
    name: 'Gifts and tips',
    enabled: true,
    platforms: ['all'],
    eventTypes: ['gift'],
    priority: 100,
    cooldownMs: 10000,
    minGiftCount: 1,
    minAmountCents: 0,
    keyword: '',
    soundEnabled: true,
    soundId: '',
    soundVolume: 1,
    imageEnabled: true,
    imageAssetId: '',
    useEventImage: true,
    textEnabled: true,
    textTemplate: '{displayName} sent {giftCount}x {giftName}!',
    textColor: '#ffffff',
    backgroundColor: '#12161e',
    borderColor: 'rgba(247, 201, 72, 0.26)',
    fontSize: 32,
    fontWeight: 760,
    textShadow: '0 8px 26px rgba(0,0,0,0.36)',
    layout: 'side-by-side',
    animationIn: 'slide',
    animationOut: 'fade',
    durationMs: 4200,
    imageTop: 0,
    imageLeft: 0,
    ...ALERT_RULE_STYLE_DEFAULTS,
    backgroundOpacity: 82
  },
  {
    id: 'default-follows',
    name: 'Follows',
    enabled: true,
    platforms: ['all'],
    eventTypes: ['follow'],
    priority: 90,
    cooldownMs: 0,
    minGiftCount: 0,
    minAmountCents: 0,
    keyword: '',
    soundEnabled: true,
    soundId: '',
    soundVolume: 1,
    imageEnabled: true,
    imageAssetId: '',
    useEventImage: true,
    textEnabled: true,
    textTemplate: '{displayName} is now following!',
    textColor: '#ffffff',
    backgroundColor: '#12161e',
    borderColor: 'rgba(56, 189, 248, 0.24)',
    fontSize: 31,
    fontWeight: 760,
    textShadow: '0 8px 26px rgba(0,0,0,0.36)',
    layout: 'side-by-side',
    animationIn: 'slide',
    animationOut: 'fade',
    durationMs: 3800,
    imageTop: 0,
    imageLeft: 0,
    ...ALERT_RULE_STYLE_DEFAULTS,
    backgroundOpacity: 82
  },
  {
    id: 'default-subs',
    name: 'Subs, members, and superfans',
    enabled: true,
    platforms: ['all'],
    eventTypes: ['subscription', 'join'],
    priority: 95,
    cooldownMs: 600000,
    minGiftCount: 0,
    minAmountCents: 0,
    keyword: '',
    soundEnabled: true,
    soundId: '',
    soundVolume: 1,
    imageEnabled: true,
    imageAssetId: '',
    useEventImage: true,
    textEnabled: true,
    textTemplate: '{displayName} joined {tier} for {months} months!',
    textColor: '#fef3c7',
    backgroundColor: '#000000',
    borderColor: 'gradient',
    fontSize: 46,
    fontWeight: 800,
    textShadow: '0 4px 12px rgba(0,0,0,0.5)',
    layout: 'stacked',
    animationIn: 'zoom',
    animationOut: 'fade',
    durationMs: 5000,
    imageTop: 0,
    imageLeft: 0,
    ...ALERT_RULE_STYLE_DEFAULTS,
    backgroundOpacity: 5
  },
  {
    id: 'default-raids',
    name: 'Raids and hosts',
    enabled: true,
    platforms: ['twitch', 'kick'],
    eventTypes: ['raid'],
    priority: 92,
    cooldownMs: 0,
    minGiftCount: 0,
    minAmountCents: 0,
    keyword: '',
    soundEnabled: false,
    soundId: '',
    soundVolume: 1,
    imageEnabled: true,
    imageAssetId: '',
    useEventImage: true,
    textEnabled: true,
    textTemplate: '{displayName} raided with {viewerCount} viewers!',
    textColor: '#ffffff',
    backgroundColor: '#000000',
    borderColor: 'gradient',
    fontSize: 46,
    fontWeight: 800,
    textShadow: '0 4px 12px rgba(0,0,0,0.5)',
    layout: 'stacked',
    animationIn: 'bounce',
    animationOut: 'fade',
    durationMs: 6000,
    imageTop: 0,
    imageLeft: 0,
    ...ALERT_RULE_STYLE_DEFAULTS,
    backgroundOpacity: 5
  }
]
