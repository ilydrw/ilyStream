/**
 * Shared types for the lifetime stats feature.
 *
 * The stats system aggregates per-user, per-platform totals across all stream
 * events for the lifetime of the install. There are also global totals and a
 * separate breakdown by platform.
 */

import { ALL_PLATFORMS, type Platform } from '../main/platforms/types'

/** Per-user, per-platform lifetime totals. */
export interface UserStat {
  username: string
  platform: Platform
  platformUserId?: string | null
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
  totalCohostCalls: number
  isFanClubMember?: boolean
  isSuperFan?: boolean
  isModerator?: boolean
  badgeImageUrls?: AudienceBadgeImageUrls
  profileId: string | null
  firstSeenAt: string
  lastSeenAt: string
}

export interface AudienceBadgeImageUrls {
  moderator: string | null
  tiktokFanClub: string | null
  tiktokSuperFan: string | null
  twitchSub: string | null
  youtubeSuperFan: string | null
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
  primaryUsername?: string | null
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
  totalCohostCalls: number
  isFanClubMember: boolean
  isSuperFan: boolean
  isModerator: boolean
  firstSeenAt: string
  lastSeenAt: string
  accounts: UserStat[]
  /**
   * Non-streaming identities connected directly to a persisted ilyStream
   * profile. These do not contribute audience stats and can never be the
   * profile's primary streaming account.
   */
  profileConnections?: ViewerAccount[]
  /**
   * Overall audience RANK (1 = best). Combines this identity's position across
   * every engagement/contribution category into one leaderboard standing — see
   * StatsRepository.attachOverallRanks. Present when the table is sorted by, or
   * needs to display, the overall ranking; undefined otherwise.
   */
  overallRank?: number
  ranks?: Partial<Record<UserStatSortKey, number>>
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
  totalCohostCalls: number
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
  totalCohostCalls: number
  uniqueUserCount: number
  /** Authoritative current follower count from the platform's API. null = not yet synced. */
  followerCount: number | null
  /**
   * True when the follower count is maintained manually by the streamer
   * (e.g. TikTok, which exposes no follower API). When set, live follow
   * events nudge the count up and the streamer can re-enter it anytime.
   */
  followerCountIsManual: boolean
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

export interface ViewerAccount {
  profileId: string
  platform: Platform
  username: string
  platformUserId: string | null
  displayName: string
  profilePictureUrl: string | null
  firstSeenAt: string
  lastSeenAt: string
}

export interface ViewerAccountInput {
  platform: Platform
  username: string
  platformUserId?: string | null
  displayName?: string
  profilePictureUrl?: string | null
}

export interface ViewerProfile {
  id: string
  displayName: string
  profilePictureUrl: string | null
  notes: string
  primaryPlatform: Platform | null
  primaryUsername: string | null
  createdAt: string
  updatedAt: string
  accounts: ViewerAccount[]
}

export interface ViewerProfileInput {
  displayName?: string
  profilePictureUrl?: string | null
  notes?: string
  primaryPlatform?: Platform | null
  primaryUsername?: string | null
  accounts?: ViewerAccountInput[]
}

export type UserStatSortKey =
  | 'overall'
  | 'totalLikes'
  | 'totalGifts'
  | 'totalGiftValueCents'
  | 'totalSubscriptions'
  | 'totalFollows'
  | 'totalShares'
  | 'totalRaids'
  | 'totalChats'
  | 'totalSongRequests'
  | 'totalCohostCalls'
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
  totalCohostCalls: 0,
  uniqueUserCount: 0,
  followerCount: null,
  followerCountIsManual: false,
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
  totalCohostCalls: 0,
  peakViewerCount: 0,
  uniqueUserCount: 0,
  lastUpdatedAt: null,
  byPlatform: Object.fromEntries(
    ALL_PLATFORMS.map((platform) => [platform, { ...EMPTY_PLATFORM_STATS }])
  ) as Record<Platform, PlatformStats>
}

/** Fresh all-zero per-platform stats map covering every known platform. */
export function createEmptyPlatformStatsMap(): Record<Platform, PlatformStats> {
  return Object.fromEntries(
    ALL_PLATFORMS.map((platform) => [platform, { ...EMPTY_PLATFORM_STATS }])
  ) as Record<Platform, PlatformStats>
}
