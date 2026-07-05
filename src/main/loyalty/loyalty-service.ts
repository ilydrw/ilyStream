import { EventEmitter } from 'events'
import type { Database } from '../db/database'
import type { AnyStreamEvent, Platform } from '../platforms/types'
import {
  getLoyaltyLevelForXp,
  getLoyaltyProgressForXp,
  type LoyaltyLevelUpEvent,
  type LoyaltyProgress,
  type LoyaltyXpAward
} from '../../shared/loyalty'

const CHAT_XP_COOLDOWN_MS = 30_000
const CHAT_PLATFORMS = new Set<Platform>(['tiktok', 'twitch', 'youtube', 'kick'])
/**
 * Trailing-fire window for batching XP writes from like events. Likes burst
 * dozens/sec on TikTok; coalescing per-user XP into one read+write each
 * window keeps SQLite quiet without delaying level-up announcements more
 * than a beat.
 */
const LIKE_XP_FLUSH_INTERVAL_MS = 1000

interface PendingLikeXp {
  award: LoyaltyXpAward
  totalAmount: number
  previousXp: number
  previousLevel: number
}

export class LoyaltyService extends EventEmitter {
  private chatXpCooldowns = new Map<string, number>()
  /** Aggregated pending XP per `${platform}:${username}` for like events. */
  private pendingLikeXp = new Map<string, PendingLikeXp>()
  private likeXpFlushTimer: NodeJS.Timeout | null = null

  constructor(private readonly db: Database) {
    super()
  }

  recordEvent(event: AnyStreamEvent): LoyaltyLevelUpEvent | null {
    if ((event.raw as any)?.simulated || !('user' in event)) {
      return null
    }

    const award = this.getAwardForEvent(event)
    if (!award) return null

    // Likes are bursty — coalesce per-user XP into one DB read+write per
    // window. Level-up emits still happen for users that cross a threshold,
    // just up to ~1s late. Every other event type stays synchronous so
    // gift/sub/follow level-ups fire immediately.
    if (event.type === 'like') {
      this.queueLikeXp(award)
      return null
    }

    return this.addXp(award)
  }

  recordSongRequest(input: {
    username: string
    platform: string
    displayName?: string
  }): LoyaltyLevelUpEvent | null {
    if (!isChatPlatform(input.platform) || input.username === 'local_alert_test') {
      return null
    }

    return this.addXp({
      username: input.username,
      platform: input.platform,
      displayName: input.displayName || input.username,
      amount: 15,
      reason: 'song-request'
    })
  }

  addXp(award: LoyaltyXpAward): LoyaltyLevelUpEvent | null {
    const username = award.username.trim()
    if (!username || award.amount <= 0 || !isChatPlatform(award.platform)) {
      return null
    }

    const displayName = award.displayName.trim() || username
    const previous = this.getUserProgress(award.platform, username)
    const previousXp = previous?.xp ?? 0
    const previousLevel = previous?.level ?? getLoyaltyLevelForXp(previousXp)
    const nextXp = previousXp + Math.max(0, Math.floor(award.amount))
    const nextProgress = getLoyaltyProgressForXp(nextXp)

    this.db.getRawDb().prepare(`
      INSERT INTO economy_users (username, platform, points, xp, level, updated_at)
      VALUES (?, ?, 0, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(username, platform) DO UPDATE SET
        xp = excluded.xp,
        level = excluded.level,
        updated_at = CURRENT_TIMESTAMP
    `).run(username, award.platform, nextXp, nextProgress.level)

    if (nextProgress.level <= previousLevel) {
      return null
    }

    const levelUp: LoyaltyLevelUpEvent = {
      username,
      platform: award.platform,
      displayName,
      xp: nextXp,
      previousLevel,
      awardedXp: award.amount,
      reason: award.reason,
      ...nextProgress
    }
    this.emit('level-up', levelUp)
    return levelUp
  }

  getUserProgress(platform: Platform, username: string): LoyaltyProgress | null {
    const row = this.db.getRawDb().prepare(`
      SELECT username, platform, COALESCE(points, 0) AS points, COALESCE(xp, 0) AS xp, COALESCE(level, 1) AS level
      FROM economy_users
      WHERE platform = ? AND username = ?
    `).get(platform, username) as { username: string; platform: Platform; xp: number; level: number } | undefined

    if (!row) return null
    return toProgress(row.username, row.platform, row.username, row.xp)
  }

