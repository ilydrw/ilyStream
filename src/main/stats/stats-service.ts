import type { Database, UserStatRow } from '../db/database'
import type { AnyStreamEvent, Platform } from '../platforms/types'
import {
  EMPTY_GLOBAL_STATS,
  EMPTY_PLATFORM_STATS,
  type GetTopUsersOptions,
  type GlobalStats,
  type PlatformStats,
  type UserStat,
  type UserStatSortKey
} from '../../shared/stats'

const PLATFORMS: Platform[] = ['tiktok', 'twitch', 'youtube', 'kick']

/** Map the public sort keys to the underlying column names. */
const SORT_COLUMN_BY_KEY: Record<UserStatSortKey, string> = {
  totalLikes: 'total_likes',
  totalGifts: 'total_gifts',
  totalGiftValueCents: 'total_gift_value_cents',
  totalSubscriptions: 'total_subscriptions',
  totalFollows: 'total_follows',
  totalShares: 'total_shares',
  totalRaids: 'total_raids',
  totalChats: 'total_chats',
  totalSongRequests: 'total_song_requests',
  lastSeenAt: 'last_seen_at'
}

/**
 * Converts inbound stream events into lifetime per-user and global counters.
 * Lives on the main side so the renderer just queries pre-aggregated rows.
 */
export class StatsService {
  constructor(private db: Database) {
    this.cleanupTestStats()
  }

  /** Called for every event that flows through the orchestrator. */
  recordEvent(event: AnyStreamEvent): void {
    // Skip simulated events from lifetime stats
    if ((event.raw as any)?.simulated || (event as any).user?.username === 'local_alert_test' || (event as any).user?.id === 'sim-user') {
      return
    }

    const platform = event.platform
    const now = new Date().toISOString()

    switch (event.type) {
      case 'like': {
        if (platform === 'twitch') break
        const amount = Math.max(1, Math.floor(event.likeCount || 1))
        this.upsertUser(event.user, platform, { 
          likes: amount,
          isFanClubMember: event.user.isFanClubMember
        })
        this.db.incrementGlobalStat('totalLikes', amount)
        if (typeof event.totalLikes === 'number') {
          this.db.setGlobalStatIfGreater(`peakReportedLikes:${platform}`, event.totalLikes)
        }
        break
      }
      case 'gift': {
        // Combo events are partial updates within a single combo - we only
        // count the final non-combo event so we don't double-count.
        if (event.isCombo) return
        const count = Math.max(1, Math.floor(event.giftCount || 1))
        const valueCents = Math.max(0, Math.floor(event.monetaryValue || 0))
        console.log(`[stats] Recording gift: ${event.giftName} x${count} (${valueCents} cents) from ${event.user.username} on ${platform}`)
        this.upsertUser(event.user, platform, {
          gifts: count,
          giftValueCents: valueCents,
          isFanClubMember: event.user.isFanClubMember
        })
        this.db.incrementGlobalStat('totalGifts', count)
        this.db.incrementGlobalStat('totalGiftValueCents', valueCents)
        break
      }
      case 'subscription': {
        const valueCents = Math.max(0, Math.floor(event.monetaryValue || 0))
        this.upsertUser(event.user, platform, {
          subscriptions: 1,
          giftValueCents: valueCents,
          isFanClubMember: event.user.isFanClubMember
        })
        this.db.incrementGlobalStat('totalSubscriptions', 1)
        this.db.incrementGlobalStat('totalGiftValueCents', valueCents)
        break
      }
      case 'follow': {
        this.upsertUser(event.user, platform, { 
          follows: 1,
          isFanClubMember: event.user.isFanClubMember
        })
        break
      }
      case 'share': {
        if (platform === 'twitch') break
        this.upsertUser(event.user, platform, { 
          shares: 1,
          isFanClubMember: event.user.isFanClubMember
        })
        this.db.incrementGlobalStat('totalShares', 1)
        break
      }
      case 'raid': {
        this.upsertUser(event.user, platform, { 
          raids: 1,
          isFanClubMember: event.user.isFanClubMember
        })
        this.db.incrementGlobalStat('totalRaids', 1)
        break
      }
      case 'chat': {
        this.upsertUser(event.user, platform, { 
          chats: 1,
          isFanClubMember: event.user.isFanClubMember
        })
        this.db.incrementGlobalStat('totalChats', 1)
        break
      }
      case 'viewer-count': {
        this.db.setGlobalStatIfGreater(`peakViewerCount:${platform}`, event.count)
        this.db.setGlobalStatIfGreater('peakViewerCount', event.count)
        return // viewer-count has no user, so skip the lastUpdatedAt write below
      }
      default:
        return
    }

    this.db.setSetting('stats:lastUpdatedAt', now)
  }

