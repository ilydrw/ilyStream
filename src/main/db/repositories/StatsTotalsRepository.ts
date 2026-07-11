import BetterSqlite3 from 'better-sqlite3'
import { BaseRepository } from './BaseRepository'

export class StatsTotalsRepository extends BaseRepository {
  constructor(db: BetterSqlite3.Database) {
    super(db)
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
      totalCohostCalls: 'total_cohost_calls',
      peakViewerCount: 'peak_viewer_count'
    }
    if (key.startsWith('peakViewerCount:')) return 'peak_viewer_count'
    if (key.startsWith('peakReportedLikes:')) return 'total_likes'
    return map[key] || null
  }
}
