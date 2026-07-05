import BetterSqlite3 from 'better-sqlite3'
import crypto from 'crypto'
import { BaseRepository } from './BaseRepository'
import {
  type AudienceBadgeImageUrls,
  UserIdentity,
  UserStat,
  type ViewerAccount,
  type ViewerAccountInput,
  type ViewerProfile,
  type ViewerProfileInput
} from '../../../shared/stats'
import type { UserStatRow } from '../database'
import { Platform } from '../../platforms/types'
import { estimateTikTokCreatorGiftCents } from '../../../shared/tiktok-revenue'
import { isCohostIdentity } from '../../ai/cohost-identity'

type UserStatRowWithIdentity = UserStatRow & { resolved_profile_id?: string | null, is_super_fan?: number, is_moderator?: number }

interface ViewerProfileRow {
  id: string
  display_name: string
  profile_picture_url: string | null
  notes: string | null
  primary_platform: string | null
  primary_username: string | null
  created_at: string
  updated_at: string
}

function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, '');
  const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  
  const matrix = Array.from({ length: s1.length + 1 }, () => new Array(s2.length + 1).fill(0));
  for (let i = 0; i <= s1.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= s2.length; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  const maxLength = Math.max(s1.length, s2.length);
  return (maxLength - matrix[s1.length][s2.length]) / maxLength;
}

interface ViewerAccountRow {
  profile_id: string
  platform: string
  username: string
  platform_user_id: string | null
  display_name: string
  profile_picture_url: string | null
  first_seen_at: string
  last_seen_at: string
}