  getTopUsers(limit = 25): LoyaltyProgress[] {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)))
    const rows = this.db.getRawDb().prepare(`
      SELECT username, platform, COALESCE(xp, 0) AS xp
      FROM economy_users
      WHERE COALESCE(xp, 0) > 0
      ORDER BY xp DESC
      LIMIT ?
    `).all(safeLimit) as Array<{ username: string; platform: Platform; xp: number }>

    return rows
      .filter((row) => isChatPlatform(row.platform))
      .map((row) => toProgress(row.username, row.platform, row.username, row.xp))
  }

  private getAwardForEvent(event: AnyStreamEvent): LoyaltyXpAward | null {
    if (!('user' in event) || !isChatPlatform(event.platform)) {
      return null
    }

    const username = event.user.username
    const displayName = event.user.displayName || username

    switch (event.type) {
      case 'chat': {
        const key = `${event.platform}:${username}`
        const now = Date.now()
        const lastAwardedAt = this.chatXpCooldowns.get(key) || 0
        if (now - lastAwardedAt < CHAT_XP_COOLDOWN_MS) {
          return null
        }
        this.chatXpCooldowns.set(key, now)
        this.cleanupChatCooldowns(now)
        return { username, displayName, platform: event.platform, amount: 4, reason: 'chat' }
      }
      case 'like':
        return { username, displayName, platform: event.platform, amount: Math.max(1, Math.min(25, event.likeCount || 1)), reason: 'like' }
      case 'gift':
        if (event.isCombo) return null
        return { username, displayName, platform: event.platform, amount: 50 + Math.min(250, Math.max(0, event.monetaryValue || 0)), reason: 'gift' }
      case 'subscription':
        return { username, displayName, platform: event.platform, amount: 250, reason: 'subscription' }
      case 'follow':
        return { username, displayName, platform: event.platform, amount: 35, reason: 'follow' }
      case 'share':
        return { username, displayName, platform: event.platform, amount: 20, reason: 'share' }
      case 'raid':
        return { username, displayName, platform: event.platform, amount: 100 + Math.min(300, event.viewerCount || 0), reason: 'raid' }
      case 'join':
        return { username, displayName, platform: event.platform, amount: 5, reason: 'join' }
      default:
        return null
    }
  }

  private cleanupChatCooldowns(now: number): void {
    if (this.chatXpCooldowns.size < 2000) return
    for (const [key, timestamp] of this.chatXpCooldowns) {
      if (now - timestamp > CHAT_XP_COOLDOWN_MS * 4) {
        this.chatXpCooldowns.delete(key)
      }
    }
  }

  private queueLikeXp(award: LoyaltyXpAward): void {
    const username = award.username.trim()
    if (!username || award.amount <= 0 || !isChatPlatform(award.platform)) return

    const key = `${award.platform}:${username}`
    const amount = Math.max(0, Math.floor(award.amount))
    const existing = this.pendingLikeXp.get(key)

    if (existing) {
      existing.totalAmount += amount
      // Keep the latest displayName/award metadata in case it changed.
      existing.award = { ...award, amount: existing.totalAmount }
    } else {
      // Snapshot the current XP/level once per window. Subsequent likes in
      // the same window add to `totalAmount` without re-reading the DB.
      const previous = this.getUserProgress(award.platform, username)
      const previousXp = previous?.xp ?? 0
      const previousLevel = previous?.level ?? getLoyaltyLevelForXp(previousXp)
      this.pendingLikeXp.set(key, {
        award: { ...award, amount },
        totalAmount: amount,
        previousXp,
        previousLevel
      })
    }

    if (!this.likeXpFlushTimer) {
      this.likeXpFlushTimer = setTimeout(() => {
        this.likeXpFlushTimer = null
        this.flushLikeXpNow()
      }, LIKE_XP_FLUSH_INTERVAL_MS)
    }
  }

  /** Drain `pendingLikeXp` into one transactional batch of UPSERTs. */
  private flushLikeXpNow(): void {
    if (this.pendingLikeXp.size === 0) return
    const entries = Array.from(this.pendingLikeXp.values())
    this.pendingLikeXp.clear()

    interface ComputedRow {
      pending: PendingLikeXp
      username: string
      displayName: string
      nextXp: number
      nextProgress: ReturnType<typeof getLoyaltyProgressForXp>
    }
    const rows: ComputedRow[] = []
    for (const pending of entries) {
      const username = pending.award.username.trim()
      if (!username) continue
      const displayName = pending.award.displayName.trim() || username
      const nextXp = pending.previousXp + pending.totalAmount
      const nextProgress = getLoyaltyProgressForXp(nextXp)
      rows.push({ pending, username, displayName, nextXp, nextProgress })
    }
    if (rows.length === 0) return

    try {
      const raw = this.db.getRawDb()
      const stmt = raw.prepare(`
        INSERT INTO economy_users (username, platform, points, xp, level, updated_at)
        VALUES (?, ?, 0, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(username, platform) DO UPDATE SET
          xp = excluded.xp,
          level = excluded.level,
          updated_at = CURRENT_TIMESTAMP
      `)
      const tx = raw.transaction((items: ComputedRow[]) => {
        for (const r of items) {
          stmt.run(r.username, r.pending.award.platform, r.nextXp, r.nextProgress.level)
        }
      })
      tx(rows)
    } catch (err) {
      console.error('[loyalty] like-xp flush failed; re-queueing:', err)
      // Re-queue so the next window retries.
      for (const r of rows) {
        const key = `${r.pending.award.platform}:${r.username}`
        this.pendingLikeXp.set(key, r.pending)
      }
      return
    }

    // Emit one level-up per user that crossed a threshold.
    for (const r of rows) {
      if (r.nextProgress.level <= r.pending.previousLevel) continue
      const levelUp: LoyaltyLevelUpEvent = {
        username: r.username,
        platform: r.pending.award.platform,
        displayName: r.displayName,
        xp: r.nextXp,
        previousLevel: r.pending.previousLevel,
        awardedXp: r.pending.totalAmount,
        reason: r.pending.award.reason,
        ...r.nextProgress
      }
      this.emit('level-up', levelUp)
    }
  }
}

function toProgress(username: string, platform: Platform, displayName: string, xp: number): LoyaltyProgress {
  return {
    username,
    platform,
    displayName,
    xp,
    ...getLoyaltyProgressForXp(xp)
  }
}

function isChatPlatform(value: unknown): value is Platform {
  return typeof value === 'string' && CHAT_PLATFORMS.has(value as Platform)
}