  /**
   * Called by the Spotify service when a song request is successfully added
   * to the queue (separate from the chat command itself, which we may have
   * counted but didn't necessarily fulfill).
   */
  recordSongRequest(input: {
    platform: string
    username: string
    displayName?: string
    profilePictureUrl?: string | null
  }): void {
    // Skip simulated users
    if (input.username === 'local_alert_test') return

    this.db.incrementUserStats({
      platform: input.platform,
      username: input.username,
      displayName: input.displayName,
      profilePictureUrl: input.profilePictureUrl ?? null,
      songRequests: 1
    })
    this.db.incrementGlobalStat('totalSongRequests', 1)
    this.db.setSetting('stats:lastUpdatedAt', new Date().toISOString())
  }

  getGlobalStats(): GlobalStats {
    const counters = this.db.getAllGlobalStats()
    const byPlatform: Record<Platform, PlatformStats> = {
      tiktok: { ...EMPTY_PLATFORM_STATS },
      twitch: { ...EMPTY_PLATFORM_STATS },
      youtube: { ...EMPTY_PLATFORM_STATS },
      kick: { ...EMPTY_PLATFORM_STATS }
    }
    for (const platform of PLATFORMS) {
      byPlatform[platform] = this.db.getPlatformTotals(platform)
    }

    const lastUpdatedAt = this.db.getSetting('stats:lastUpdatedAt')

    return {
      ...EMPTY_GLOBAL_STATS,
      totalLikes: counters.totalLikes ?? 0,
      totalGifts: counters.totalGifts ?? 0,
      totalGiftValueCents: counters.totalGiftValueCents ?? 0,
      totalSubscriptions: counters.totalSubscriptions ?? 0,
      totalFollows: this.db.getUniqueFollowerCount(),
      totalShares: counters.totalShares ?? 0,
      totalRaids: counters.totalRaids ?? 0,
      totalChats: counters.totalChats ?? 0,
      totalSongRequests: counters.totalSongRequests ?? 0,
      peakViewerCount: counters.peakViewerCount ?? 0,
      uniqueUserCount: this.db.getUniqueUserCount(),
      lastUpdatedAt: typeof lastUpdatedAt === 'string' ? lastUpdatedAt : null,
      byPlatform
    }
  }

  getTopUsers(opts: GetTopUsersOptions): UserStat[] {
    const sortColumn = SORT_COLUMN_BY_KEY[opts.sortBy] ?? 'total_likes'
    const platform = opts.platform && opts.platform !== 'all' ? opts.platform : undefined

    const rows = this.db.getTopUsers({
      sortColumn,
      platform,
      query: opts.query,
      limit: opts.limit ?? 100,
      offset: opts.offset ?? 0
    })

    return rows.map(rowToUserStat)
  }

  getUserStat(platform: Platform, username: string): UserStat | null {
    const row = this.db.getUserStat(platform, username)
    return row ? rowToUserStat(row) : null
  }

  getTopIdentities(opts: GetTopUsersOptions): UserIdentity[] {
    const sortColumn = SORT_COLUMN_BY_KEY[opts.sortBy] ?? 'total_likes'
    const platform = opts.platform && opts.platform !== 'all' ? opts.platform : undefined

    return this.db.getTopIdentities({
      sortColumn,
      platform,
      query: opts.query,
      limit: opts.limit ?? 100,
      offset: opts.offset ?? 0
    })
  }

  linkAccounts(p1: Platform, u1: string, p2: Platform, u2: string): void {
    this.db.linkAccounts(p1, u1, p2, u2)
  }

  unlinkAccount(platform: Platform, username: string): void {
    this.db.unlinkAccount(platform, username)
  }

  reset(): void {
    this.db.resetAllStats()
    this.db.setSetting('stats:lastUpdatedAt', null)
  }

  /** Removes any data from known test users and adjusts global counters. */
  private cleanupTestStats(): void {
    try {
      const testUsernames = ['local_alert_test']
      for (const username of testUsernames) {
        this.db.purgeUserStats(username)
      }
    } catch (err) {
      console.error('[StatsService] Cleanup failed:', err)
    }
  }

  private upsertUser(
    user: { username: string; displayName?: string; profilePictureUrl?: string },
    platform: Platform,
    increments: {
      likes?: number
      gifts?: number
      giftValueCents?: number
      subscriptions?: number
      follows?: number
      shares?: number
      raids?: number
      chats?: number
      songRequests?: number
      isFanClubMember?: boolean
    }
  ): void {
    const username = (user?.username || '').trim()
    if (!username) return

    this.db.incrementUserStats({
      username,
      platform,
      displayName: user.displayName,
      profilePictureUrl: user.profilePictureUrl ?? null,
      isFanClubMember: (user as any).isFanClubMember,
      ...increments
    })
  }
}

function rowToUserStat(row: UserStatRow): UserStat {
  return {
    username: row.username,
    platform: row.platform as Platform,
    displayName: row.display_name || row.username,
    profilePictureUrl: row.profile_picture_url,
    totalLikes: row.total_likes,
    totalGifts: row.total_gifts,
    totalGiftValueCents: row.total_gift_value_cents,
    totalSubscriptions: row.total_subscriptions,
    totalFollows: row.total_follows,
    totalShares: row.total_shares,
    totalRaids: row.total_raids,
    totalChats: row.total_chats,
    totalSongRequests: row.total_song_requests,
    isFanClubMember: row.is_fan_club_member === 1,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at
  }
}
