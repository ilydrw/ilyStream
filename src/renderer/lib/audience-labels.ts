import type { Platform } from '../../main/platforms/types'

export const audiencePlatforms: Platform[] = ['tiktok', 'twitch', 'youtube', 'kick']

export const platformNames: Record<Platform, string> = {
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

export function subscriptionRoleLabel(platform: Platform): string {
  switch (platform) {
    case 'tiktok':
      return 'Fan club'
    case 'youtube':
      return 'Member'
    case 'twitch':
    case 'kick':
      return 'Subscriber'
    default:
      return 'Member'
  }
}

export function subscriptionMetricLabel(platform: Platform | 'all'): string {
  switch (platform) {
    case 'all':
      return 'Paid members'
    case 'tiktok':
      return 'Fan club events'
    case 'youtube':
      return 'Memberships'
    case 'twitch':
    case 'kick':
      return 'Subs'
    default:
      return 'Members'
  }
}

export function subscriptionMetricShortLabel(platform: Platform | 'all'): string {
  switch (platform) {
    case 'tiktok':
      return 'Fan'
    case 'youtube':
      return 'Members'
    case 'twitch':
    case 'kick':
      return 'Subs'
    default:
      return 'Members'
  }
}

export function observedRoleTitle(platform: Platform): string {
  return `${subscriptionRoleLabel(platform)} badge observed from ${platformNames[platform]}. This is a platform role flag, not a super-fan rank.`
}

export function subscriptionMetricTitle(platform: Platform | 'all'): string {
  if (platform === 'all') {
    return 'Paid membership/subscription events across TikTok fan club, Twitch subs, YouTube members, and Kick subs.'
  }

  return `${subscriptionMetricLabel(platform)} counted from ${platformNames[platform]} subscription/member events.`
}

export function normalizeBadgeText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}
