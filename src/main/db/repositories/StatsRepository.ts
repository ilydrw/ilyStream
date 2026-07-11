import BetterSqlite3 from 'better-sqlite3'
import { BaseRepository } from './BaseRepository'
import {
  UserIdentity,
  UserStat,
  type ViewerAccountInput,
  type ViewerProfile,
  type ViewerProfileInput
} from '../../../shared/stats'
import type { UserStatRow } from '../database'
import { Platform } from '../../platforms/types'
import { estimateTikTokCreatorGiftCents } from '../../../shared/tiktok-revenue'
import { isCohostIdentity } from '../../ai/cohost-identity'
import { FollowerStatsRepository } from './FollowerStatsRepository'
import { attachOverallRanks, fillMissingAvatar } from './StatsIdentityRanking'
import { StatsTotalsRepository } from './StatsTotalsRepository'
import { ViewerProfileRepository } from './ViewerProfileRepository'
import {
  badgeImageUrlsFromRow,
  findBadgeImageFromRaw,
  isFanClubBadgeLabel,
  normalizeOptionalText,
  normalizeOptionalUrl,
  normalizeUsername,
  safeDisplayName,
  type UserStatRowWithIdentity,
  type ViewerProfileRow
} from './StatsRepository.helpers'

export class StatsRepository extends BaseRepository {
  private readonly followerStats: FollowerStatsRepository
  private readonly totals: StatsTotalsRepository
  private readonly viewerProfiles: ViewerProfileRepository

  constructor(db: BetterSqlite3.Database) {
    super(db)
    this.followerStats = new FollowerStatsRepository(db)
    this.totals = new StatsTotalsRepository(db)
    this.viewerProfiles = new ViewerProfileRepository(db, (platform, username) => this.getUserStat(platform, username))
  }

