import BetterSqlite3 from 'better-sqlite3'
import crypto from 'crypto'
import { BaseRepository } from './BaseRepository'
import { UserIdentity, UserStat } from '../../../shared/stats'
import type { UserStatRow } from '../database'
import { Platform } from '../../platforms/types'
import { estimateTikTokCreatorGiftCents } from '../../../shared/tiktok-revenue'

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
      where.push('platform = ?')
      params.push(opts.platform)
    }
    if (opts.query && opts.query.trim().length > 0) {
      where.push('(LOWER(username) LIKE ? OR LOWER(display_name) LIKE ?)')
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
    const sortColumn = ALLOWED_SORT.has(opts.sortColumn) ? opts.sortColumn : 'total_likes'

    const where: string[] = []
    const params: unknown[] = []
    if (opts.platform) {
      where.push('platform = ?')
      params.push(opts.platform)
    }
    if (opts.query && opts.query.trim().length > 0) {
      where.push('(LOWER(username) LIKE ? OR LOWER(display_name) LIKE ?)')
      const like = `%${opts.query.trim().toLowerCase()}%`
      params.push(like, like)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const limit = Math.min(500, Math.max(1, Math.floor(opts.limit)))
    const offset = Math.max(0, Math.floor(opts.offset))

    const accounts = this.db.prepare(`
      SELECT * FROM user_stats
      ${whereSql}
      ORDER BY ${sortColumn} DESC
    `).all(...params) as UserStatRow[]

    const identitiesMap = new Map<string, UserIdentity>()

    for (const row of accounts) {
      const id = row.profile_id || `${row.username}:${row.platform}`
      let identity = identitiesMap.get(id)

      const account: UserStat = {
        username: row.username,
        platform: row.platform as Platform,
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
        isFanClubMember: row.is_fan_club_member === 1,
        profileId: row.profile_id,
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
          isFanClubMember: row.is_fan_club_member === 1,
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
        identity.isFanClubMember = identity.isFanClubMember || row.is_fan_club_member === 1
        
        if (!identity.allPlatforms.includes(row.platform as Platform)) {
          identity.allPlatforms.push(row.platform as Platform)
        }

        if (row.last_seen_at > identity.lastSeenAt) {
          identity.displayName = row.display_name
          identity.profilePictureUrl = row.profile_picture_url
          identity.primaryPlatform = row.platform as Platform
          identity.lastSeenAt = row.last_seen_at
        }

        identity.accounts.push(account)
      }
    }

    const sorted = Array.from(identitiesMap.values()).sort((a, b) => {
      const field = opts.sortColumn.replace(/_([a-z])/g, (_, l) => l.toUpperCase())
      const valA = (a as any)[field] || 0
      const valB = (b as any)[field] || 0
      if (valB !== valA) return valB - valA
      return b.lastSeenAt.localeCompare(a.lastSeenAt)
    })

    return sorted.slice(offset, offset + limit)
  }

  linkAccounts(p1: string, u1: string, p2: string, u2: string): void {
    const s1 = this.getUserStat(p1, u1)
    const s2 = this.getUserStat(p2, u2)
    if (!s1 || !s2) return

    const profileId = s1.profile_id || s2.profile_id || crypto.randomUUID()
    
    this.db.prepare('UPDATE user_stats SET profile_id = ? WHERE username = ? AND platform = ?').run(profileId, u1, p1)
    this.db.prepare('UPDATE user_stats SET profile_id = ? WHERE username = ? AND platform = ?').run(profileId, u2, p2)
    
    if (s1.profile_id && s2.profile_id && s1.profile_id !== s2.profile_id) {
       this.db.prepare('UPDATE user_stats SET profile_id = ? WHERE profile_id = ?').run(profileId, s2.profile_id)
    }
  }

  unlinkAccount(platform: string, username: string): void {
    this.db.prepare('UPDATE user_stats SET profile_id = NULL WHERE username = ? AND platform = ?').run(username, platform)
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
  incrementUserStats(data: {
    username: string
    platform: string
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
    isFanClubMember?: boolean
  }): void {
    const { username, platform, displayName, profilePictureUrl, isFanClubMember, ...increments } = data
    
    this.db.prepare(`
      INSERT INTO user_stats (
        username, platform, display_name, profile_picture_url, is_fan_club_member,
        total_likes, total_gifts, total_gift_value_cents, total_subscriptions,
        total_follows, total_shares, total_raids, total_chats, total_song_requests,
        first_seen_at, last_seen_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(username, platform) DO UPDATE SET
        display_name = COALESCE(excluded.display_name, user_stats.display_name),
        profile_picture_url = COALESCE(excluded.profile_picture_url, user_stats.profile_picture_url),
        is_fan_club_member = COALESCE(excluded.is_fan_club_member, user_stats.is_fan_club_member),
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
        last_seen_at = CURRENT_TIMESTAMP
    `).run(
      username, platform, displayName || null, profilePictureUrl || null, isFanClubMember ? 1 : 0,
      increments.likes || 0, increments.gifts || 0, increments.giftValueCents || 0,
      increments.subscriptions || 0,
      // Clamp the incoming delta too so a single oversized increment can't bypass the upsert clamp.
      Math.min(1, increments.follows || 0),
      increments.shares || 0,
      increments.raids || 0, increments.chats || 0, increments.songRequests || 0
    )
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

    const hourStart = new Date()
    hourStart.setMinutes(0, 0, 0)
    this.db.prepare(`
      INSERT INTO follower_snapshots (platform, captured_at, follower_count)
      VALUES (?, ?, ?)
      ON CONFLICT(platform, captured_at) DO UPDATE SET
        follower_count = excluded.follower_count
    `).run(platform, hourStart.toISOString(), safeCount)
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
      peakViewerCount: 'peak_viewer_count'
    }
    if (key.startsWith('peakViewerCount:')) return 'peak_viewer_count'
    if (key.startsWith('peakReportedLikes:')) return 'total_likes'
    return map[key] || null
  }
}