export class StatsRepository extends BaseRepository {
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
      this.fillMissingAvatar(identity)
    }
    // Always compute the overall ranking so the "Overall" column can render
    // even when the table is sorted by a different metric.
    this.attachOverallRanks(allIdentities)

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

  /**
   * Assigns each identity an "overall" RANK (1 = best) by combining their
   * standing across every engagement/contribution category. For each category
   * we rank the audience (1 = top, ties share a position), sum each identity's
   * positions across all categories, then order by that sum — whoever sits
   * highest across the board lands at #1. This is a true ranking ("who's #1
   * overall, #2, #3"), not a 0–100 rating.
   */
  /** Borrow an account's avatar when the identity itself has none. */
  private fillMissingAvatar(identity: UserIdentity): void {
    if (identity.profilePictureUrl) return
    const accounts = identity.accounts || []
    const primaryAcc = accounts.find((a) => a.platform === identity.primaryPlatform && a.profilePictureUrl)
    const anyAcc = accounts.find((a) => a.profilePictureUrl)
    identity.profilePictureUrl = primaryAcc?.profilePictureUrl ?? anyAcc?.profilePictureUrl ?? identity.profilePictureUrl
  }

  private attachOverallRanks(identities: UserIdentity[]): void {
    const n = identities.length
    if (n === 0) return

    const CATEGORIES: Array<keyof UserIdentity> = [
      'totalLikes',
      'totalGifts',
      'totalGiftValueCents',
      'totalShares',
      'totalRaids',
      'totalChats',
      'totalSongRequests'
    ]

    const rankSum = new Map<string, number>()
    for (const identity of identities) rankSum.set(identity.id, 0)

    for (const metric of CATEGORIES) {
      const desc = [...identities].sort(
        (a, b) => Number((b as any)[metric] || 0) - Number((a as any)[metric] || 0)
      )
      let i = 0
      while (i < n) {
        const val = Number((desc[i] as any)[metric] || 0)
        let j = i
        while (j + 1 < n && Number((desc[j + 1] as any)[metric] || 0) === val) j++
        const position = i + 1 // ties share the best position in their group
        for (let k = i; k <= j; k++) {
          rankSum.set(desc[k].id, (rankSum.get(desc[k].id) || 0) + position)
        }
        i = j + 1
      }
    }

    // Lowest combined position wins. Break ties by revenue, then recency.
    const ordered = [...identities].sort((a, b) => {
      const sa = rankSum.get(a.id) || 0
      const sb = rankSum.get(b.id) || 0
      if (sa !== sb) return sa - sb
      if ((b.totalGiftValueCents || 0) !== (a.totalGiftValueCents || 0)) {
        return (b.totalGiftValueCents || 0) - (a.totalGiftValueCents || 0)
      }
      return (b.lastSeenAt || '').localeCompare(a.lastSeenAt || '')
    })

    ordered.forEach((identity, index) => {
      identity.overallRank = index + 1
    })
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

    if (identity) this.fillMissingAvatar(identity)

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
      this.attachOverallRanks(all)
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
    const profile = this.getViewerProfile(profileId)
    if (!profile) return []

    // Get all usernames in this profile to check against
    const sourceNames = profile.accounts.map(a => a.username)
    if (profile.displayName) sourceNames.push(profile.displayName)

    const allOtherAccounts = this.db.prepare(`
      SELECT platform, username, display_name, profile_picture_url, profile_id
      FROM user_stats
      WHERE profile_id IS NULL OR profile_id != ?
    `).all(profileId) as Array<{ platform: string; username: string; display_name: string; profile_picture_url: string | null; profile_id: string | null }>

    const suggestions: Array<{ platform: Platform; username: string; displayName: string; profilePictureUrl: string | null; similarity: number; profileId: string | null }> = []

    for (const acc of allOtherAccounts) {
      let maxSim = 0
      for (const src of sourceNames) {
        maxSim = Math.max(maxSim, calculateSimilarity(src, acc.username), calculateSimilarity(src, acc.display_name))
      }
      
      if (maxSim >= 0.75) {
        suggestions.push({
          platform: acc.platform as Platform,
          username: acc.username,
          displayName: acc.display_name,
          profilePictureUrl: acc.profile_picture_url,
          similarity: maxSim,
          profileId: acc.profile_id
        })
      }
    }

    return suggestions.sort((a, b) => b.similarity - a.similarity).slice(0, 5)
  }

  linkAccounts(p1: string, u1: string, p2: string, u2: string): ViewerProfile | null {
    const account1 = this.normalizeAccountInput({ platform: p1 as Platform, username: u1 })
    const account2 = this.normalizeAccountInput({ platform: p2 as Platform, username: u2 })
    if (!account1 || !account2) return null
    if (account1.platform === account2.platform && account1.username === account2.username) {
      return this.getViewerProfileByAccount(account1.platform, account1.username)
    }

    const profileId = this.getOrCreateProfileForAccount(account1)
    const secondProfileId = this.getViewerProfileId(account2.platform, account2.username)
    if (secondProfileId && secondProfileId !== profileId) {
      this.mergeViewerProfiles(profileId, secondProfileId)
    }
    this.addAccountToProfile(profileId, account1)
    this.addAccountToProfile(profileId, account2)
    this.syncStatsProfileIdForProfile(profileId)
    return this.getViewerProfile(profileId)
  }

  unlinkAccount(platform: string, username: string): void {
    const normalizedUsername = normalizeUsername(username)
    if (!platform || !normalizedUsername) return

    const account = this.db.prepare(
      'SELECT profile_id FROM viewer_accounts WHERE platform = ? AND username = ?'
    ).get(platform, normalizedUsername) as { profile_id: string } | undefined

    this.db.prepare('DELETE FROM viewer_accounts WHERE platform = ? AND username = ?').run(platform, normalizedUsername)
    this.db.prepare('UPDATE user_stats SET profile_id = NULL WHERE platform = ? AND LOWER(username) = ?')
      .run(platform, normalizedUsername)

    if (account?.profile_id) {
      this.refreshViewerProfile(account.profile_id)
    }
  }

  getViewerProfileId(
    platform: string,
    username: string,
    identity: { platformUserId?: string | null; displayName?: string | null } = {}
  ): string | null {
    const normalizedUsername = normalizeUsername(username)
    const normalizedDisplayName = normalizeUsername(identity.displayName || undefined)
    const normalizedPlatformUserId = normalizeOptionalText(identity.platformUserId)
    if (!normalizedUsername && !normalizedDisplayName && !normalizedPlatformUserId) return null

    if (platform && platform !== 'all') {
      if (normalizedPlatformUserId) {
        const accountById = this.db.prepare(
          'SELECT profile_id FROM viewer_accounts WHERE platform = ? AND platform_user_id = ? ORDER BY last_seen_at DESC LIMIT 1'
        ).get(platform, normalizedPlatformUserId) as { profile_id: string } | undefined
        if (accountById?.profile_id) return accountById.profile_id

        const statById = this.db.prepare(
          'SELECT profile_id FROM user_stats WHERE platform = ? AND platform_user_id = ? AND profile_id IS NOT NULL ORDER BY last_seen_at DESC LIMIT 1'
        ).get(platform, normalizedPlatformUserId) as { profile_id: string | null } | undefined
        if (statById?.profile_id) return statById.profile_id
      }

      for (const candidate of uniqueNonEmpty([normalizedUsername, normalizedDisplayName])) {
        const account = this.db.prepare(
          'SELECT profile_id FROM viewer_accounts WHERE platform = ? AND (username = ? OR LOWER(display_name) = ?) ORDER BY last_seen_at DESC LIMIT 1'
        ).get(platform, candidate, candidate) as { profile_id: string } | undefined
        if (account?.profile_id) return account.profile_id

        const stat = this.db.prepare(
          'SELECT profile_id FROM user_stats WHERE platform = ? AND (LOWER(username) = ? OR LOWER(display_name) = ?) AND profile_id IS NOT NULL ORDER BY last_seen_at DESC LIMIT 1'
        ).get(platform, candidate, candidate) as { profile_id: string | null } | undefined
        if (stat?.profile_id) return stat.profile_id
      }

      return null
    }

    if (normalizedPlatformUserId) {
      const accountById = this.db.prepare(
        'SELECT profile_id FROM viewer_accounts WHERE platform_user_id = ? ORDER BY last_seen_at DESC LIMIT 1'
      ).get(normalizedPlatformUserId) as { profile_id: string } | undefined
      if (accountById?.profile_id) return accountById.profile_id

      const statById = this.db.prepare(
        'SELECT profile_id FROM user_stats WHERE platform_user_id = ? AND profile_id IS NOT NULL ORDER BY last_seen_at DESC LIMIT 1'
      ).get(normalizedPlatformUserId) as { profile_id: string | null } | undefined
      if (statById?.profile_id) return statById.profile_id
    }

    for (const candidate of uniqueNonEmpty([normalizedUsername, normalizedDisplayName])) {
      const account = this.db.prepare(
        'SELECT profile_id FROM viewer_accounts WHERE username = ? OR LOWER(display_name) = ? ORDER BY last_seen_at DESC LIMIT 1'
      ).get(candidate, candidate) as { profile_id: string } | undefined
      if (account?.profile_id) return account.profile_id

      const stat = this.db.prepare(
        'SELECT profile_id FROM user_stats WHERE (LOWER(username) = ? OR LOWER(display_name) = ?) AND profile_id IS NOT NULL ORDER BY last_seen_at DESC LIMIT 1'
      ).get(candidate, candidate) as { profile_id: string | null } | undefined
      if (stat?.profile_id) return stat.profile_id
    }

    return null
  }

  getViewerProfiles(opts: { query?: string; limit?: number } = {}): ViewerProfile[] {
    const params: unknown[] = []
    const where: string[] = []
    if (opts.query?.trim()) {
      const like = `%${opts.query.trim().toLowerCase()}%`
      where.push(`(
        LOWER(viewer_profiles.display_name) LIKE ?
        OR EXISTS (
          SELECT 1 FROM viewer_accounts
          WHERE viewer_accounts.profile_id = viewer_profiles.id
            AND (viewer_accounts.username LIKE ? OR LOWER(viewer_accounts.display_name) LIKE ?)
        )
      )`)
      params.push(like, like, like)
    }
    const limit = Math.max(1, Math.min(1000, Math.floor(opts.limit ?? 500)))
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const rows = this.db.prepare(`
      SELECT id FROM viewer_profiles
      ${whereSql}
      ORDER BY updated_at DESC, display_name ASC
      LIMIT ?
    `).all(...params, limit) as Array<{ id: string }>

    return rows
      .map((row) => this.getViewerProfile(row.id))
      .filter((profile): profile is ViewerProfile => Boolean(profile))
  }

  getViewerProfile(profileId: string): ViewerProfile | null {
    const row = this.db.prepare('SELECT * FROM viewer_profiles WHERE id = ?').get(profileId) as ViewerProfileRow | undefined
    if (!row) return null
    return {
      id: row.id,
      displayName: row.display_name,
      profilePictureUrl: row.profile_picture_url,
      notes: row.notes || '',
      primaryPlatform: row.primary_platform as Platform | null,
      primaryUsername: row.primary_username ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      accounts: this.getViewerAccounts(row.id)
    }
  }

  getViewerProfileByAccount(platform: string, username: string): ViewerProfile | null {
    const profileId = this.getViewerProfileId(platform, username)
    return profileId ? this.getViewerProfile(profileId) : null
  }

  createViewerProfile(input: ViewerProfileInput): ViewerProfile {
    const firstAccount = input.accounts?.map((account) => this.normalizeAccountInput(account)).find(Boolean) || null
    const id = crypto.randomUUID()
    const displayName = safeDisplayName(input.displayName || firstAccount?.displayName || firstAccount?.username || 'Viewer')
    const primaryPlatform = input.primaryPlatform || firstAccount?.platform || null
    const profilePictureUrl = input.profilePictureUrl || firstAccount?.profilePictureUrl || null

    this.db.prepare(`
      INSERT INTO viewer_profiles (id, display_name, profile_picture_url, notes, primary_platform, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(id, displayName, profilePictureUrl, input.notes || '', primaryPlatform)

    for (const account of input.accounts || []) {
      this.addAccountToProfile(id, account)
    }
    this.refreshViewerProfile(id)
    return this.getViewerProfile(id)!
  }

  updateViewerProfile(profileId: string, patch: Partial<ViewerProfileInput>): ViewerProfile | null {
    const existing = this.getViewerProfile(profileId)
    if (!existing) return null

    this.db.prepare(`
      UPDATE viewer_profiles
      SET display_name = ?, profile_picture_url = ?, notes = ?, primary_platform = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      safeDisplayName(patch.displayName ?? existing.displayName),
      patch.profilePictureUrl !== undefined ? patch.profilePictureUrl : existing.profilePictureUrl,
      patch.notes ?? existing.notes,
      patch.primaryPlatform === undefined ? existing.primaryPlatform : patch.primaryPlatform,
      profileId
    )

    return this.getViewerProfile(profileId)
  }

  addAccountToProfile(profileId: string, accountInput: ViewerAccountInput): ViewerProfile | null {
    const account = this.normalizeAccountInput(accountInput)
    if (!account || !this.getViewerProfile(profileId)) return null

    const existingProfileId = this.getViewerProfileId(account.platform, account.username)
    if (existingProfileId && existingProfileId !== profileId) {
      this.mergeViewerProfiles(profileId, existingProfileId)
    }

    const stat = this.getUserStat(account.platform, account.username)
    this.upsertViewerAccount(profileId, {
      ...account,
      platformUserId: account.platformUserId ?? stat?.platform_user_id ?? null,
      displayName: account.displayName || stat?.display_name || account.username,
      profilePictureUrl: account.profilePictureUrl ?? stat?.profile_picture_url ?? null
    })
    this.db.prepare('UPDATE user_stats SET profile_id = ? WHERE platform = ? AND LOWER(username) = ?')
      .run(profileId, account.platform, account.username)
    this.refreshViewerProfile(profileId)
    return this.getViewerProfile(profileId)
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
      this.mergeViewerProfiles(target.profile_id, source.profile_id)
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

      this.mergeViewerAccountRows(platform, sourceUsername, targetUsername, {
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
      this.upsertViewerAccount(profileId, {
        platform: platform as Platform,
        username: normalizedUsername,
        displayName: displayName || normalizedUsername,
        profilePictureUrl: profilePictureUrl ?? null
      })
    }
  }

  incrementGlobalStat(key: string, amount: number): void {
    const col = this.getGlobalStatColumn(key)
    if (!col) return
    this.db.prepare(`UPDATE global_stats SET ${col} = ${col} + ?`).run(amount)
  }

  setGlobalStat(key: string, value: number): void {
    const col = this.getGlobalStatColumn(key)
    if (!col) return
    this.db.prepare(`UPDATE global_stats SET ${col} = ?`).run(value)
  }

  setGlobalStatIfGreater(key: string, value: number): void {
    const col = this.getGlobalStatColumn(key)
    if (!col) return
    this.db.prepare(`UPDATE global_stats SET ${col} = MAX(${col}, ?)`).run(value)
  }

  getPlatformTotals(platform: string): any {
    const row = this.db.prepare(`
      SELECT
        COALESCE(SUM(total_likes), 0) as totalLikes,
        COALESCE(SUM(total_gifts), 0) as totalGifts,
        COALESCE(SUM(total_gift_value_cents), 0) as totalGiftValueCents,
        COALESCE(SUM(total_subscriptions), 0) as totalSubscriptions,
        -- "Followers we've seen events from" — one per user, never multiplied.
        COALESCE(SUM(CASE WHEN total_follows > 0 THEN 1 ELSE 0 END), 0) as totalFollows,
        COALESCE(SUM(total_shares), 0) as totalShares,
        COALESCE(SUM(total_raids), 0) as totalRaids,
        COALESCE(SUM(total_chats), 0) as totalChats,
        COALESCE(SUM(total_song_requests), 0) as totalSongRequests,
        COUNT(DISTINCT username) as uniqueUserCount
      FROM user_stats WHERE platform = ?
    `).get(platform) as any

    return row || {
      totalLikes: 0, totalGifts: 0, totalGiftValueCents: 0,
      totalSubscriptions: 0, totalFollows: 0, totalShares: 0,
      totalRaids: 0, totalChats: 0, totalSongRequests: 0,
      uniqueUserCount: 0
    }
  }

  getUniqueFollowerCount(): number {
    return (this.db.prepare('SELECT COUNT(*) as count FROM user_stats WHERE total_follows > 0').get() as { count: number }).count
  }

  getUniqueFollowerCountByPlatform(platform: string): number {
    return (this.db.prepare('SELECT COUNT(*) as count FROM user_stats WHERE total_follows > 0 AND platform = ?').get(platform) as { count: number }).count
  }

  /**
   * Store the platform's authoritative follower count (pulled from its public
   * API or live-room state). Also records an hourly snapshot so we can compute
   * growth deltas later — same hour writes are upserted so we don't bloat
   * the snapshots table with sub-hour samples.
   */
  setPlatformFollowerCount(platform: string, count: number): void {
    const safeCount = Math.max(0, Math.floor(count))
    this.db.prepare(`
      INSERT INTO platform_follower_stats (platform, follower_count, last_synced_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(platform) DO UPDATE SET
        follower_count = excluded.follower_count,
        last_synced_at = CURRENT_TIMESTAMP
    `).run(platform, safeCount)

    this.snapshotFollowerCount(platform, safeCount)
  }

  /**
   * Nudge a manually-tracked follower count by a delta (e.g. +1 on a live
   * follow event for TikTok, which has no follower API). Clamped at zero and
   * snapshotted like a regular sync so growth deltas keep working. No-ops when
   * the platform has no row yet — we only track once the streamer has entered
   * their starting count.
   */
  incrementPlatformFollowerCount(platform: string, delta: number): void {
    if (!Number.isFinite(delta) || delta === 0) return
    const existing = this.db.prepare(
      'SELECT follower_count FROM platform_follower_stats WHERE platform = ?'
    ).get(platform) as { follower_count: number } | undefined
    if (!existing) return

    const next = Math.max(0, existing.follower_count + Math.trunc(delta))
    this.db.prepare(`
      UPDATE platform_follower_stats
      SET follower_count = ?, last_synced_at = CURRENT_TIMESTAMP
      WHERE platform = ?
    `).run(next, platform)
    this.snapshotFollowerCount(platform, next)
  }

  /** Records the current-hour snapshot used for 24h/7d/30d growth deltas. */
  private snapshotFollowerCount(platform: string, count: number): void {
    const hourStart = new Date()
    hourStart.setMinutes(0, 0, 0)
    this.db.prepare(`
      INSERT INTO follower_snapshots (platform, captured_at, follower_count)
      VALUES (?, ?, ?)
      ON CONFLICT(platform, captured_at) DO UPDATE SET
        follower_count = excluded.follower_count
    `).run(platform, hourStart.toISOString(), Math.max(0, Math.floor(count)))
  }

  /**
   * For every platform we have a count for: current count + growth deltas
   * (24 h / 7 d / 30 d). Deltas are null when we don't have a snapshot that
   * old yet — better than reporting "0 growth" which would be misleading.
   */
  getPlatformFollowerStats(): Record<string, {
    followerCount: number
    delta24h: number | null
    delta7d: number | null
    delta30d: number | null
    lastSyncedAt: string | null
  }> {
    const rows = this.db.prepare('SELECT platform, follower_count, last_synced_at FROM platform_follower_stats').all() as Array<{
      platform: string
      follower_count: number
      last_synced_at: string | null
    }>

    const result: Record<string, {
      followerCount: number
      delta24h: number | null
      delta7d: number | null
      delta30d: number | null
      lastSyncedAt: string | null
    }> = {}

    const snapshotStmt = this.db.prepare(`
      SELECT follower_count FROM follower_snapshots
      WHERE platform = ? AND captured_at <= ?
      ORDER BY captured_at DESC LIMIT 1
    `)

    const now = Date.now()
    const delta = (platform: string, current: number, msAgo: number): number | null => {
      const cutoff = new Date(now - msAgo).toISOString()
      const row = snapshotStmt.get(platform, cutoff) as { follower_count: number } | undefined
      if (!row) return null
      return current - row.follower_count
    }

    const DAY = 24 * 60 * 60 * 1000
    for (const row of rows) {
      result[row.platform] = {
        followerCount: row.follower_count,
        delta24h: delta(row.platform, row.follower_count, DAY),
        delta7d: delta(row.platform, row.follower_count, 7 * DAY),
        delta30d: delta(row.platform, row.follower_count, 30 * DAY),
        lastSyncedAt: row.last_synced_at
      }
    }

    return result
  }

  /**
   * Return raw snapshots for a platform within the requested window. Useful
   * for sparkline charts. Capped at `limit` rows.
   */
  getFollowerSnapshots(platform: string, sinceIso: string, limit = 720): Array<{ capturedAt: string; followerCount: number }> {
    const rows = this.db.prepare(`
      SELECT captured_at, follower_count FROM follower_snapshots
      WHERE platform = ? AND captured_at >= ?
      ORDER BY captured_at ASC LIMIT ?
    `).all(platform, sinceIso, Math.max(1, Math.min(5000, limit))) as Array<{ captured_at: string; follower_count: number }>
    return rows.map(r => ({ capturedAt: r.captured_at, followerCount: r.follower_count }))
  }

  getUniqueUserCount(): number {
    return (this.db.prepare('SELECT COUNT(*) as count FROM user_stats').get() as { count: number }).count
  }

  getAllGlobalStats(): any {
    return this.db.prepare('SELECT * FROM global_stats LIMIT 1').get()
  }

  purgeUserStats(username: string): void {
    this.db.prepare('DELETE FROM user_stats WHERE username = ?').run(username)
  }

  private getViewerAccounts(profileId: string): ViewerAccount[] {
    const rows = this.db.prepare(`
      SELECT * FROM viewer_accounts
      WHERE profile_id = ?
      ORDER BY last_seen_at DESC, platform ASC, username ASC
    `).all(profileId) as ViewerAccountRow[]

    return rows.map((row) => ({
      profileId: row.profile_id,
      platform: row.platform as Platform,
      username: row.username,
      platformUserId: row.platform_user_id,
      displayName: row.display_name,
      profilePictureUrl: row.profile_picture_url,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at
    }))
  }

  private getOrCreateProfileForAccount(account: ViewerAccountInput): string {
    const normalized = this.normalizeAccountInput(account)
    if (!normalized) throw new Error('Cannot create a viewer profile without a platform and username.')

    const existingProfileId = this.getViewerProfileId(normalized.platform, normalized.username)
    if (existingProfileId) {
      this.addAccountToProfile(existingProfileId, normalized)
      return existingProfileId
    }

    const stat = this.getUserStat(normalized.platform, normalized.username)
    const profileId = stat?.profile_id || crypto.randomUUID()
    this.ensureViewerProfile(
      profileId,
      safeDisplayName(normalized.displayName || stat?.display_name || normalized.username),
      normalized.platform
    )
    this.upsertViewerAccount(profileId, {
      ...normalized,
      platformUserId: normalized.platformUserId ?? stat?.platform_user_id ?? null,
      displayName: normalized.displayName || stat?.display_name || normalized.username,
      profilePictureUrl: normalized.profilePictureUrl ?? stat?.profile_picture_url ?? null
    })
    this.db.prepare('UPDATE user_stats SET profile_id = ? WHERE platform = ? AND LOWER(username) = ?')
      .run(profileId, normalized.platform, normalized.username)
    return profileId
  }

  private normalizeAccountInput(account: ViewerAccountInput): ViewerAccountInput | null {
    const username = normalizeUsername(account.username)
    const platform = String(account.platform || '').trim() as Platform
    if (!username || !platform || platform === ('all' as Platform)) return null
    return {
      platform,
      username,
      platformUserId: normalizeOptionalText(account.platformUserId),
      displayName: safeDisplayName(account.displayName || username),
      profilePictureUrl: account.profilePictureUrl ?? null
    }
  }

  private ensureViewerProfile(profileId: string, displayName: string, primaryPlatform: string | null): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO viewer_profiles (id, display_name, primary_platform, created_at, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(profileId, safeDisplayName(displayName), primaryPlatform)
  }

  private upsertViewerAccount(profileId: string, accountInput: ViewerAccountInput): void {
    const account = this.normalizeAccountInput(accountInput)
    if (!account) return

    this.ensureViewerProfile(profileId, account.displayName || account.username, account.platform)
    this.db.prepare(`
      INSERT INTO viewer_accounts (
        profile_id, platform, username, platform_user_id, display_name, profile_picture_url, first_seen_at, last_seen_at
      )
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(platform, username) DO UPDATE SET
        profile_id = excluded.profile_id,
        platform_user_id = COALESCE(excluded.platform_user_id, viewer_accounts.platform_user_id),
        display_name = COALESCE(NULLIF(excluded.display_name, ''), viewer_accounts.display_name),
        profile_picture_url = COALESCE(excluded.profile_picture_url, viewer_accounts.profile_picture_url),
        last_seen_at = CURRENT_TIMESTAMP
    `).run(
      profileId,
      account.platform,
      account.username,
      account.platformUserId ?? null,
      account.displayName || account.username,
      account.profilePictureUrl ?? null
    )
  }

  private mergeViewerProfiles(targetProfileId: string, sourceProfileId: string): void {
    if (targetProfileId === sourceProfileId) return

    const sourceAccounts = this.getViewerAccounts(sourceProfileId)
    const transaction = this.db.transaction(() => {
      for (const account of sourceAccounts) {
        this.upsertViewerAccount(targetProfileId, account)
      }
      this.db.prepare('UPDATE user_stats SET profile_id = ? WHERE profile_id = ?')
        .run(targetProfileId, sourceProfileId)
      this.db.prepare('DELETE FROM viewer_accounts WHERE profile_id = ?').run(sourceProfileId)
      this.db.prepare('DELETE FROM viewer_profiles WHERE id = ?').run(sourceProfileId)
    })
    transaction()
    this.refreshViewerProfile(targetProfileId)
  }

  private syncStatsProfileIdForProfile(profileId: string): void {
    const accounts = this.getViewerAccounts(profileId)
    const update = this.db.prepare('UPDATE user_stats SET profile_id = ? WHERE platform = ? AND LOWER(username) = ?')
    const transaction = this.db.transaction(() => {
      for (const account of accounts) {
        update.run(profileId, account.platform, account.username)
      }
    })
    transaction()
  }

  private refreshViewerProfile(profileId: string): void {
    const accounts = this.getViewerAccounts(profileId)
    const latest = accounts[0]
    if (!latest) {
      this.db.prepare('UPDATE viewer_profiles SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(profileId)
      return
    }

    this.db.prepare(`
      UPDATE viewer_profiles
      SET primary_platform = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(latest.platform, profileId)
    this.syncStatsProfileIdForProfile(profileId)
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

  private mergeViewerAccountRows(
    platform: string,
    sourceUsername: string,
    targetUsername: string,
    metadata: {
      platformUserId?: string | null
      displayName?: string
      profilePictureUrl?: string | null
    }
  ): void {
    const source = this.db.prepare(
      'SELECT * FROM viewer_accounts WHERE platform = ? AND username = ?'
    ).get(platform, sourceUsername) as ViewerAccountRow | undefined
    const target = this.db.prepare(
      'SELECT * FROM viewer_accounts WHERE platform = ? AND username = ?'
    ).get(platform, targetUsername) as ViewerAccountRow | undefined

    const platformUserId = normalizeOptionalText(metadata.platformUserId) || source?.platform_user_id || target?.platform_user_id || null
    const displayName = safeDisplayName(metadata.displayName || target?.display_name || source?.display_name || targetUsername)
    const profilePictureUrl = metadata.profilePictureUrl ?? target?.profile_picture_url ?? source?.profile_picture_url ?? null

    if (source && target) {
      this.db.prepare(`
        UPDATE viewer_accounts
        SET profile_id = COALESCE(viewer_accounts.profile_id, ?),
            platform_user_id = COALESCE(?, viewer_accounts.platform_user_id, ?),
            display_name = ?,
            profile_picture_url = COALESCE(?, viewer_accounts.profile_picture_url, ?),
            first_seen_at = CASE
              WHEN viewer_accounts.first_seen_at IS NULL OR ? < viewer_accounts.first_seen_at THEN ?
              ELSE viewer_accounts.first_seen_at
            END,
            last_seen_at = CASE
              WHEN viewer_accounts.last_seen_at IS NULL OR ? > viewer_accounts.last_seen_at THEN ?
              ELSE viewer_accounts.last_seen_at
            END
        WHERE platform = ? AND username = ?
      `).run(
        source.profile_id,
        platformUserId,
        source.platform_user_id,
        displayName,
        profilePictureUrl,
        source.profile_picture_url,
        source.first_seen_at,
        source.first_seen_at,
        source.last_seen_at,
        source.last_seen_at,
        platform,
        targetUsername
      )
      this.db.prepare('DELETE FROM viewer_accounts WHERE platform = ? AND username = ?').run(platform, sourceUsername)
      this.refreshViewerProfile(target.profile_id)
      return
    }

    if (source && !target) {
      this.db.prepare(`
        UPDATE viewer_accounts
        SET username = ?,
            platform_user_id = COALESCE(?, platform_user_id),
            display_name = ?,
            profile_picture_url = COALESCE(?, profile_picture_url),
            last_seen_at = CURRENT_TIMESTAMP
        WHERE platform = ? AND username = ?
      `).run(
        targetUsername,
        platformUserId,
        displayName,
        profilePictureUrl,
        platform,
        sourceUsername
      )
      this.refreshViewerProfile(source.profile_id)
      return
    }

    if (target) {
      this.db.prepare(`
        UPDATE viewer_accounts
        SET platform_user_id = COALESCE(?, platform_user_id),
            display_name = ?,
            profile_picture_url = COALESCE(?, profile_picture_url),
            last_seen_at = CURRENT_TIMESTAMP
        WHERE platform = ? AND username = ?
      `).run(platformUserId, displayName, profilePictureUrl, platform, targetUsername)
      this.refreshViewerProfile(target.profile_id)
    }
  }

  private getGlobalStatColumn(key: string): string | null {
    const map: Record<string, string> = {
      totalLikes: 'total_likes',
      totalGifts: 'total_gifts',
      totalGiftValueCents: 'total_gift_value_cents',
      totalSubscriptions: 'total_subscriptions',
      totalFollows: 'total_follows',
      totalShares: 'total_shares',
      totalRaids: 'total_raids',
      totalChats: 'total_chats',
      totalSongRequests: 'total_song_requests',
      totalCohostCalls: 'total_cohost_calls',
      peakViewerCount: 'peak_viewer_count'
    }
    if (key.startsWith('peakViewerCount:')) return 'peak_viewer_count'
    if (key.startsWith('peakReportedLikes:')) return 'total_likes'
    return map[key] || null
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

function normalizeUsername(username: string | undefined): string {
  return String(username || '').trim().replace(/^@+/, '').toLowerCase()
}

function safeDisplayName(value: string | undefined): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim()
  return normalized.slice(0, 120) || 'Viewer'
}

function normalizeOptionalUrl(value: string | null | undefined): string | null {
  const normalized = String(value || '').trim()
  return normalized || null
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = String(value || '').trim()
  return normalized || null
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
}

function badgeImageUrlsFromRow(row: UserStatRow): AudienceBadgeImageUrls {
  return {
    moderator: row.moderator_badge_image_url,
    tiktokFanClub: row.tiktok_fan_club_badge_image_url,
    tiktokSuperFan: row.tiktok_super_fan_badge_image_url,
    twitchSub: row.twitch_sub_badge_image_url,
    youtubeSuperFan: row.youtube_super_fan_badge_image_url
  }
}

function findBadgeImageFromRaw(badges: any[], matcher: (label: string) => boolean): string | null {
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

function isFanClubBadgeLabel(label: string): boolean {
  return (
    label.includes('fan club') ||
    label.includes('fanclub') ||
    label.includes('subscriber') ||
    label.includes('subscription') ||
    label.includes('member')
  )
}
