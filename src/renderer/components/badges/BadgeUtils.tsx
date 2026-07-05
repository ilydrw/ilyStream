import React from 'react'
import type { UserIdentity, UserStat } from '../../../shared/stats'
import { OfficialBadge } from './OfficialBadge'
import { platformNames } from '../../lib/audience-labels'
import { platformOrderIndex } from '../../lib/platform-order'

export type AudienceBadge = {
  key: string
  icon?: React.ReactNode
  title: string
  className: string
  size: number
  imageUrl?: string | null
}

function iconBadge(key: string, icon: React.ReactNode, title: string, size: number, className = '', imageUrl?: string | null): AudienceBadge {
  return { key, icon, title, size, className, imageUrl }
}

function badgePriority(badge: AudienceBadge): number {
  return badge.key.endsWith('-mod') ? 0 : 1
}

function badgePlatform(badge: AudienceBadge): string {
  return badge.key.split('-')[0] || ''
}

function badgeKindPriority(badge: AudienceBadge): number {
  if (badge.key.endsWith('-mod')) return 0
  if (badge.key === 'tiktok-fan-club') return 1
  if (badge.key === 'tiktok-superfan') return 2
  if (badge.key === 'twitch-sub') return 1
  if (badge.key === 'youtube-superfan') return 1
  if (badge.key === 'kick-sub') return 1
  return 9
}

function compareBadges(a: AudienceBadge, b: AudienceBadge): number {
  return badgePriority(a) - badgePriority(b)
    || platformOrderIndex(badgePlatform(a)) - platformOrderIndex(badgePlatform(b))
    || badgeKindPriority(a) - badgeKindPriority(b)
    || a.key.localeCompare(b.key)
}

export function buildAccountBadges(account: UserStat, limit = 5, badgeSize = 14): AudienceBadge[] {
  const badgeLimit = Math.max(0, limit)
  const badges: AudienceBadge[] = []

  if (account.isModerator) {
    badges.push(iconBadge(
      `${account.platform}-mod`,
      <OfficialBadge role="mod" platform={account.platform} size={badgeSize} />,
      `Moderator on ${platformNames[account.platform]}`,
      badgeSize,
      '',
      account.badgeImageUrls?.moderator
    ))
  }

  if (account.platform === 'tiktok' && (account.isFanClubMember || account.isSuperFan)) {
    badges.push(iconBadge(
      'tiktok-fan-club',
      <OfficialBadge role="member" platform={account.platform} size={badgeSize} />,
      'TikTok Fan Club badge',
      badgeSize,
      '',
      account.badgeImageUrls?.tiktokFanClub
    ))
  }

  if (account.platform === 'tiktok' && account.isSuperFan) {
    badges.push(iconBadge(
      'tiktok-superfan',
      <OfficialBadge role="superfan" platform={account.platform} size={badgeSize} />,
      'TikTok Super Fan badge',
      badgeSize,
      '',
      account.badgeImageUrls?.tiktokSuperFan
    ))
  }

  if (account.platform === 'twitch' && (account.isFanClubMember || account.totalSubscriptions > 0)) {
    badges.push(iconBadge(
      'twitch-sub',
      <OfficialBadge role="member" platform={account.platform} size={badgeSize} />,
      'Twitch Sub badge',
      badgeSize,
      '',
      account.badgeImageUrls?.twitchSub
    ))
  }

  if (account.platform === 'youtube' && account.isSuperFan) {
    badges.push(iconBadge(
      'youtube-superfan',
      <OfficialBadge role="superfan" platform={account.platform} size={badgeSize} />,
      'YouTube Super Fan badge',
      badgeSize,
      '',
      account.badgeImageUrls?.youtubeSuperFan
    ))
  }

  if (account.platform === 'kick' && (account.isFanClubMember || account.totalSubscriptions > 0)) {
    badges.push(iconBadge(
      'kick-sub',
      <OfficialBadge role="member" platform={account.platform} size={badgeSize} />,
      'Kick Sub badge',
      badgeSize,
      ''
    ))
  }

  return badges.slice(0, badgeLimit)
}

export function buildIdentityBadges(identity: UserIdentity, limit = 5, badgeSize = 16): AudienceBadge[] {
  const badgeLimit = Math.max(0, limit)
  const badges: AudienceBadge[] = []

  for (const account of [...identity.accounts].sort((a, b) => platformOrderIndex(a.platform) - platformOrderIndex(b.platform))) {
    for (const badge of buildAccountBadges(account, badgeLimit, badgeSize)) {
      if (!badges.some(existing => existing.key === badge.key)) {
        badges.push(badge)
      }
    }
  }

  return badges.sort(compareBadges).slice(0, badgeLimit)
}

export function BadgeChip({ badge }: { badge: AudienceBadge }) {
  const [imageFailed, setImageFailed] = React.useState(false)

  let proxyUrl = badge.imageUrl
  if (proxyUrl?.startsWith('http')) {
    const b64 = btoa(proxyUrl)
    const b64url = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    proxyUrl = typeof window !== 'undefined' && window.api
      ? `ily-avatar://proxy/${b64url}`
      : `/avatar/${b64url}`
  }

  // Platform badge art (e.g. TikTok CDN URLs) can be expired/dead — when the
  // image fails, fall back to our vector glyph instead of a broken-image icon.
  const showImage = Boolean(proxyUrl) && !imageFailed
  if (!showImage && !badge.icon) return null

  return (
    <span
      title={badge.title}
      aria-label={badge.title}
      className={`inline-flex shrink-0 items-center justify-center leading-none ${badge.className}`}
    >
      {showImage ? (
        <img
          src={proxyUrl as string}
          alt={badge.title}
          onError={() => setImageFailed(true)}
          style={{ width: badge.size, height: badge.size, objectFit: 'contain' }}
        />
      ) : (
        badge.icon
      )}
    </span>
  )
}
