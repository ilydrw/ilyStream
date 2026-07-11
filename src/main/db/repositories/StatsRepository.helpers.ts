import type {
  AudienceBadgeImageUrls
} from '../../../shared/stats'
import type { UserStatRow } from '../database'

export type UserStatRowWithIdentity = UserStatRow & {
  resolved_profile_id?: string | null
  is_super_fan?: number
  is_moderator?: number
}

export interface ViewerProfileRow {
  id: string
  display_name: string
  profile_picture_url: string | null
  notes: string | null
  primary_platform: string | null
  primary_username: string | null
  created_at: string
  updated_at: string
}

export interface ViewerAccountRow {
  profile_id: string
  platform: string
  username: string
  platform_user_id: string | null
  display_name: string
  profile_picture_url: string | null
  first_seen_at: string
  last_seen_at: string
}

export function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0
  const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, '')
  const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!s1 || !s2) return 0
  if (s1 === s2) return 1

  const matrix = Array.from({ length: s1.length + 1 }, () => new Array(s2.length + 1).fill(0))
  for (let i = 0; i <= s1.length; i++) matrix[i][0] = i
  for (let j = 0; j <= s2.length; j++) matrix[0][j] = j

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }

  const maxLength = Math.max(s1.length, s2.length)
  return (maxLength - matrix[s1.length][s2.length]) / maxLength
}

export function normalizeUsername(username: string | undefined): string {
  return String(username || '').trim().replace(/^@+/, '').toLowerCase()
}

export function safeDisplayName(value: string | undefined): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim()
  return normalized.slice(0, 120) || 'Viewer'
}

export function normalizeOptionalUrl(value: string | null | undefined): string | null {
  const normalized = String(value || '').trim()
  return normalized || null
}

export function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = String(value || '').trim()
  return normalized || null
}

export function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
}

export function badgeImageUrlsFromRow(row: UserStatRow): AudienceBadgeImageUrls {
  return {
    moderator: row.moderator_badge_image_url,
    tiktokFanClub: row.tiktok_fan_club_badge_image_url,
    tiktokSuperFan: row.tiktok_super_fan_badge_image_url,
    twitchSub: row.twitch_sub_badge_image_url,
    youtubeSuperFan: row.youtube_super_fan_badge_image_url
  }
}

export function findBadgeImageFromRaw(badges: any[], matcher: (label: string) => boolean): string | null {
  for (const badge of badges) {
    const label = `${badge?.id || badge?.type || ''} ${badge?.name || badge?.displayName || badge?.title || ''}`.toLowerCase()
    const imageUrl = normalizeOptionalText(
      badge?.imageUrl ||
      badge?.url ||
      badge?.icon?.urlList?.[0] ||
      badge?.icon?.url_list?.[0] ||
      badge?.image?.urlList?.[0] ||
      badge?.image?.url_list?.[0] ||
      badge?.image?.url?.[0]
    )
    if (matcher(label) && imageUrl) return imageUrl
  }
  return null
}

export function isFanClubBadgeLabel(label: string): boolean {
  return (
    label.includes('fan club') ||
    label.includes('fanclub') ||
    label.includes('subscriber') ||
    label.includes('subscription') ||
    label.includes('member')
  )
}
