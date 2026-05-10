import type { EventType, Platform } from '../main/platforms/types'

export type AlertRulePlatform = Platform | 'all'
export type AlertRuleEventType = Extract<EventType, 'chat' | 'gift' | 'subscription' | 'follow' | 'raid' | 'like' | 'share' | 'join'>
export type AlertRuleLayout = 'stacked' | 'side-by-side' | 'text-only' | 'image-only'
export type AlertRuleAnimationIn = 'fade' | 'slide' | 'bounce' | 'zoom'
export type AlertRuleAnimationOut = 'fade' | 'slide' | 'tv-warp'

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
  borderColor: string
  fontSize: number
  fontWeight: number
  textShadow: string
  layout: AlertRuleLayout
  animationIn: AlertRuleAnimationIn
  animationOut: AlertRuleAnimationOut
  durationMs: number
  imageTop: number
  imageLeft: number
}

export const ALERT_RULE_PLATFORMS: AlertRulePlatform[] = ['all', 'tiktok', 'twitch', 'youtube', 'kick']
export const ALERT_RULE_EVENT_TYPES: AlertRuleEventType[] = ['chat', 'gift', 'subscription', 'follow', 'raid', 'like', 'share', 'join']

export const DEFAULT_ALERT_RULES: AlertRule[] = [
  {
    id: 'default-gifts',
    name: 'Gifts and tips',
    enabled: true,
    platforms: ['all'],
    eventTypes: ['gift'],
    priority: 100,
    cooldownMs: 0,
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
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderColor: 'gradient',
    fontSize: 48,
    fontWeight: 800,
    textShadow: '0 4px 12px rgba(0,0,0,0.5)',
    layout: 'stacked',
    animationIn: 'bounce',
    animationOut: 'fade',
    durationMs: 5000,
    imageTop: 0,
    imageLeft: 0
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
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderColor: 'gradient',
    fontSize: 44,
    fontWeight: 800,
    textShadow: '0 4px 12px rgba(0,0,0,0.5)',
    layout: 'stacked',
    animationIn: 'fade',
    animationOut: 'fade',
    durationMs: 5000,
    imageTop: 0,
    imageLeft: 0
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
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderColor: 'gradient',
    fontSize: 46,
    fontWeight: 800,
    textShadow: '0 4px 12px rgba(0,0,0,0.5)',
    layout: 'stacked',
    animationIn: 'zoom',
    animationOut: 'fade',
    durationMs: 5000,
    imageTop: 0,
    imageLeft: 0
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
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderColor: 'gradient',
    fontSize: 46,
    fontWeight: 800,
    textShadow: '0 4px 12px rgba(0,0,0,0.5)',
    layout: 'stacked',
    animationIn: 'bounce',
    animationOut: 'fade',
    durationMs: 6000,
    imageTop: 0,
    imageLeft: 0
  }
]