  getTopStats(opts: {
    sortColumn: string
    platform?: string
    query?: string
    limit: number
    offset: number
  }): UserStatRow[] {
    const ALLOWED_SORT = new Set([
      'total_likes',
      'total_gifts',
      'total_gift_value_cents',
      'total_subscriptions',
      'total_follows',
      'total_shares',
      'total_raids',
      'total_chats',
      'total_song_requests',
      'last_seen_at'
    ])
    const sortColumn = ALLOWED_SORT.has(opts.sortColumn) ? opts.sortColumn : 'total_likes'

    const where: string[] = []
    const params: unknown[] = []
    if (opts.platform) {
      where.push('user_stats.platform = ?')
      params.push(opts.platform)
    }
    if (opts.query && opts.query.trim().length > 0) {
      where.push('(LOWER(user_stats.username) LIKE ? OR LOWER(user_stats.display_name) LIKE ?)')
      const like = `%${opts.query.trim().toLowerCase()}%`
      params.push(like, like)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const limit = Math.min(500, Math.max(1, Math.floor(opts.limit)))
    const offset = Math.max(0, Math.floor(opts.offset))

    return this.db.prepare(`
      SELECT * FROM user_stats
      ${whereSql}
      ORDER BY ${sortColumn} DESC, last_seen_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as UserStatRow[]
  }

  getTopIdentities(opts: {
    sortColumn: string
    platform?: string
    query?: string
    limit: number
    offset: number
  }): UserIdentity[] {
    const ALLOWED_SORT = new Set([
      'total_likes',
      'total_gifts',
      'total_gift_value_cents',
      'total_subscriptions',
      'total_follows',
      'total_shares',
      'total_raids',
      'total_chats',
      'total_song_requests',
      'last_seen_at'
    ])
    // 'overall' is a synthetic sort — there's no column for it. We still need a
    // real column for the SQL ORDER BY (total_likes is a fine superset proxy);
    // the composite score is computed in-memory below and used for the final sort.
    const isOverall = opts.sortColumn === 'overall'
    const sortColumn = ALLOWED_SORT.has(opts.sortColumn) ? opts.sortColumn : 'total_likes'
    const sortSql = `user_stats.${sortColumn}`

    const where: string[] = []
    const params: unknown[] = []
    if (opts.platform) {
      where.push('user_stats.platform = ?')
      params.push(opts.platform)
    }
    if (opts.query && opts.query.trim().length > 0) {
      where.push('(LOWER(user_stats.username) LIKE ? OR LOWER(user_stats.display_name) LIKE ?)')
      const like = `%${opts.query.trim().toLowerCase()}%`
      params.push(like, like)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const limit = Math.min(500, Math.max(1, Math.floor(opts.limit)))
    const offset = Math.max(0, Math.floor(opts.offset))

    const accounts = this.db.prepare(`
      SELECT user_stats.*, COALESCE(viewer_accounts.profile_id, user_stats.profile_id) AS resolved_profile_id
      FROM user_stats
      LEFT JOIN viewer_accounts
        ON viewer_accounts.platform = user_stats.platform
       AND (
          viewer_accounts.username = LOWER(user_stats.username)
          OR (
            viewer_accounts.platform_user_id IS NOT NULL
            AND user_stats.platform_user_id IS NOT NULL
            AND viewer_accounts.platform_user_id = user_stats.platform_user_id
          )
       )
      ${whereSql}
      ORDER BY ${sortSql} DESC
    `).all(...params) as UserStatRowWithIdentity[]

    const identitiesMap = new Map<string, UserIdentity>()
    const processedAccounts = new Set<string>()

    for (const row of accounts) {
      if (isCohostIdentity({ id: row.platform_user_id || undefined, username: row.username, displayName: row.display_name })) {
        continue
      }
      const resolvedProfileId = row.resolved_profile_id || row.profile_id
      const id = resolvedProfileId || `${row.username}:${row.platform}`
      let identity = identitiesMap.get(id)
      
      processedAccounts.add(`${row.username}:${row.platform}`)

      const account: UserStat = {
        username: row.username,
        platform: row.platform as Platform,
        platformUserId: row.platform_user_id,
        displayName: row.display_name,
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
        totalCohostCalls: row.total_cohost_calls || 0,
        isFanClubMember: row.is_fan_club_member === 1,
        isSuperFan: row.is_super_fan === 1,
        isModerator: row.is_moderator === 1,
        badgeImageUrls: badgeImageUrlsFromRow(row),
        profileId: resolvedProfileId,
        firstSeenAt: row.first_seen_at,
        lastSeenAt: row.last_seen_at
      }

      if (!identity) {
        identity = {
          id,
          displayName: row.display_name,
          profilePictureUrl: row.profile_picture_url,
          primaryPlatform: row.platform as Platform,
          allPlatforms: [row.platform as Platform],
          totalLikes: row.total_likes,
          totalGifts: row.total_gifts,
          totalGiftValueCents: row.total_gift_value_cents,
          totalSubscriptions: row.total_subscriptions,
          totalFollows: row.total_follows,
          totalShares: row.total_shares,
          totalRaids: row.total_raids,
          totalChats: row.total_chats,
          totalSongRequests: row.total_song_requests,
          totalCohostCalls: row.total_cohost_calls || 0,
          isFanClubMember: row.is_fan_club_member === 1,
          isSuperFan: row.is_super_fan === 1,
          isModerator: row.is_moderator === 1,
          firstSeenAt: row.first_seen_at,
          lastSeenAt: row.last_seen_at,
          accounts: [account]
        }
        identitiesMap.set(id, identity)
      } else {
        identity.totalLikes += row.total_likes
        identity.totalGifts += row.total_gifts
        identity.totalGiftValueCents += row.total_gift_value_cents
        identity.totalSubscriptions += row.total_subscriptions
        identity.totalFollows += row.total_follows
        identity.totalShares += row.total_shares
        identity.totalRaids += row.total_raids
        identity.totalChats += row.total_chats
        identity.totalSongRequests += row.total_song_requests
        identity.totalCohostCalls += row.total_cohost_calls || 0
        identity.isFanClubMember = identity.isFanClubMember || row.is_fan_club_member === 1
        identity.isSuperFan = identity.isSuperFan || row.is_super_fan === 1
        identity.isModerator = identity.isModerator || row.is_moderator === 1
        
        if (!identity.allPlatforms.includes(row.platform as Platform)) {
          identity.allPlatforms.push(row.platform as Platform)
        }

        if (row.last_seen_at > identity.lastSeenAt) {
          identity.displayName = row.display_name
          identity.profilePictureUrl = row.profile_picture_url
          identity.primaryPlatform = row.platform as Platform
          identity.lastSeenAt = row.last_seen_at
        }
        if (!identity.firstSeenAt || (row.first_seen_at && row.first_seen_at < identity.firstSeenAt)) {
          identity.firstSeenAt = row.first_seen_at
        }

        identity.accounts.push(account)
      }
    }

    const profileIds = Array.from(identitiesMap.keys()).filter(id => !id.includes(':')) // ids that don't contain ":" are profile_ids
    if (profileIds.length > 0) {
      const placeholders = profileIds.map(() => '?').join(',')
      
      // Fetch missing accounts for these profiles that might have been filtered out or paginated out
      const missingAccounts = this.db.prepare(`
        SELECT user_stats.*, COALESCE(viewer_accounts.profile_id, user_stats.profile_id) AS resolved_profile_id
        FROM user_stats
        LEFT JOIN viewer_accounts
          ON viewer_accounts.platform = user_stats.platform
         AND (
            viewer_accounts.username = LOWER(user_stats.username)
            OR (
              viewer_accounts.platform_user_id IS NOT NULL
              AND user_stats.platform_user_id IS NOT NULL
              AND viewer_accounts.platform_user_id = user_stats.platform_user_id
            )
         )
        WHERE COALESCE(viewer_accounts.profile_id, user_stats.profile_id) IN (${placeholders})
      `).all(...profileIds) as UserStatRowWithIdentity[]

      for (const row of missingAccounts) {
        if (processedAccounts.has(`${row.username}:${row.platform}`)) continue
        
        const pid = row.resolved_profile_id || row.profile_id
        if (!pid) continue
        
        const identity = identitiesMap.get(pid)
        if (!identity) continue

        const account: UserStat = {
          username: row.username,
          platform: row.platform as Platform,
          platformUserId: row.platform_user_id,
          displayName: row.display_name,
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
          totalCohostCalls: row.total_cohost_calls || 0,
          isFanClubMember: row.is_fan_club_member === 1,
          isSuperFan: row.is_super_fan === 1,
          isModerator: row.is_moderator === 1,
          badgeImageUrls: badgeImageUrlsFromRow(row),
          profileId: pid,
          firstSeenAt: row.first_seen_at,
          lastSeenAt: row.last_seen_at
        }

        identity.totalLikes += row.total_likes
        identity.totalGifts += row.total_gifts
        identity.totalGiftValueCents += row.total_gift_value_cents
        identity.totalSubscriptions += row.total_subscriptions
        identity.totalFollows += row.total_follows
        identity.totalShares += row.total_shares
        identity.totalRaids += row.total_raids
        identity.totalChats += row.total_chats
        identity.totalSongRequests += row.total_song_requests
        identity.totalCohostCalls += row.total_cohost_calls || 0
        identity.isFanClubMember = identity.isFanClubMember || row.is_fan_club_member === 1
        identity.isSuperFan = identity.isSuperFan || row.is_super_fan === 1
        identity.isModerator = identity.isModerator || row.is_moderator === 1
        
        if (!identity.allPlatforms.includes(row.platform as Platform)) {
          identity.allPlatforms.push(row.platform as Platform)
        }

        if (row.last_seen_at > identity.lastSeenAt) {
          identity.displayName = row.display_name
          identity.profilePictureUrl = row.profile_picture_url
          identity.primaryPlatform = row.platform as Platform
          identity.lastSeenAt = row.last_seen_at
        }
        if (!identity.firstSeenAt || (row.first_seen_at && row.first_seen_at < identity.firstSeenAt)) {
          identity.firstSeenAt = row.first_seen_at
        }

        identity.accounts.push(account)
      }

      const profiles = this.db.prepare(`
        SELECT id, display_name, profile_picture_url, primary_platform, notes
        FROM viewer_profiles
        WHERE id IN (${placeholders})
      `).all(...profileIds) as ViewerProfileRow[]
      
      for (const p of profiles) {
        const identity = identitiesMap.get(p.id)
        if (identity) {
          identity.displayName = p.display_name || identity.displayName
          identity.profilePictureUrl = p.profile_picture_url || identity.profilePictureUrl
          identity.primaryPlatform = (p.primary_platform as Platform) || identity.primaryPlatform
        }
      }
    }

    const allIdentities = Array.from(identitiesMap.values())
    // If an identity has no avatar of its own (its most-recent account had none,
    // or a named profile has no picture), borrow one from a linked account that
    // does — preferring the primary platform. Fixes profiles/identities showing
    // a generic initial while an account clearly has a real picture.
    for (const identity of allIdentities) {
      fillMissingAvatar(identity)
    }
    // Always compute the overall ranking so the "Overall" column can render
    // even when the table is sorted by a different metric.
    attachOverallRanks(allIdentities)

    const sorted = allIdentities.sort((a, b) => {
      if (isOverall) {
        return (a.overallRank ?? Number.MAX_SAFE_INTEGER) - (b.overallRank ?? Number.MAX_SAFE_INTEGER)
      }
      const field = sortColumn.replace(/_([a-z])/g, (_, l) => l.toUpperCase())
      if (field === 'lastSeenAt') return b.lastSeenAt.localeCompare(a.lastSeenAt)
      const valA = Number((a as any)[field] || 0)
      const valB = Number((b as any)[field] || 0)
      if (valB !== valA) return valB - valA
      return b.lastSeenAt.localeCompare(a.lastSeenAt)
    })

    return sorted.slice(offset, offset + limit)
  }

  getUserIdentity(id: string): UserIdentity | null {
    let profileId = id
    // Try to resolve string-based unlinked ID to a profile if they got linked later
    if (id.includes(':')) {
      const [u, p] = id.split(':')
      const profile = this.getViewerProfileByAccount(p as Platform, normalizeUsername(u))
      if (profile) {
        profileId = profile.id
      } else {
        profileId = `${normalizeUsername(u)}:${p}`
      }
    }

    let whereSql = ''
    let params: unknown[] = []
    
    if (!profileId.includes(':')) {
      whereSql = `WHERE COALESCE(viewer_accounts.profile_id, user_stats.profile_id) = ?`
      params.push(profileId)
    } else {
      const [u, p] = profileId.split(':')
      whereSql = `WHERE LOWER(user_stats.username) = ? AND user_stats.platform = ?`
      params.push(normalizeUsername(u), p)
    }

    const accounts = this.db.prepare(`
      SELECT user_stats.*, COALESCE(viewer_accounts.profile_id, user_stats.profile_id) AS resolved_profile_id
      FROM user_stats
      LEFT JOIN viewer_accounts
        ON viewer_accounts.platform = user_stats.platform
       AND (
          viewer_accounts.username = LOWER(user_stats.username)
          OR (
            viewer_accounts.platform_user_id IS NOT NULL
            AND user_stats.platform_user_id IS NOT NULL
            AND viewer_accounts.platform_user_id = user_stats.platform_user_id
          )
       )
      ${whereSql}
    `).all(...params) as UserStatRowWithIdentity[]

    if (accounts.length === 0) return null

    let identity: UserIdentity | null = null
    const processedAccounts = new Set<string>()

    for (const row of accounts) {
      if (processedAccounts.has(`${row.username}:${row.platform}`)) continue
      processedAccounts.add(`${row.username}:${row.platform}`)

      const account: UserStat = {
        username: row.username,
        platform: row.platform as Platform,
        platformUserId: row.platform_user_id,
        displayName: row.display_name,
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
        totalCohostCalls: row.total_cohost_calls,
        isFanClubMember: row.is_fan_club_member === 1,
        isSuperFan: row.is_super_fan === 1,
        isModerator: row.is_moderator === 1,
        badgeImageUrls: badgeImageUrlsFromRow(row),
        profileId: row.resolved_profile_id || row.profile_id,
        firstSeenAt: row.first_seen_at,
        lastSeenAt: row.last_seen_at
      }

      if (!identity) {
        identity = {
          id: profileId,
          displayName: row.display_name,
          profilePictureUrl: row.profile_picture_url,
          primaryPlatform: row.platform as Platform,
          allPlatforms: [row.platform as Platform],
          totalLikes: row.total_likes,
          totalGifts: row.total_gifts,
          totalGiftValueCents: row.total_gift_value_cents,
          totalSubscriptions: row.total_subscriptions,
          totalFollows: row.total_follows,
          totalShares: row.total_shares,
          totalRaids: row.total_raids,
          totalChats: row.total_chats,
          totalSongRequests: row.total_song_requests,
          totalCohostCalls: row.total_cohost_calls,
          isFanClubMember: row.is_fan_club_member === 1,
          isSuperFan: row.is_super_fan === 1,
          isModerator: row.is_moderator === 1,
          firstSeenAt: row.first_seen_at,
          lastSeenAt: row.last_seen_at,
          accounts: [account]
        }
      } else {
        identity.totalLikes += row.total_likes
        identity.totalGifts += row.total_gifts
        identity.totalGiftValueCents += row.total_gift_value_cents
        identity.totalSubscriptions += row.total_subscriptions
        identity.totalFollows += row.total_follows
        identity.totalShares += row.total_shares
        identity.totalRaids += row.total_raids
        identity.totalChats += row.total_chats
        identity.totalSongRequests += row.total_song_requests
        identity.totalCohostCalls += row.total_cohost_calls
        identity.isFanClubMember = identity.isFanClubMember || row.is_fan_club_member === 1
        identity.isSuperFan = identity.isSuperFan || row.is_super_fan === 1
        identity.isModerator = identity.isModerator || row.is_moderator === 1
        
        if (!identity.allPlatforms.includes(row.platform as Platform)) {
          identity.allPlatforms.push(row.platform as Platform)
        }
        if (row.last_seen_at > identity.lastSeenAt) {
          identity.displayName = row.display_name
          identity.profilePictureUrl = row.profile_picture_url
          identity.primaryPlatform = row.platform as Platform
          identity.lastSeenAt = row.last_seen_at
        }
        if (!identity.firstSeenAt || (row.first_seen_at && row.first_seen_at < identity.firstSeenAt)) {
          identity.firstSeenAt = row.first_seen_at
        }
        identity.accounts.push(account)
      }
    }

    if (!profileId.includes(':') && identity) {
      const profile = this.db.prepare(`
        SELECT id, display_name, profile_picture_url, primary_platform, notes
        FROM viewer_profiles
        WHERE id = ?
      `).get(profileId) as ViewerProfileRow | undefined
      
      if (profile) {
        identity.displayName = profile.display_name || identity.displayName
        identity.profilePictureUrl = profile.profile_picture_url || identity.profilePictureUrl
        identity.primaryPlatform = (profile.primary_platform as Platform) || identity.primaryPlatform
      }
    }

    if (identity) fillMissingAvatar(identity)

    if (identity) {
      const all = this.getAllIdentities()
      
      const chatsSorted = [...all].sort((a, b) => b.totalChats - a.totalChats)
      const likesSorted = [...all].sort((a, b) => b.totalLikes - a.totalLikes)
      const giftsSorted = [...all].sort((a, b) => b.totalGifts - a.totalGifts)
      const revenueSorted = [...all].sort((a, b) => b.totalGiftValueCents - a.totalGiftValueCents)
      const membersSorted = [...all].sort((a, b) => b.totalSubscriptions - a.totalSubscriptions)
      const sharesSorted = [...all].sort((a, b) => b.totalShares - a.totalShares)
      const raidsSorted = [...all].sort((a, b) => (b.totalRaids || 0) - (a.totalRaids || 0))
      const songsSorted = [...all].sort((a, b) => b.totalSongRequests - a.totalSongRequests)
      const cohostSorted = [...all].sort((a, b) => (b.totalCohostCalls || 0) - (a.totalCohostCalls || 0))

      // Overall ranking (combined positions across categories), so the profile
      // can headline "#3 overall" the same way the Top users table does.
      attachOverallRanks(all)
      identity.overallRank = all.find(x => x.id === identity!.id)?.overallRank

      identity.ranks = {
        overall: identity.overallRank ?? 0,
        totalChats: chatsSorted.findIndex(x => x.id === identity.id) + 1,
        totalLikes: likesSorted.findIndex(x => x.id === identity.id) + 1,
        totalGifts: giftsSorted.findIndex(x => x.id === identity.id) + 1,
        totalGiftValueCents: revenueSorted.findIndex(x => x.id === identity.id) + 1,
        totalSubscriptions: membersSorted.findIndex(x => x.id === identity.id) + 1,
        totalShares: sharesSorted.findIndex(x => x.id === identity.id) + 1,
        totalRaids: raidsSorted.findIndex(x => x.id === identity.id) + 1,
        totalSongRequests: songsSorted.findIndex(x => x.id === identity.id) + 1,
        totalCohostCalls: cohostSorted.findIndex(x => x.id === identity.id) + 1,
      }
    }

    return identity
  }

  private getAllIdentities(): UserIdentity[] {
    const accounts = this.db.prepare(`
      SELECT user_stats.*, COALESCE(viewer_accounts.profile_id, user_stats.profile_id) AS resolved_profile_id
      FROM user_stats
      LEFT JOIN viewer_accounts
        ON viewer_accounts.platform = user_stats.platform
       AND (
          viewer_accounts.username = LOWER(user_stats.username)
          OR (
            viewer_accounts.platform_user_id IS NOT NULL
            AND user_stats.platform_user_id IS NOT NULL
            AND viewer_accounts.platform_user_id = user_stats.platform_user_id
          )
       )
    `).all() as UserStatRowWithIdentity[]

    const identitiesMap = new Map<string, UserIdentity>()

    for (const row of accounts) {
      if (isCohostIdentity({ id: row.platform_user_id || undefined, username: row.username, displayName: row.display_name })) {
        continue
      }
      const resolvedProfileId = row.resolved_profile_id || row.profile_id
      const id = resolvedProfileId || `${row.username}:${row.platform}`
      let identity = identitiesMap.get(id)
      
      const account: UserStat = {
        username: row.username,
        platform: row.platform as Platform,
        totalLikes: row.total_likes,
        totalGifts: row.total_gifts,
        totalGiftValueCents: row.total_gift_value_cents,
        totalSubscriptions: row.total_subscriptions,
        totalShares: row.total_shares,
        totalChats: row.total_chats,
        totalSongRequests: row.total_song_requests,
        totalCohostCalls: row.total_cohost_calls,
      } as any

      if (!identity) {
        identity = {
          id,
          totalLikes: row.total_likes,
          totalGifts: row.total_gifts,
          totalGiftValueCents: row.total_gift_value_cents,
          totalSubscriptions: row.total_subscriptions,
          totalShares: row.total_shares,
          totalRaids: row.total_raids,
          totalChats: row.total_chats,
          totalSongRequests: row.total_song_requests,
          totalCohostCalls: row.total_cohost_calls,
          accounts: [account]
        } as UserIdentity
        identitiesMap.set(id, identity)
      } else {
        identity.totalLikes += row.total_likes
        identity.totalGifts += row.total_gifts
        identity.totalGiftValueCents += row.total_gift_value_cents
        identity.totalSubscriptions += row.total_subscriptions
        identity.totalShares += row.total_shares
        identity.totalRaids += row.total_raids
        identity.totalChats += row.total_chats
        identity.totalSongRequests += row.total_song_requests
        identity.totalCohostCalls += row.total_cohost_calls
        identity.accounts.push(account)
      }
    }
    return Array.from(identitiesMap.values())
  }

  getLinkSuggestions(profileId: string): Array<{ platform: Platform; username: string; displayName: string; profilePictureUrl: string | null; similarity: number; profileId: string | null }> {
    return this.viewerProfiles.getLinkSuggestions(profileId)
  }

  linkAccounts(p1: string, u1: string, p2: string, u2: string): ViewerProfile | null {
    return this.viewerProfiles.linkAccounts(p1, u1, p2, u2)
  }

  unlinkAccount(platform: string, username: string): void {
    this.viewerProfiles.unlinkAccount(platform, username)
  }

  getViewerProfileId(
    platform: string,
    username: string,
    identity: { platformUserId?: string | null; displayName?: string | null } = {}
  ): string | null {
    return this.viewerProfiles.getViewerProfileId(platform, username, identity)
  }

  getViewerProfiles(opts: { query?: string; limit?: number } = {}): ViewerProfile[] {
    return this.viewerProfiles.getViewerProfiles(opts)
  }

  getViewerProfile(profileId: string): ViewerProfile | null {
    return this.viewerProfiles.getViewerProfile(profileId)
  }

  getViewerProfileByAccount(platform: string, username: string): ViewerProfile | null {
    return this.viewerProfiles.getViewerProfileByAccount(platform, username)
  }

  createViewerProfile(input: ViewerProfileInput): ViewerProfile {
    return this.viewerProfiles.createViewerProfile(input)
  }

  updateViewerProfile(profileId: string, patch: Partial<ViewerProfileInput>): ViewerProfile | null {
    return this.viewerProfiles.updateViewerProfile(profileId, patch)
  }

  addAccountToProfile(profileId: string, accountInput: ViewerAccountInput): ViewerProfile | null {
    return this.viewerProfiles.addAccountToProfile(profileId, accountInput)
  }

  getUserStat(platform: string, username: string): UserStatRow | null {
    const row = this.db.prepare(
      'SELECT * FROM user_stats WHERE platform = ? AND LOWER(username) = LOWER(?)'
    ).get(platform, username) as UserStatRow | undefined
    return row ?? null
  }

  resetAllStats(): void {
    this.db.prepare('DELETE FROM user_stats').run()
    this.db.prepare('DELETE FROM global_stats').run()
  }

  backfillAudienceRolesFromHistory(): number {
    // Stream rows one at a time instead of .all() — event_history can hold
    // millions of rows and loading every data_json string at once risks an OOM.
    const rowStmt = this.db.prepare(`
      SELECT platform, user_name, data_json, created_at
      FROM event_history
      WHERE event_type != 'viewer-count'
        AND user_name IS NOT NULL
        AND data_json IS NOT NULL
      ORDER BY created_at ASC
    `)
    type HistoryRow = { platform: string; user_name: string | null; data_json: string; created_at: string | null }

    const aggregates = new Map<string, {
      platform: string
      username: string
      platformUserId: string | null
      displayName: string | null
      profilePictureUrl: string | null
      isFanClubMember: boolean
      isSuperFan: boolean
      isModerator: boolean
      moderatorBadgeImageUrl: string | null
      tiktokFanClubBadgeImageUrl: string | null
      tiktokSuperFanBadgeImageUrl: string | null
      twitchSubBadgeImageUrl: string | null
      youtubeSuperFanBadgeImageUrl: string | null
      lastSeenAt: string
    }>()

    for (const row of rowStmt.iterate() as Iterable<HistoryRow>) {
      let data: any
      try {
        data = JSON.parse(row.data_json || '{}')
      } catch {
        continue
      }

      const user = typeof data.user === 'object' && data.user ? data.user : {}
      const raw = typeof data.raw === 'object' && data.raw ? data.raw : data
      const rawIdentity = raw?.userIdentity || raw?.user?.userIdentity || raw?.userDetails?.userIdentity || null
      const platform = row.platform
      const username = normalizeUsername(user.username || raw?.uniqueId || row.user_name || '')
      if (!username) continue

      const badges = Array.isArray(user.badges)
        ? user.badges
        : Array.isArray(raw?.userBadges)
          ? raw.userBadges
          : Array.isArray(raw?.badges)
            ? raw.badges
            : []
      const badgeText = badges.map((badge: any) => `${badge?.id || badge?.type || ''} ${badge?.name || badge?.displayName || badge?.title || ''}`).join(' ').toLowerCase()
      const isSuperFan = platform === 'tiktok'
        ? Boolean(user.isSuperFan || raw?.isSuperFan || badgeText.includes('superfan') || badgeText.includes('super fan'))
        : platform === 'youtube'
          ? Boolean(user.isSuperFan || badgeText.includes('superfan') || badgeText.includes('super fan'))
          : false
      const isFanClubMember = platform === 'tiktok'
        ? Boolean(isSuperFan || user.isFanClubMember || user.isSubscriber || raw?.isFanClubMember || raw?.isSubscriber || rawIdentity?.isSubscriberOfAnchor || isFanClubBadgeLabel(badgeText))
        : Boolean(user.isFanClubMember || user.isSubscriber || isFanClubBadgeLabel(badgeText))
      const isModerator = Boolean(user.isModerator || raw?.isModerator || rawIdentity?.isModeratorOfAnchor || badgeText.includes('moderator'))
      const key = `${platform}:${username}`
      const existing = aggregates.get(key)
      const displayName = safeDisplayName(user.displayName || raw?.nickname || row.user_name || username)
      const profilePictureUrl = normalizeOptionalText(user.profilePictureUrl || raw?.profilePictureUrl || raw?.avatar_thumb?.url_list?.[0])
      const platformUserId = normalizeOptionalText(user.id || raw?.userId)

      const next = existing || {
        platform,
        username,
        platformUserId: null,
        displayName: null,
        profilePictureUrl: null,
        isFanClubMember: false,
        isSuperFan: false,
        isModerator: false,
        moderatorBadgeImageUrl: null,
        tiktokFanClubBadgeImageUrl: null,
        tiktokSuperFanBadgeImageUrl: null,
        twitchSubBadgeImageUrl: null,
        youtubeSuperFanBadgeImageUrl: null,
        lastSeenAt: row.created_at || ''
      }

      if (!existing || (row.created_at || '') >= next.lastSeenAt) {
        next.displayName = displayName
        next.profilePictureUrl = profilePictureUrl || next.profilePictureUrl
        next.lastSeenAt = row.created_at || next.lastSeenAt
      }
      next.platformUserId = platformUserId || next.platformUserId
      next.isFanClubMember = next.isFanClubMember || isFanClubMember
      next.isSuperFan = next.isSuperFan || isSuperFan
      next.isModerator = next.isModerator || isModerator
      next.moderatorBadgeImageUrl = next.moderatorBadgeImageUrl || findBadgeImageFromRaw(badges, (label) => label.includes('moderator') || label === 'mod')
      next.tiktokFanClubBadgeImageUrl = next.tiktokFanClubBadgeImageUrl || findBadgeImageFromRaw(badges, isFanClubBadgeLabel)
      next.tiktokSuperFanBadgeImageUrl = next.tiktokSuperFanBadgeImageUrl || findBadgeImageFromRaw(badges, (label) => label.includes('super fan') || label.includes('superfan'))
      next.twitchSubBadgeImageUrl = next.twitchSubBadgeImageUrl || findBadgeImageFromRaw(badges, (label) => label.includes('subscriber'))
      next.youtubeSuperFanBadgeImageUrl = next.youtubeSuperFanBadgeImageUrl || findBadgeImageFromRaw(badges, (label) => label.includes('super fan') || label.includes('superfan'))
      aggregates.set(key, next)
    }

    const update = this.db.prepare(`
      UPDATE user_stats
      SET platform_user_id = COALESCE(?, platform_user_id),
          display_name = COALESCE(NULLIF(?, ''), display_name),
          profile_picture_url = COALESCE(?, profile_picture_url),
          is_fan_club_member = MAX(is_fan_club_member, ?),
          is_super_fan = MAX(is_super_fan, ?),
          is_moderator = MAX(is_moderator, ?),
          moderator_badge_image_url = COALESCE(moderator_badge_image_url, ?),
          tiktok_fan_club_badge_image_url = COALESCE(tiktok_fan_club_badge_image_url, ?),
          tiktok_super_fan_badge_image_url = COALESCE(tiktok_super_fan_badge_image_url, ?),
          twitch_sub_badge_image_url = COALESCE(twitch_sub_badge_image_url, ?),
          youtube_super_fan_badge_image_url = COALESCE(youtube_super_fan_badge_image_url, ?)
      WHERE platform = ? AND username = ?
    `)

    let changed = 0
    const transaction = this.db.transaction(() => {
      for (const item of aggregates.values()) {
        this.mergeExistingPlatformUserIdRows(item.platform, item.username, item.platformUserId, item.displayName || undefined, item.profilePictureUrl)
        const result = update.run(
          item.platformUserId,
          item.displayName,
          item.profilePictureUrl,
          item.isFanClubMember ? 1 : 0,
          item.isSuperFan ? 1 : 0,
          item.isModerator ? 1 : 0,
          item.moderatorBadgeImageUrl,
          item.tiktokFanClubBadgeImageUrl,
          item.tiktokSuperFanBadgeImageUrl,
          item.twitchSubBadgeImageUrl,
          item.youtubeSuperFanBadgeImageUrl,
          item.platform,
          item.username
        )
        changed += result.changes
      }
    })
    transaction()

    return changed
  }

  mergeRenamedAccount(
    platform: string,
    oldUsername: string,
    newUsername: string,
    metadata: {
      platformUserId?: string | null
      displayName?: string
      profilePictureUrl?: string | null
    } = {}
  ): UserStatRow | null {
    const sourceUsername = normalizeUsername(oldUsername)
    const targetUsername = normalizeUsername(newUsername)
    if (!platform || !sourceUsername || !targetUsername) return null
    if (sourceUsername === targetUsername) return this.getUserStat(platform, targetUsername)

    const source = this.getUserStat(platform, sourceUsername)
    if (!source) return this.getUserStat(platform, targetUsername)

    const target = this.getUserStat(platform, targetUsername)
    const platformUserId = normalizeOptionalText(metadata.platformUserId) || source.platform_user_id || target?.platform_user_id || null
    const displayName = safeDisplayName(metadata.displayName || target?.display_name || source.display_name || targetUsername)
    const profilePictureUrl = metadata.profilePictureUrl ?? target?.profile_picture_url ?? source.profile_picture_url ?? null

    if (source.profile_id && target?.profile_id && source.profile_id !== target.profile_id) {
      this.viewerProfiles.mergeViewerProfiles(target.profile_id, source.profile_id)
    }

    const transaction = this.db.transaction(() => {
      if (!target) {
        this.db.prepare(`
          UPDATE user_stats
          SET username = ?,
              platform_user_id = COALESCE(?, platform_user_id),
              display_name = ?,
              profile_picture_url = COALESCE(?, profile_picture_url),
              profile_id = COALESCE(profile_id, ?)
          WHERE platform = ? AND username = ?
        `).run(
          targetUsername,
          platformUserId,
          displayName,
          profilePictureUrl,
          source.profile_id,
          platform,
          sourceUsername
        )
      } else {
        this.db.prepare(`
          UPDATE user_stats
          SET platform_user_id = COALESCE(?, platform_user_id, ?),
              display_name = ?,
              profile_picture_url = COALESCE(?, user_stats.profile_picture_url, ?),
              is_fan_club_member = MAX(user_stats.is_fan_club_member, ?),
              is_super_fan = MAX(user_stats.is_super_fan, ?),
              is_moderator = MAX(user_stats.is_moderator, ?),
              moderator_badge_image_url = COALESCE(user_stats.moderator_badge_image_url, ?),
              tiktok_fan_club_badge_image_url = COALESCE(user_stats.tiktok_fan_club_badge_image_url, ?),
              tiktok_super_fan_badge_image_url = COALESCE(user_stats.tiktok_super_fan_badge_image_url, ?),
              twitch_sub_badge_image_url = COALESCE(user_stats.twitch_sub_badge_image_url, ?),
              youtube_super_fan_badge_image_url = COALESCE(user_stats.youtube_super_fan_badge_image_url, ?),
              profile_id = COALESCE(user_stats.profile_id, ?),
              total_likes = user_stats.total_likes + ?,
              total_gifts = user_stats.total_gifts + ?,
              total_gift_value_cents = user_stats.total_gift_value_cents + ?,
              total_subscriptions = user_stats.total_subscriptions + ?,
              total_follows = MIN(user_stats.total_follows + ?, 1),
              total_shares = user_stats.total_shares + ?,
              total_raids = user_stats.total_raids + ?,
              total_chats = user_stats.total_chats + ?,
              total_song_requests = user_stats.total_song_requests + ?,
              total_cohost_calls = user_stats.total_cohost_calls + ?,
              first_seen_at = CASE
                WHEN user_stats.first_seen_at IS NULL OR ? < user_stats.first_seen_at THEN ?
                ELSE user_stats.first_seen_at
              END,
              last_seen_at = CASE
                WHEN user_stats.last_seen_at IS NULL OR ? > user_stats.last_seen_at THEN ?
                ELSE user_stats.last_seen_at
              END
          WHERE platform = ? AND username = ?
        `).run(
          platformUserId,
          source.platform_user_id,
          displayName,
          profilePictureUrl,
          source.profile_picture_url,
          source.is_fan_club_member,
          source.is_super_fan,
          source.is_moderator,
          source.moderator_badge_image_url,
          source.tiktok_fan_club_badge_image_url,
          source.tiktok_super_fan_badge_image_url,
          source.twitch_sub_badge_image_url,
          source.youtube_super_fan_badge_image_url,
          source.profile_id,
          source.total_likes,
          source.total_gifts,
          source.total_gift_value_cents,
          source.total_subscriptions,
          source.total_follows,
          source.total_shares,
          source.total_raids,
          source.total_chats,
          source.total_song_requests,
          source.total_cohost_calls,
          source.first_seen_at,
          source.first_seen_at,
          source.last_seen_at,
          source.last_seen_at,
          platform,
          targetUsername
        )
        this.db.prepare('DELETE FROM user_stats WHERE platform = ? AND username = ?').run(platform, sourceUsername)
      }

      this.viewerProfiles.mergeViewerAccountRows(platform, sourceUsername, targetUsername, {
        platformUserId,
        displayName,
        profilePictureUrl
      })

      // Merge event history
      this.db.prepare('UPDATE event_history SET user_name = ? WHERE platform = ? AND user_name = ?')
        .run(targetUsername, platform, sourceUsername)

      // Merge economy_users
      const sourceEco = this.db.prepare('SELECT * FROM economy_users WHERE platform = ? AND username = ?').get(platform, sourceUsername) as { points: number; xp: number; level: number; total_likes: number } | undefined
      if (sourceEco) {
        const targetEco = this.db.prepare('SELECT * FROM economy_users WHERE platform = ? AND username = ?').get(platform, targetUsername) as { points: number; xp: number; level: number; total_likes: number } | undefined
        if (!targetEco) {
          this.db.prepare('UPDATE economy_users SET username = ? WHERE platform = ? AND username = ?').run(targetUsername, platform, sourceUsername)
        } else {
          this.db.prepare(`
            UPDATE economy_users
            SET points = points + ?,
                xp = xp + ?,
                level = MAX(level, ?),
                total_likes = total_likes + ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE platform = ? AND username = ?
          `).run(
            sourceEco.points,
            sourceEco.xp,
            sourceEco.level,
            sourceEco.total_likes,
            platform,
            targetUsername
          )
          this.db.prepare('DELETE FROM economy_users WHERE platform = ? AND username = ?').run(platform, sourceUsername)
        }
      }
    })

    transaction()
    return this.getUserStat(platform, targetUsername)
  }

  incrementUserStats(data: {
    username: string
    platform: string
    platformUserId?: string | null
    displayName?: string
    profilePictureUrl?: string | null
    likes?: number
    gifts?: number
    giftValueCents?: number
    subscriptions?: number
    follows?: number
    shares?: number
    raids?: number
    chats?: number
    songRequests?: number
    cohostCalls?: number
    isFanClubMember?: boolean
    isSuperFan?: boolean
    isModerator?: boolean
    moderatorBadgeImageUrl?: string | null
    tiktokFanClubBadgeImageUrl?: string | null
    tiktokSuperFanBadgeImageUrl?: string | null
    twitchSubBadgeImageUrl?: string | null
    youtubeSuperFanBadgeImageUrl?: string | null
  }): void {
    const {
      username,
      platform,
      platformUserId,
      displayName,
      profilePictureUrl,
      isFanClubMember,
      isSuperFan,
      isModerator,
      moderatorBadgeImageUrl,
      tiktokFanClubBadgeImageUrl,
      tiktokSuperFanBadgeImageUrl,
      twitchSubBadgeImageUrl,
      youtubeSuperFanBadgeImageUrl,
      ...increments
    } = data
    const normalizedUsername = normalizeUsername(username)
    if (!normalizedUsername || !platform) return
    const normalizedPlatformUserId = normalizeOptionalText(platformUserId)
    this.mergeExistingPlatformUserIdRows(platform, normalizedUsername, normalizedPlatformUserId, displayName, profilePictureUrl)
    const profileId = this.getViewerProfileId(platform, normalizedUsername)

    this.db.prepare(`
      INSERT INTO user_stats (
        username, platform, platform_user_id, display_name, profile_picture_url, is_fan_club_member, is_super_fan, is_moderator,
        moderator_badge_image_url, tiktok_fan_club_badge_image_url, tiktok_super_fan_badge_image_url,
        twitch_sub_badge_image_url, youtube_super_fan_badge_image_url,
        total_likes, total_gifts, total_gift_value_cents, total_subscriptions,
        total_follows, total_shares, total_raids, total_chats, total_song_requests, total_cohost_calls,
        profile_id, first_seen_at, last_seen_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(username, platform) DO UPDATE SET
        platform_user_id = COALESCE(excluded.platform_user_id, user_stats.platform_user_id),
        display_name = COALESCE(excluded.display_name, user_stats.display_name),
        profile_picture_url = COALESCE(excluded.profile_picture_url, user_stats.profile_picture_url),
        is_fan_club_member = MAX(user_stats.is_fan_club_member, excluded.is_fan_club_member),
        is_super_fan = MAX(user_stats.is_super_fan, excluded.is_super_fan),
        is_moderator = MAX(user_stats.is_moderator, excluded.is_moderator),
        moderator_badge_image_url = COALESCE(excluded.moderator_badge_image_url, user_stats.moderator_badge_image_url),
        tiktok_fan_club_badge_image_url = COALESCE(excluded.tiktok_fan_club_badge_image_url, user_stats.tiktok_fan_club_badge_image_url),
        tiktok_super_fan_badge_image_url = COALESCE(excluded.tiktok_super_fan_badge_image_url, user_stats.tiktok_super_fan_badge_image_url),
        twitch_sub_badge_image_url = COALESCE(excluded.twitch_sub_badge_image_url, user_stats.twitch_sub_badge_image_url),
        youtube_super_fan_badge_image_url = COALESCE(excluded.youtube_super_fan_badge_image_url, user_stats.youtube_super_fan_badge_image_url),
        profile_id = COALESCE(excluded.profile_id, user_stats.profile_id),
        total_likes = user_stats.total_likes + excluded.total_likes,
        total_gifts = user_stats.total_gifts + excluded.total_gifts,
        total_gift_value_cents = user_stats.total_gift_value_cents + excluded.total_gift_value_cents,
        total_subscriptions = user_stats.total_subscriptions + excluded.total_subscriptions,
        -- A user can only "have followed" a channel once. Clamp to 1 so repeat
        -- follow events (TikTok social spam, Twitch backfill on every reconnect)
        -- don't inflate the count.
        total_follows = MIN(user_stats.total_follows + excluded.total_follows, 1),
        total_shares = user_stats.total_shares + excluded.total_shares,
        total_raids = user_stats.total_raids + excluded.total_raids,
        total_chats = user_stats.total_chats + excluded.total_chats,
        total_song_requests = user_stats.total_song_requests + excluded.total_song_requests,
        total_cohost_calls = user_stats.total_cohost_calls + excluded.total_cohost_calls,
        last_seen_at = CURRENT_TIMESTAMP
    `).run(
      normalizedUsername, platform, normalizedPlatformUserId, displayName || normalizedUsername, profilePictureUrl || null, isFanClubMember ? 1 : 0, isSuperFan ? 1 : 0, isModerator ? 1 : 0,
      normalizeOptionalUrl(moderatorBadgeImageUrl),
      normalizeOptionalUrl(tiktokFanClubBadgeImageUrl),
      normalizeOptionalUrl(tiktokSuperFanBadgeImageUrl),
      normalizeOptionalUrl(twitchSubBadgeImageUrl),
      normalizeOptionalUrl(youtubeSuperFanBadgeImageUrl),
      increments.likes || 0, increments.gifts || 0, increments.giftValueCents || 0,
      increments.subscriptions || 0,
      // Clamp the incoming delta too so a single oversized increment can't bypass the upsert clamp.
      Math.min(1, increments.follows || 0),
      increments.shares || 0,
      increments.raids || 0, increments.chats || 0, increments.songRequests || 0, increments.cohostCalls || 0,
      profileId
    )

    if (profileId) {
      this.viewerProfiles.upsertViewerAccount(profileId, {
        platform: platform as Platform,
        username: normalizedUsername,
        displayName: displayName || normalizedUsername,
        profilePictureUrl: profilePictureUrl ?? null
      })
    }
  }

  incrementGlobalStat(key: string, amount: number): void {
    this.totals.incrementGlobalStat(key, amount)
  }

  setGlobalStat(key: string, value: number): void {
    this.totals.setGlobalStat(key, value)
  }

  setGlobalStatIfGreater(key: string, value: number): void {
    this.totals.setGlobalStatIfGreater(key, value)
  }

  getPlatformTotals(platform: string): any {
    return this.totals.getPlatformTotals(platform)
  }

  getUniqueFollowerCount(): number {
    return this.totals.getUniqueFollowerCount()
  }

  getUniqueFollowerCountByPlatform(platform: string): number {
    return this.totals.getUniqueFollowerCountByPlatform(platform)
  }

  setPlatformFollowerCount(platform: string, count: number): void {
    this.followerStats.setPlatformFollowerCount(platform, count)
  }

  incrementPlatformFollowerCount(platform: string, delta: number): void {
    this.followerStats.incrementPlatformFollowerCount(platform, delta)
  }

  getPlatformFollowerStats(): Record<string, {
    followerCount: number
    delta24h: number | null
    delta7d: number | null
    delta30d: number | null
    lastSyncedAt: string | null
  }> {
    return this.followerStats.getPlatformFollowerStats()
  }

  getFollowerSnapshots(platform: string, sinceIso: string, limit = 720): Array<{ capturedAt: string; followerCount: number }> {
    return this.followerStats.getFollowerSnapshots(platform, sinceIso, limit)
  }

  getUniqueUserCount(): number {
    return this.totals.getUniqueUserCount()
  }

  getAllGlobalStats(): any {
    return this.totals.getAllGlobalStats()
  }

  purgeUserStats(username: string): void {
    this.totals.purgeUserStats(username)
  }

  private mergeExistingPlatformUserIdRows(
    platform: string,
    normalizedUsername: string,
    platformUserId: string | null,
    displayName?: string,
    profilePictureUrl?: string | null
  ): void {
    if (!platformUserId) return

    const rows = this.db.prepare(`
      SELECT username FROM user_stats
      WHERE platform = ? AND platform_user_id = ? AND LOWER(username) <> ?
      ORDER BY last_seen_at DESC
    `).all(platform, platformUserId, normalizedUsername) as Array<{ username: string }>

    for (const row of rows) {
      this.mergeRenamedAccount(platform, row.username, normalizedUsername, {
        platformUserId,
        displayName,
        profilePictureUrl
      })
    }
  }

  profileMatchesPermission(profileId: string, permission: string): boolean {
    const rows = this.db.prepare(`
      SELECT user_stats.* 
      FROM user_stats
      LEFT JOIN viewer_accounts
        ON viewer_accounts.platform = user_stats.platform
       AND (
          viewer_accounts.username = LOWER(user_stats.username)
          OR (
            viewer_accounts.platform_user_id IS NOT NULL
            AND user_stats.platform_user_id IS NOT NULL
            AND viewer_accounts.platform_user_id = user_stats.platform_user_id
          )
       )
      WHERE COALESCE(viewer_accounts.profile_id, user_stats.profile_id) = ?
    `).all(profileId) as any[]

    if (rows.length === 0) return false

    const isPrivileged = rows.some(row => 
      row.is_moderator === 1 || 
      row.is_super_fan === 1 || 
      row.total_subscriptions > 0 || 
      row.is_fan_club_member === 1
    )

    switch (permission) {
      case 'everyone':
        return true

      case 'followers':
        return rows.some(row => row.total_follows > 0) || isPrivileged

      case 'fanClub':
      case 'subscribers':
        return rows.some(row => row.total_subscriptions > 0 || row.is_fan_club_member === 1 || row.is_moderator === 1)

      case 'moderators':
        return rows.some(row => row.is_moderator === 1)

      case 'vips':
        return rows.some(row => row.is_super_fan === 1 || row.is_moderator === 1)

      case 'teamMembers':
        return false

      default:
        return false
    }
  }

  getTwitchUsernamesWithNullId(): string[] {
    const rows = this.db.prepare(`
      SELECT username FROM user_stats
      WHERE platform = 'twitch' AND platform_user_id IS NULL
    `).all() as Array<{ username: string }>
    return rows.map(r => r.username)
  }

  updatePlatformUserId(
    platform: string,
    username: string,
    platformUserId: string,
    metadata: { displayName?: string; profilePictureUrl?: string | null } = {}
  ): void {
    const normalizedUsername = normalizeUsername(username)
    if (!platform || !normalizedUsername || !platformUserId) return

    const transaction = this.db.transaction(() => {
      this.mergeExistingPlatformUserIdRows(platform, normalizedUsername, platformUserId, metadata.displayName, metadata.profilePictureUrl)

      this.db.prepare(`
        UPDATE user_stats
        SET platform_user_id = ?
        WHERE platform = ? AND username = ?
      `).run(platformUserId, platform, normalizedUsername)

      this.db.prepare(`
        UPDATE viewer_accounts
        SET platform_user_id = ?
        WHERE platform = ? AND username = ?
      `).run(platformUserId, platform, normalizedUsername)
    })
    transaction()
  }
}
