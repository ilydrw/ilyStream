/**
 * Shared types for the lifetime stats feature.
 *
 * The stats system aggregates per-user, per-platform totals across all stream
 * events for the lifetime of the install. There are also global totals and a
 * separate breakdown by platform.
 */

import type { Platform } from '../main/platforms/types'

/** Per-user, per-platform lifetime totals. */
export interface UserStat {
  username: string
  platform: Platform
  displayName: string
  profilePictureUrl: string | null
  totalLikes: number
  totalGifts: number
  totalGiftValueCents: number
  totalSubscriptions: number
  totalFollows: number
  totalShares: number
  totalRaids: number
  totalChats: number
  totalSongRequests: number
  isFanClubMember?: boolean
  profileId: string | null
  firstSeenAt: string
  lastSeenAt: string
}

/** 
 * Aggregated view of a person who might have multiple linked accounts.
 * If an account is not linked, it's treated as a single-account identity.
 */
export interface UserIdentity {
  id: string // profileId or "username:platform"
  displayName: string
  profilePictureUrl: string | null
  primaryPlatform: Platform
  allPlatforms: Platform[]
  totalLikes: number
  totalGifts: number
  totalGiftValueCents: number
  totalSubscriptions: number
  totalFollows: number
  totalShares: number
  totalRaids: number
  totalChats: number
  totalSongRequests: number
  isFanClubMember: boolean
  lastSeenAt: string
  accounts: UserStat[]
}

/** Lifetime totals across all users and platforms. */
export interface GlobalStats {
  totalLikes: number
  totalGifts: number
  totalGiftValueCents: number
  totalSubscriptions: number
  totalFollows: number
  totalShares: number
  totalRaids: number
  totalChats: number
  totalSongRequests: number
  peakViewerCount: number
  uniqueUserCount: number
  /** ISO timestamp of the most recent counted event. */
  lastUpdatedAt: string | null
  /** Per-platform breakdown for at-a-glance comparison. */
  byPlatform: Record<Platform, PlatformStats>
}

export interface PlatformStats {
  totalLikes: number
  totalGifts: number
  totalGiftValueCents: number
  totalSubscriptions: number
  totalFollows: number
  totalShares: number
  totalRaids: number
  totalChats: number
  totalSongRequests: number
  uniqueUserCount: number
  /** Authoritative current follower count from the platform's API. null = not yet synced. */
  followerCount: number | null
  /** Growth delta over the last 24 hours, or null if we don't have a snapshot that old. */
  followerDelta24h: number | null
  followerDelta7d: number | null
  followerDelta30d: number | null
  /** ISO timestamp of the last successful API sync. */
  followersLastSyncedAt: string | null
}

/** Single time-series sample of a platform's follower count. */
export interface FollowerSnapshot {
  capturedAt: string
  followerCount: number
}

export type UserStatSortKey =
  | 'totalLikes'
  | 'totalGifts'
  | 'totalGiftValueCents'
  | 'totalSubscriptions'
  | 'totalFollows'
  | 'totalShares'
  | 'totalRaids'
  | 'totalChats'
  | 'totalSongRequests'
  | 'lastSeenAt'

export interface GetTopUsersOptions {
  sortBy: UserStatSortKey
  platform?: Platform | 'all'
  /** Free-text filter on username/displayName (case-insensitive). */
  query?: string
  limit?: number
  offset?: number
}

export const EMPTY_PLATFORM_STATS: PlatformStats = {
  totalLikes: 0,
  totalGifts: 0,
  totalGiftValueCents: 0,
  totalSubscriptions: 0,
  totalFollows: 0,
  totalShares: 0,
  totalRaids: 0,
  totalChats: 0,
  totalSongRequests: 0,
  uniqueUserCount: 0,
  followerCount: null,
  followerDelta24h: null,
  followerDelta7d: null,
  followerDelta30d: null,
  followersLastSyncedAt: null
}

export const EMPTY_GLOBAL_STATS: GlobalStats = {
  totalLikes: 0,
  totalGifts: 0,
  totalGiftValueCents: 0,
  totalSubscriptions: 0,
  totalFollows: 0,
  totalShares: 0,
  totalRaids: 0,
  totalChats: 0,
  totalSongRequests: 0,
  peakViewerCount: 0,
  uniqueUserCount: 0,
  lastUpdatedAt: null,
  byPlatform: {
    tiktok: { ...EMPTY_PLATFORM_STATS },
    twitch: { ...EMPTY_PLATFORM_STATS },
    youtube: { ...EMPTY_PLATFORM_STATS },
    kick: { ...EMPTY_PLATFORM_STATS }
  }
}
