import { EventEmitter } from 'events'
import type { Database } from '../db/database'
import type { AnyStreamEvent, Platform } from '../platforms/types'
import {
  getLoyaltyLevelForXp,
  getLoyaltyProgressForXp,
  type LoyaltyLevelUpEvent,
  type LoyaltyProgress,
  type LoyaltyXpAwardedEvent,
  type LoyaltyXpAward
} from '../../shared/loyalty'
import {
  economyScopeWhere,
  loadEconomyOwnerAggregates,
  resolveEconomyIdentity,
  type EconomyIdentity,
  type EconomyIdentityHint
} from '../economy/economy-identity'

const CHAT_XP_COOLDOWN_MS = 30_000
const CHAT_PLATFORMS = new Set<Platform>(['tiktok', 'twitch', 'youtube', 'kick'])
/**
 * Trailing-fire window for batching XP writes from like events. Likes burst
 * dozens/sec on TikTok; coalescing per-user XP into one read+write each
 * window keeps SQLite quiet without delaying level-up announcements more
 * than a beat.
 */
const LIKE_XP_FLUSH_INTERVAL_MS = 1000
const LIKE_XP_RETRY_INTERVAL_MS = 5000

interface PendingLikeXp {
  award: LoyaltyXpAward
  totalAmount: number
}

export class LoyaltyService extends EventEmitter {
  private chatXpCooldowns = new Map<string, number>()
  /** Aggregated pending XP per `${platform}:${username}` for like events. */
  private pendingLikeXp = new Map<string, PendingLikeXp>()
  private likeXpFlushTimer: NodeJS.Timeout | null = null
  private recentEventIds = new Map<string, number>()

  constructor(private readonly db: Database) {
    super()
  }

