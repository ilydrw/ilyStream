import BetterSqlite3 from 'better-sqlite3'
import { BaseRepository } from './BaseRepository'

export class FollowerStatsRepository extends BaseRepository {
  constructor(db: BetterSqlite3.Database) {
    super(db)
  }

  /**
   * Store the platform's authoritative follower count (pulled from its public
   * API or live-room state). Also records an hourly snapshot so we can compute
   * growth deltas later.
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
   * Nudge a manually-tracked follower count by a delta. Clamped at zero and
   * snapshotted like a regular sync so growth deltas keep working.
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

    const dayMs = 24 * 60 * 60 * 1000
    for (const row of rows) {
      result[row.platform] = {
        followerCount: row.follower_count,
        delta24h: delta(row.platform, row.follower_count, dayMs),
        delta7d: delta(row.platform, row.follower_count, 7 * dayMs),
        delta30d: delta(row.platform, row.follower_count, 30 * dayMs),
        lastSyncedAt: row.last_synced_at
      }
    }

    return result
  }

  getFollowerSnapshots(platform: string, sinceIso: string, limit = 720): Array<{ capturedAt: string; followerCount: number }> {
    const rows = this.db.prepare(`
      SELECT captured_at, follower_count FROM follower_snapshots
      WHERE platform = ? AND captured_at >= ?
      ORDER BY captured_at ASC LIMIT ?
    `).all(platform, sinceIso, Math.max(1, Math.min(5000, limit))) as Array<{ captured_at: string; follower_count: number }>
    return rows.map((row) => ({ capturedAt: row.captured_at, followerCount: row.follower_count }))
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
}
