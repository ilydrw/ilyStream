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

export class LoyaltyService extends EventEmitter {
  private chatXpCooldowns = new Map<string, number>()

  constructor(private readonly db: Database) {
    super()
  }

  recordEvent(event: AnyStreamEvent): LoyaltyLevelUpEvent | null {
    if ((event.raw as any)?.simulated || !('user' in event)) {
      return null
    }

    const award = this.getAwardForEvent(event)
    return award ? this.addXp(award) : null
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