  recordEvent(event: AnyStreamEvent): LoyaltyLevelUpEvent | null {
    if ((event.raw as any)?.simulated || !('user' in event)) {
      return null
    }
    const award = this.getAwardForEvent(event)
    if (!award) return null
    if (this.isDuplicateEvent(event)) return null

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
    const suppliedUsername = award.username.trim()
    if (!suppliedUsername || award.amount <= 0 || !isChatPlatform(award.platform)) {
      return null
    }

    const displayName = award.displayName.trim() || suppliedUsername
    const amount = Math.max(0, Math.floor(award.amount))
    const identity = resolveEconomyIdentity(this.db, suppliedUsername, award.platform, {
      platformUserId: award.platformUserId,
      displayName
    })
    const username = identity.username
    const raw = this.db.getRawDb()
    const writeXp = raw.transaction(() => {
      const previousXp = this.getOwnerXp(raw, identity).xp
      const previousLevel = getLoyaltyLevelForXp(previousXp)
      const nextXp = previousXp + amount
      const nextProgress = getLoyaltyProgressForXp(nextXp)

      raw.prepare(`
        INSERT INTO economy_users (username, platform, points, xp, level, updated_at)
        VALUES (?, ?, 0, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(username, platform) DO UPDATE SET
          xp = COALESCE(economy_users.xp, 0) + excluded.xp,
          level = excluded.level,
          updated_at = CURRENT_TIMESTAMP
      `).run(username, award.platform, amount, nextProgress.level)
      this.syncOwnerLevel(raw, identity, nextProgress.level)
      return { previousLevel, nextXp, nextProgress }
    })
    const { previousLevel, nextXp, nextProgress } = writeXp()

    const xpAwarded: LoyaltyXpAwardedEvent = {
      username,
      platform: award.platform,
      displayName,
      xp: nextXp,
      previousLevel,
      awardedXp: award.amount,
      reason: award.reason,
      leveledUp: nextProgress.level > previousLevel,
      ...(award.platformUserId ? { platformUserId: award.platformUserId } : {}),
      ...nextProgress
    }
    this.emit('xp-awarded', xpAwarded)

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
      ...(award.platformUserId ? { platformUserId: award.platformUserId } : {}),
      ...nextProgress
    }
    this.emit('level-up', levelUp)
    return levelUp
  }

  getUserProgress(
    platform: Platform,
    username: string,
    identityHint: EconomyIdentityHint = {}
  ): LoyaltyProgress | null {
    const identity = resolveEconomyIdentity(this.db, username, platform, identityHint)
    const owner = this.getOwnerXp(this.db.getRawDb(), identity)
    if (owner.rowCount === 0) return null
    return toProgress(username, platform, username, owner.xp)
  }

  getTopUsers(limit = 25): LoyaltyProgress[] {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)))
    return loadEconomyOwnerAggregates(this.db.getRawDb())
      .filter((owner) => owner.xp > 0 && isChatPlatform(owner.platform))
      .sort((first, second) => second.xp - first.xp || second.points - first.points)
      .slice(0, safeLimit)
      .map((owner) => toProgress(owner.username, owner.platform, owner.displayName, owner.xp))
  }

  getUserRank(
    platform: Platform,
    username: string,
    limit = 100,
    identityHint: EconomyIdentityHint = {}
  ): number | null {
    const identity = resolveEconomyIdentity(this.db, username, platform, identityHint)
    const owners = loadEconomyOwnerAggregates(this.db.getRawDb())
      .filter((owner) => owner.xp > 0)
      .sort((first, second) => second.xp - first.xp || second.points - first.points)
      .slice(0, Math.max(1, Math.min(1000, Math.floor(limit))))
    const index = owners.findIndex((owner) => owner.ownerKey === identity.ownerKey)
    return index >= 0 ? index + 1 : null
  }

  private getAwardForEvent(event: AnyStreamEvent): LoyaltyXpAward | null {
    if (!('user' in event) || !isChatPlatform(event.platform)) {
      return null
    }

    const username = event.user.username
    const displayName = event.user.displayName || username
    const identity = {
      username,
      displayName,
      platform: event.platform,
      platformUserId: event.user.id
    }

    switch (event.type) {
      case 'chat': {
        const key = resolveEconomyIdentity(this.db, username, event.platform, {
          platformUserId: event.user.id,
          displayName
        }, { loadProfileMembers: false }).ownerKey
        const now = Date.now()
        const lastAwardedAt = this.chatXpCooldowns.get(key) || 0
        if (now - lastAwardedAt < CHAT_XP_COOLDOWN_MS) {
          return null
        }
        this.chatXpCooldowns.set(key, now)
        this.cleanupChatCooldowns(now)
        return { ...identity, amount: 4, reason: 'chat' }
      }
      case 'like':
        return { ...identity, amount: Math.max(1, Math.min(25, event.likeCount || 1)), reason: 'like' }
      case 'gift':
        if (event.isCombo) return null
        return { ...identity, amount: 50 + Math.min(250, Math.max(0, event.monetaryValue || 0)), reason: 'gift' }
      case 'subscription':
        return { ...identity, amount: 250, reason: 'subscription' }
      case 'follow':
        return { ...identity, amount: 35, reason: 'follow' }
      case 'share':
        return { ...identity, amount: 20, reason: 'share' }
      case 'raid':
        return { ...identity, amount: 100 + Math.min(300, event.viewerCount || 0), reason: 'raid' }
      case 'join':
        return { ...identity, amount: 5, reason: 'join' }
      default:
        return null
    }
  }

  private getOwnerXp(
    raw: ReturnType<Database['getRawDb']>,
    identity: EconomyIdentity
  ): { xp: number; rowCount: number } {
    const scope = economyScopeWhere(identity, 'economy_users')
    const row = raw.prepare(`
      SELECT COUNT(*) AS row_count,
             COALESCE(SUM(CASE WHEN economy_users.xp > 0 THEN economy_users.xp ELSE 0 END), 0) AS xp
      FROM economy_users
      WHERE ${scope.sql}
    `).get(...scope.params) as { row_count?: number; xp?: number } | undefined
    return {
      xp: Math.max(0, Math.floor(Number(row?.xp) || 0)),
      rowCount: Math.max(0, Math.floor(Number(row?.row_count ?? (row ? 1 : 0)) || 0))
    }
  }

  private syncOwnerLevel(
    raw: ReturnType<Database['getRawDb']>,
    identity: EconomyIdentity,
    level: number
  ): void {
    const scope = economyScopeWhere(identity, 'economy_users')
    raw.prepare(`
      UPDATE economy_users
      SET level = ?, updated_at = CURRENT_TIMESTAMP
      WHERE ${scope.sql}
    `).run(level, ...scope.params)
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
    const username = award.username.trim().replace(/^@+/, '').toLowerCase()
    if (!username || award.amount <= 0 || !isChatPlatform(award.platform)) return

    const key = `${award.platform}:${username}`
    const amount = Math.max(0, Math.floor(award.amount))
    const existing = this.pendingLikeXp.get(key)

    if (existing) {
      existing.totalAmount += amount
      // Keep the latest displayName/award metadata in case it changed.
      existing.award = { ...award, amount: existing.totalAmount }
    } else {
      this.pendingLikeXp.set(key, {
        award: { ...award, amount },
        totalAmount: amount
      })
    }

    this.scheduleLikeXpFlush()
  }

  private scheduleLikeXpFlush(delayMs = LIKE_XP_FLUSH_INTERVAL_MS): void {
    if (this.likeXpFlushTimer) return
    this.likeXpFlushTimer = setTimeout(() => {
      this.likeXpFlushTimer = null
      this.flushLikeXpNow()
    }, delayMs)
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
      previousLevel: number
      nextXp: number
      nextProgress: ReturnType<typeof getLoyaltyProgressForXp>
    }
    let rows: ComputedRow[] = []
    try {
      const raw = this.db.getRawDb()
      const stmt = raw.prepare(`
        INSERT INTO economy_users (username, platform, points, xp, level, updated_at)
        VALUES (?, ?, 0, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(username, platform) DO UPDATE SET
          xp = COALESCE(economy_users.xp, 0) + excluded.xp,
          level = excluded.level,
          updated_at = CURRENT_TIMESTAMP
      `)
      const tx = raw.transaction((items: PendingLikeXp[]): ComputedRow[] => {
        const computed: ComputedRow[] = []
        for (const pending of items) {
          const suppliedUsername = pending.award.username.trim()
          if (!suppliedUsername) continue
          const displayName = pending.award.displayName.trim() || suppliedUsername
          const identity = resolveEconomyIdentity(this.db, suppliedUsername, pending.award.platform, {
            platformUserId: pending.award.platformUserId,
            displayName
          })
          const username = identity.username
          // Resolve and read inside the transaction, in order. If two linked
          // accounts have likes in the same batch, the second sees the first's
          // write and cannot miss or duplicate their shared level transition.
          const previousXp = this.getOwnerXp(raw, identity).xp
          const previousLevel = getLoyaltyLevelForXp(previousXp)
          const nextXp = previousXp + pending.totalAmount
          const nextProgress = getLoyaltyProgressForXp(nextXp)
          stmt.run(username, identity.platform, pending.totalAmount, nextProgress.level)
          this.syncOwnerLevel(raw, identity, nextProgress.level)
          computed.push({ pending, username, displayName, previousLevel, nextXp, nextProgress })
        }
        return computed
      })
      rows = tx(entries)
    } catch (err) {
      console.error('[loyalty] like-xp flush failed; re-queueing:', err)
      // Re-queue so the next window retries.
      for (const pending of entries) {
        const username = pending.award.username.trim()
        if (!username) continue
        const key = `${pending.award.platform}:${username}`
        const queued = this.pendingLikeXp.get(key)
        if (queued) {
          queued.totalAmount += pending.totalAmount
          queued.award = { ...pending.award, amount: queued.totalAmount }
        } else {
          this.pendingLikeXp.set(key, pending)
        }
      }
      this.scheduleLikeXpFlush(LIKE_XP_RETRY_INTERVAL_MS)
      return
    }
    if (rows.length === 0) return

    // Emit one level-up per user that crossed a threshold.
    for (const r of rows) {
      if (r.nextProgress.level <= r.previousLevel) continue
      const levelUp: LoyaltyLevelUpEvent = {
        username: r.username,
        platform: r.pending.award.platform,
        displayName: r.displayName,
        xp: r.nextXp,
        previousLevel: r.previousLevel,
        awardedXp: r.pending.totalAmount,
        reason: r.pending.award.reason,
        ...(r.pending.award.platformUserId ? { platformUserId: r.pending.award.platformUserId } : {}),
        ...r.nextProgress
      }
      const xpAwarded: LoyaltyXpAwardedEvent = {
        ...levelUp,
        leveledUp: true
      }
      this.emit('xp-awarded', xpAwarded)
      this.emit('level-up', levelUp)
    }

    // Users whose batched likes did not cross a threshold still earn points
    // from the same XP activity. Emit after the write so level-scaled rewards
    // always use the newly persisted level.
    for (const r of rows) {
      if (r.nextProgress.level > r.previousLevel) continue
      const xpAwarded: LoyaltyXpAwardedEvent = {
        username: r.username,
        platform: r.pending.award.platform,
        displayName: r.displayName,
        xp: r.nextXp,
        previousLevel: r.previousLevel,
        awardedXp: r.pending.totalAmount,
        reason: r.pending.award.reason,
        leveledUp: false,
        ...(r.pending.award.platformUserId ? { platformUserId: r.pending.award.platformUserId } : {}),
        ...r.nextProgress
      }
      this.emit('xp-awarded', xpAwarded)
    }
  }

  private isDuplicateEvent(event: AnyStreamEvent): boolean {
    const eventId = String(event.id || '').trim()
    if (!eventId) return false
    const key = `${event.platform}:${event.type}:${eventId}`
    const now = Date.now()
    const previous = this.recentEventIds.get(key)
    this.recentEventIds.set(key, now)

    if (this.recentEventIds.size > 5000) {
      const cutoff = now - (10 * 60_000)
      for (const [candidate, timestamp] of this.recentEventIds) {
        if (timestamp < cutoff) this.recentEventIds.delete(candidate)
      }
    }
    return previous !== undefined && now - previous < 10 * 60_000
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
