import { EventEmitter } from 'events'
import { randomInt, randomUUID } from 'crypto'
import type { Database } from '../db/database'
import {
  calculateLoyaltyPointReward,
  DEFAULT_ECONOMY_CONFIG,
  RESERVED_ECONOMY_COMMANDS,
  resolveEconomyConfig,
  type EconomyAccount,
  type EconomyConfig,
  type EconomyDailyClaimResult,
  type EconomyDashboard,
  type EconomyLightingAction,
  type EconomyRedemption,
  type EconomyRedemptionAction,
  type EconomyTransaction,
  type EconomyTransactionKind,
  type EconomyWagerResult,
  type LoyaltyPointReward
} from '../../shared/economy'
import { getLoyaltyLevelForXp } from '../../shared/loyalty'
import { isStreamPlatform, type Platform } from '../platforms/types'
import {
  economyScopeWhere,
  loadEconomyOwnerAggregates,
  resolveEconomyIdentity,
  sameEconomyOwner,
  type EconomyIdentity,
  type EconomyIdentityHint,
  type EconomyMemberRow,
  type EconomyOwnerAggregate
} from './economy-identity'

export interface EconomyUser {
  username: string
  platform: string
  points: number
  totalLikes: number
}

/**
 * Trailing-fire window for the top-10 leaderboard emit. TikTok bursts dozens
 * of likes/sec; without this every like re-serialises the leaderboard JSON
 * and re-broadcasts to two SSE channels.
 */
const LEADERBOARD_EMIT_INTERVAL_MS = 1500
/**
 * Trailing-fire window for the per-user `total_likes` UPSERT into
 * `economy_users`. Coalesces a burst of likes from the same user into one
 * transactional batch instead of N synchronous UPSERTs.
 */
const LIKE_DB_FLUSH_INTERVAL_MS = 1000
const LIKE_DB_RETRY_INTERVAL_MS = 5000
const ECONOMY_CONFIG_STATE_KEY = 'economy_config'
const ECONOMY_SEEDED_STATE_KEY = 'economy_redemptions_seeded_v1'

const DEFAULT_REDEMPTIONS: EconomyRedemption[] = [
  {
    id: 'neon-flash',
    name: 'Neon Flash',
    command: 'flash',
    description: 'Flash every reachable studio light in electric cyan.',
    cost: 250,
    minLevel: 2,
    cooldownSeconds: 30,
    enabled: true,
    action: {
      type: 'lighting',
      effect: 'flash',
      color: '#19C8FF',
      durationMs: 1200,
      targetDeviceIds: [],
      targetPlatforms: []
    }
  },
  {
    id: 'party-pulse',
    name: 'Party Pulse',
    command: 'party',
    description: 'Pulse the studio lights in ilyStream purple.',
    cost: 600,
    minLevel: 4,
    cooldownSeconds: 90,
    enabled: true,
    action: {
      type: 'lighting',
      effect: 'pulse',
      color: '#D035F1',
      durationMs: 4000,
      targetDeviceIds: [],
      targetPlatforms: []
    }
  }
]

export interface EconomyRedemptionPurchaseResult {
  ok: boolean
  error?: 'disabled' | 'not-found' | 'level-required' | 'cooldown' | 'insufficient-points'
  balance: number
  requiredLevel?: number
  retryAfterSeconds?: number
  purchaseId?: string
  redemption?: EconomyRedemption
}

export interface EconomyTransferResult {
  ok: boolean
  error?: 'invalid-amount' | 'same-user' | 'insufficient-points'
  balance: number
  recipientBalance?: number
}

interface EconomyDebitAllocation {
  username: string
  platform: Platform
  amount: number
  platformUserId?: string
}

export class EconomyService extends EventEmitter {
  private likeScores = new Map<string, number>() // username:score
  private likeLabels = new Map<string, string>()
  private subathonEndTime: number = 0
  private decayInterval: NodeJS.Timeout | null = null
  private pointsDropActive: boolean = false
  private pointsDropWinner: string | null = null
  /** Pending per-user like deltas waiting to be UPSERTed in one batch. */
  private pendingLikeDeltas = new Map<string, number>()
  private likeFlushTimer: NodeJS.Timeout | null = null
  private leaderboardTimer: NodeJS.Timeout | null = null
  private config: EconomyConfig = DEFAULT_ECONOMY_CONFIG

  constructor(
    private db: Database,
    private readonly secureRandomInt: (maxExclusive: number) => number = (maxExclusive) => randomInt(maxExclusive)
  ) {
    super()
    this.loadState()
    this.seedDefaultRedemptions()
    this.startDecayLoop()
  }

  private loadState() {
    try {
      const row = this.db.getRawDb().prepare('SELECT value_json FROM stream_state WHERE key = ?').get('subathon_end') as any
      if (row) {
        this.subathonEndTime = JSON.parse(row.value_json).timestamp
      }
      const configRow = this.db.getRawDb().prepare('SELECT value_json FROM stream_state WHERE key = ?').get(ECONOMY_CONFIG_STATE_KEY) as { value_json?: string } | undefined
      if (configRow?.value_json) {
        this.config = resolveEconomyConfig(JSON.parse(configRow.value_json))
      }
    } catch (err) {
      console.warn('[economy] Could not load stream_state; continuing with economy defaults.', err)
    }
  }

  private saveState() {
    try {
      this.db.getRawDb().prepare('INSERT OR REPLACE INTO stream_state (key, value_json) VALUES (?, ?)')
        .run('subathon_end', JSON.stringify({ timestamp: this.subathonEndTime }))
    } catch (err) {
      console.warn('[economy] Could not save stream_state.', err)
    }
  }

  // --- Likeathon (Decay Loop) ---
  private startDecayLoop() {
    this.decayInterval = setInterval(() => {
      if (this.likeScores.size === 0) return

      for (const [username, score] of this.likeScores.entries()) {
        const newScore = Math.floor(score * 0.95)
        if (newScore <= 0) {
          this.likeScores.delete(username)
          this.likeLabels.delete(username)
        } else {
          this.likeScores.set(username, newScore)
        }
      }
      // Decay runs every 10s and is rare relative to like bursts — emit
      // immediately so the leaderboard isn't holding a stale post-decay state.
      this.emitLeaderboardNow()
    }, 10000)
  }

  public registerLike(username: string, count: number = 1, displayName?: string) {
    const key = this.normalizeUsername(username || displayName || 'anonymous')
    const label = String(displayName || username || key).trim() || key
    const amount = Math.max(1, Math.floor(Number(count)) || 1)
    const current = this.likeScores.get(key) || 0
    this.likeScores.set(key, current + amount)
    this.likeLabels.set(key, label)

    // Coalesce DB writes per user. A single `total_likes += N` UPSERT will
    // run on the flush instead of one UPSERT per like.
    const pending = this.pendingLikeDeltas.get(key) || 0
    this.pendingLikeDeltas.set(key, pending + amount)
    this.scheduleLikeFlush()

    // Coalesce leaderboard emits. Under burst we fire at most every
    // ~1.5s instead of per-like.
    this.scheduleLeaderboardEmit()
  }

  private scheduleLikeFlush(delayMs = LIKE_DB_FLUSH_INTERVAL_MS) {
    if (this.likeFlushTimer) return
    this.likeFlushTimer = setTimeout(() => {
      this.likeFlushTimer = null
      this.flushLikeDeltasNow()
    }, delayMs)
  }

  /** Drain `pendingLikeDeltas` into a single transactional batch UPSERT. */
  private flushLikeDeltasNow() {
    if (this.pendingLikeDeltas.size === 0) return
    const entries = Array.from(this.pendingLikeDeltas.entries())
    this.pendingLikeDeltas.clear()

    try {
      const raw = this.db.getRawDb()
      const stmt = raw.prepare(`
        INSERT INTO economy_users (username, platform, total_likes)
        VALUES (?, 'tiktok', ?)
        ON CONFLICT(username, platform) DO UPDATE SET
          total_likes = total_likes + EXCLUDED.total_likes,
          updated_at = CURRENT_TIMESTAMP
      `)
      const tx = raw.transaction((rows: Array<[string, number]>) => {
        for (const [u, n] of rows) stmt.run(u, n)
      })
      tx(entries)
    } catch (err) {
      console.error('[economy] like-delta flush failed; re-queueing:', err)
      // Put the deltas back so we don't lose them on next attempt.
      for (const [u, n] of entries) {
        this.pendingLikeDeltas.set(u, (this.pendingLikeDeltas.get(u) || 0) + n)
      }
      this.scheduleLikeFlush(LIKE_DB_RETRY_INTERVAL_MS)
    }
  }

  private scheduleLeaderboardEmit() {
    if (this.leaderboardTimer) return
    this.leaderboardTimer = setTimeout(() => {
      this.leaderboardTimer = null
      this.emitLeaderboardNow()
    }, LEADERBOARD_EMIT_INTERVAL_MS)
  }

  private emitLeaderboardNow() {
    this.emit('leaderboard-update', this.getLeaderboardSnapshot())
  }

  public getLeaderboardSnapshot(): Array<{ username: string; score: number }> {
    return Array.from(this.likeScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([username, score]) => ({ username: this.likeLabels.get(username) || username, score }))
  }

  public resetLikeathon(): void {
    this.likeScores.clear()
    this.likeLabels.clear()
    if (this.leaderboardTimer) {
      clearTimeout(this.leaderboardTimer)
      this.leaderboardTimer = null
    }
    this.emitLeaderboardNow()
  }

  // --- Subathon Timer ---
  public addTimeToSubathon(seconds: number) {
    if (this.subathonEndTime === 0 || this.subathonEndTime < Date.now()) {
      this.subathonEndTime = Date.now() + (seconds * 1000)
    } else {
      this.subathonEndTime += (seconds * 1000)
    }
    this.saveState()
    this.emit('timer-update', this.subathonEndTime)
  }

  public getSubathonRemaining(): number {
    return Math.max(0, this.subathonEndTime - Date.now())
  }

  // --- Points Economy ---
  public getConfig(): EconomyConfig {
    return { ...this.config }
  }

  public updateConfig(input: unknown): EconomyConfig {
    this.config = resolveEconomyConfig({ ...this.config, ...(input as object || {}) })
    this.db.getRawDb().prepare('INSERT OR REPLACE INTO stream_state (key, value_json) VALUES (?, ?)')
      .run(ECONOMY_CONFIG_STATE_KEY, JSON.stringify(this.config))
    this.emit('config-updated', this.getConfig())
    return this.getConfig()
  }

  public async addPoints(
    username: string,
    platform: string,
    amount: number,
    identityHint: EconomyIdentityHint = {}
  ): Promise<number> {
    return this.creditPoints(username, platform, amount, 'grant', 'Points added', undefined, {}, identityHint)
  }

  public async getPoints(
    username: string,
    platform: string,
    identityHint: EconomyIdentityHint = {}
  ): Promise<number> {
    return this.getBalance(username, platform, identityHint)
  }

  public async spendPoints(
    username: string,
    platform: string,
    amount: number,
    identityHint: EconomyIdentityHint = {}
  ): Promise<boolean> {
    const safeAmount = positiveInteger(amount)
    if (!safeAmount) return false
    return this.debitPoints(username, platform, safeAmount, 'spend', 'Points spent', undefined, {}, identityHint).ok
  }

  public getOwnerKey(
    username: string,
    platform: string,
    identityHint: EconomyIdentityHint = {}
  ): string {
    return resolveEconomyIdentity(
      this.db,
      username,
      platform,
      identityHint,
      { loadProfileMembers: false }
    ).ownerKey
  }

  public awardLoyaltyPoints(input: {
    username: string
    platform: string
    level: number
    awardedXp: number
    reason: string
    leveledUp: boolean
    platformUserId?: string | null
    displayName?: string | null
  }): LoyaltyPointReward & { balance: number } {
    const reward = calculateLoyaltyPointReward(
      input.awardedXp,
      input.level,
      input.leveledUp,
      this.config
    )
    const identityHint = { platformUserId: input.platformUserId, displayName: input.displayName }
    if (!this.config.enabled || reward.total <= 0) {
      return { ...reward, balance: this.getBalance(input.username, input.platform, identityHint) }
    }

    const balance = this.creditPoints(
      input.username,
      input.platform,
      reward.total,
      'earn',
      `Loyalty: ${input.reason}`,
      undefined,
      {
        xp: input.awardedXp,
        level: input.level,
        multiplier: reward.multiplier,
        activityPoints: reward.activityPoints,
        levelUpBonus: reward.levelUpBonus
      },
      identityHint
    )
    return { ...reward, balance }
  }

  public grantPoints(input: {
    username: string
    platform: string
    amount: number
    reason?: string
    platformUserId?: string | null
    displayName?: string | null
  }): number {
    const identityHint = { platformUserId: input.platformUserId, displayName: input.displayName }
    const amount = integer(input.amount)
    if (amount === 0) return this.getBalance(input.username, input.platform, identityHint)
    if (amount > 0) {
      return this.creditPoints(input.username, input.platform, amount, 'grant', input.reason || 'Host grant', undefined, {}, identityHint)
    }
    const currentBalance = this.getBalance(input.username, input.platform, identityHint)
    const deduction = Math.min(currentBalance, Math.abs(amount))
    if (deduction <= 0) return currentBalance
    const result = this.debitPoints(
      input.username,
      input.platform,
      deduction,
      'adjustment',
      input.reason || 'Host adjustment',
      undefined,
      {},
      identityHint
    )
    return result.balance
  }

  public claimDaily(
    username: string,
    platform: string,
    level: number,
    now = new Date(),
    identityHint: EconomyIdentityHint = {}
  ): EconomyDailyClaimResult {
    const identity = this.normalizeIdentity(username, platform, identityHint)
    const today = toUtcDateKey(now)
    const yesterday = toUtcDateKey(new Date(now.getTime() - 86_400_000))
    const raw = this.db.getRawDb()
    const tx = raw.transaction((): EconomyDailyClaimResult => {
      const claimScope = economyScopeWhere(identity, 'economy_daily_claims')
      const existing = raw.prepare(`
        SELECT claim_date, streak, reward
        FROM economy_daily_claims
        WHERE ${claimScope.sql}
        ORDER BY claim_date DESC
        LIMIT 1
      `).get(...claimScope.params) as { claim_date: string; streak: number; reward: number } | undefined

      if (existing?.claim_date === today) {
        return {
          ok: false,
          alreadyClaimed: true,
          reward: existing.reward,
          streak: existing.streak,
          balance: this.getBalanceForIdentity(raw, identity)
        }
      }

      const streak = existing?.claim_date === yesterday ? Math.min(365, existing.streak + 1) : 1
      const safeLevel = Math.max(1, integer(level))
      const streakBonus = Math.min(7, streak) * 5
      const reward = this.config.dailyBase + (safeLevel * this.config.dailyPerLevel) + streakBonus
      const balance = this.creditPointsWithinTransaction(
        raw,
        identity,
        reward,
        'daily',
        `Daily streak day ${streak}`,
        `daily:${identity.platform}:${identity.username}:${today}`,
        { level: safeLevel, streak }
      )
      raw.prepare(`
        INSERT INTO economy_daily_claims (username, platform, claim_date, streak, reward)
        VALUES (?, ?, ?, ?, ?)
      `).run(identity.username, identity.platform, today, streak, reward)

      return { ok: true, alreadyClaimed: false, reward, streak, balance }
    })
    const result = tx()
    if (result.ok) this.emitBalanceChanged(identity.username, identity.platform, result.balance)
    return result
  }

  public playCoinFlip(
    username: string,
    platform: string,
    bet: number,
    choice: 'heads' | 'tails',
    identityHint: EconomyIdentityHint = {}
  ): EconomyWagerResult {
    const outcome = this.secureRandomInt(2) === 0 ? 'heads' : 'tails'
    return this.settleWager(username, platform, 'coinflip', bet, outcome === choice ? 2 : 0, outcome, identityHint)
  }

  public playSlots(
    username: string,
    platform: string,
    bet: number,
    identityHint: EconomyIdentityHint = {}
  ): EconomyWagerResult {
    const roll = this.secureRandomInt(1000)
    if (roll < 10) return this.settleWager(username, platform, 'slots', bet, 20, '💎 💎 💎', identityHint)
    if (roll < 60) return this.settleWager(username, platform, 'slots', bet, 4, '⭐ ⭐ ⭐', identityHint)
    if (roll < 180) return this.settleWager(username, platform, 'slots', bet, 2, '🔔 🔔 🔔', identityHint)
    if (roll < 420) return this.settleWager(username, platform, 'slots', bet, 1.25, '🍒 🍒 🍒', identityHint)
    const symbols = ['🍋', '🍊', '🍇', '7️⃣']
    return this.settleWager(
      username,
      platform,
      'slots',
      bet,
      0,
      `${symbols[this.secureRandomInt(symbols.length)]} ${symbols[this.secureRandomInt(symbols.length)]} ${symbols[this.secureRandomInt(symbols.length)]}`,
      identityHint
    )
  }

  public playRoulette(
    username: string,
    platform: string,
    bet: number,
    choice: 'red' | 'black' | 'green',
    identityHint: EconomyIdentityHint = {}
  ): EconomyWagerResult {
    const number = this.secureRandomInt(37)
    const color = number === 0 ? 'green' : ROULETTE_RED_NUMBERS.has(number) ? 'red' : 'black'
    const multiplier = color === choice ? (choice === 'green' ? 36 : 2) : 0
    return this.settleWager(username, platform, 'roulette', bet, multiplier, `${number} ${color}`, identityHint)
  }

  public transferPoints(
    username: string,
    platform: string,
    recipientUsername: string,
    amount: number,
    senderIdentityHint: EconomyIdentityHint = {}
  ): EconomyTransferResult {
    const sender = this.normalizeIdentity(username, platform, senderIdentityHint)
    const recipient = this.normalizeIdentity(recipientUsername, platform)
    const safeAmount = positiveInteger(amount)
    if (!safeAmount) {
      return {
        ok: false,
        error: 'invalid-amount',
        balance: this.getBalanceForIdentity(this.db.getRawDb(), sender)
      }
    }
    if (sameEconomyOwner(sender, recipient)) {
      return {
        ok: false,
        error: 'same-user',
        balance: this.getBalanceForIdentity(this.db.getRawDb(), sender)
      }
    }

    const raw = this.db.getRawDb()
    const transferId = `transfer:${randomUUID()}`
    const tx = raw.transaction((): EconomyTransferResult => {
      const debit = this.debitPointsWithinTransaction(raw, sender, safeAmount)
      if (!debit.ok) {
        return { ok: false, error: 'insufficient-points', balance: debit.balance }
      }

      const senderBalance = debit.balance
      this.insertTransaction(raw, sender.username, sender.platform, -safeAmount, senderBalance, 'transfer', `Transfer to ${recipient.username}`, transferId, { recipient: recipient.username })
      const recipientBalance = this.creditPointsWithinTransaction(
        raw,
        recipient,
        safeAmount,
        'transfer',
        `Transfer from ${sender.username}`,
        transferId,
        { sender: sender.username }
      )
      return { ok: true, balance: senderBalance, recipientBalance }
    })
    const result = tx()
    if (result.ok) {
      this.emitBalanceChanged(sender.username, sender.platform, result.balance)
      this.emitBalanceChanged(recipient.username, recipient.platform, result.recipientBalance || 0)
    }
    return result
  }

  public getRedemptions(includeDisabled = true): EconomyRedemption[] {
    const rows = this.db.getRawDb().prepare(`
      SELECT id, name, command, description, cost, min_level, cooldown_seconds,
             action_json, enabled, created_at, updated_at
      FROM economy_redemptions
      ${includeDisabled ? '' : 'WHERE enabled = 1'}
      ORDER BY cost ASC, name COLLATE NOCASE ASC
    `).all() as any[]
    return rows.flatMap((row) => {
      try {
        return [this.mapRedemption(row)]
      } catch (err) {
        console.warn(`[economy] Skipping invalid redemption ${row?.id || 'unknown'}:`, err)
        return []
      }
    })
  }

  public getRedemptionByCommand(command: string): EconomyRedemption | null {
    const normalized = normalizeCommand(command)
    if (!normalized) return null
    const row = this.db.getRawDb().prepare(`
      SELECT id, name, command, description, cost, min_level, cooldown_seconds,
             action_json, enabled, created_at, updated_at
      FROM economy_redemptions
      WHERE command = ? COLLATE NOCASE
    `).get(normalized) as any
    if (!row) return null
    try {
      return this.mapRedemption(row)
    } catch {
      return null
    }
  }

  public saveRedemption(input: Partial<EconomyRedemption>): EconomyRedemption {
    const name = String(input.name || '').trim().replace(/\s+/g, ' ').slice(0, 60)
    const command = normalizeCommand(input.command)
    if (!name) throw new Error('Redemption name is required.')
    if (!command || !/^[a-z0-9][a-z0-9_-]{1,23}$/.test(command)) {
      throw new Error('Command must be 2-24 letters, numbers, dashes, or underscores.')
    }
    if (RESERVED_ECONOMY_COMMANDS.has(command)) {
      throw new Error(`!${command} is reserved by the economy.`)
    }

    const id = normalizeRedemptionId(input.id) || `${command}-${randomUUID().slice(0, 8)}`
    const action = normalizeRedemptionAction(input.action)
    const redemption: EconomyRedemption = {
      id,
      name,
      command,
      description: String(input.description || '').trim().replace(/\s+/g, ' ').slice(0, 180),
      cost: Math.max(1, Math.min(10_000_000, positiveInteger(input.cost) || 1)),
      minLevel: Math.max(1, Math.min(10_000, positiveInteger(input.minLevel) || 1)),
      cooldownSeconds: Math.max(0, Math.min(86_400, integer(input.cooldownSeconds))),
      enabled: input.enabled !== false,
      action
    }

    try {
      this.db.getRawDb().prepare(`
        INSERT INTO economy_redemptions (
          id, name, command, description, cost, min_level, cooldown_seconds,
          action_json, enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          command = excluded.command,
          description = excluded.description,
          cost = excluded.cost,
          min_level = excluded.min_level,
          cooldown_seconds = excluded.cooldown_seconds,
          action_json = excluded.action_json,
          enabled = excluded.enabled,
          updated_at = CURRENT_TIMESTAMP
      `).run(
        redemption.id,
        redemption.name,
        redemption.command,
        redemption.description,
        redemption.cost,
        redemption.minLevel,
        redemption.cooldownSeconds,
        JSON.stringify(redemption.action),
        redemption.enabled ? 1 : 0
      )
    } catch (err: any) {
      if (String(err?.message || '').includes('UNIQUE')) {
        throw new Error(`!${command} is already used by another redemption.`)
      }
      throw err
    }
    this.emit('redemptions-updated', this.getRedemptions())
    return this.getRedemptionByCommand(command) || redemption
  }

  public deleteRedemption(id: string): boolean {
    const normalized = normalizeRedemptionId(id)
    if (!normalized) return false
    const result = this.db.getRawDb().prepare('DELETE FROM economy_redemptions WHERE id = ?').run(normalized)
    if (result.changes > 0) this.emit('redemptions-updated', this.getRedemptions())
    return result.changes > 0
  }

  public purchaseRedemption(
    username: string,
    platform: string,
    command: string,
    level: number,
    now = new Date(),
    identityHint: EconomyIdentityHint = {}
  ): EconomyRedemptionPurchaseResult {
    const identity = this.normalizeIdentity(username, platform, identityHint)
    const redemption = this.getRedemptionByCommand(command)
    const raw = this.db.getRawDb()
    const balance = this.getBalanceForIdentity(raw, identity)
    if (!this.config.enabled || !this.config.redemptionsEnabled) return { ok: false, error: 'disabled', balance }
    if (!redemption || !redemption.enabled) return { ok: false, error: 'not-found', balance }
    if (level < redemption.minLevel) {
      return { ok: false, error: 'level-required', balance, requiredLevel: redemption.minLevel, redemption }
    }

    const purchaseId = randomUUID()
    const nowMs = now.getTime()
    const tx = raw.transaction((): EconomyRedemptionPurchaseResult => {
      const cooldownScope = economyScopeWhere(identity, 'economy_redemption_uses')
      const latest = raw.prepare(`
        SELECT created_at
        FROM economy_redemption_uses
        WHERE redemption_id = ? AND (${cooldownScope.sql}) AND status = 'completed'
        ORDER BY created_at DESC
        LIMIT 1
      `).get(redemption.id, ...cooldownScope.params) as { created_at: string } | undefined
      if (latest && redemption.cooldownSeconds > 0) {
        const readyAt = new Date(`${latest.created_at.replace(' ', 'T')}Z`).getTime() + (redemption.cooldownSeconds * 1000)
        if (Number.isFinite(readyAt) && readyAt > nowMs) {
          return {
            ok: false,
            error: 'cooldown',
            balance: this.getBalanceForIdentity(raw, identity),
            retryAfterSeconds: Math.max(1, Math.ceil((readyAt - nowMs) / 1000)),
            redemption
          }
        }
      }

      const debit = this.debitPointsWithinTransaction(raw, identity, redemption.cost)
      if (!debit.ok) {
        return {
          ok: false,
          error: 'insufficient-points',
          balance: debit.balance,
          redemption
        }
      }

      const nextBalance = debit.balance
      this.insertTransaction(
        raw,
        identity.username,
        identity.platform,
        -redemption.cost,
        nextBalance,
        'spend',
        `Redeemed ${redemption.name}`,
        `redemption:${purchaseId}`,
        {
          redemptionId: redemption.id,
          command: redemption.command,
          debitAllocations: debit.allocations
        }
      )
      raw.prepare(`
        INSERT INTO economy_redemption_uses (id, redemption_id, username, platform, cost, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'completed', ?)
      `).run(purchaseId, redemption.id, identity.username, identity.platform, redemption.cost, toSqliteTimestamp(now))

      return { ok: true, balance: nextBalance, purchaseId, redemption }
    })
    const result = tx()
    if (result.ok) this.emitBalanceChanged(identity.username, identity.platform, result.balance)
    return result
  }

  public refundRedemption(purchaseId: string, reason = 'Redemption effect failed'): number | null {
    const raw = this.db.getRawDb()
    const tx = raw.transaction((): { username: string; platform: string; balance: number } | null => {
      const use = raw.prepare(`
        SELECT id, username, platform, cost
        FROM economy_redemption_uses
        WHERE id = ? AND status = 'completed'
      `).get(purchaseId) as { id: string; username: string; platform: string; cost: number } | undefined
      if (!use) return null
      const changed = raw.prepare(`
        UPDATE economy_redemption_uses SET status = 'refunded'
        WHERE id = ? AND status = 'completed'
      `).run(purchaseId)
      if (changed.changes !== 1) return null
      const identity = this.normalizeIdentity(use.username, use.platform)
      const allocations = this.getRedemptionDebitAllocations(raw, purchaseId, use.cost)
      let balance: number
      if (allocations) {
        const restore = raw.prepare(`
          UPDATE economy_users
          SET points = points + ?, updated_at = CURRENT_TIMESTAMP
          WHERE username = ? AND platform = ?
        `)
        for (const allocation of allocations) {
          const restored = restore.run(allocation.amount, allocation.username, allocation.platform)
          if (restored.changes !== 1) {
            throw new Error(`Could not restore redemption debit for ${allocation.platform}:${allocation.username}.`)
          }
        }
        balance = this.getBalanceForIdentity(raw, identity)
        this.insertTransaction(
          raw,
          identity.username,
          identity.platform,
          use.cost,
          balance,
          'refund',
          reason,
          `redemption-refund:${purchaseId}`,
          { purchaseId, debitAllocations: allocations }
        )
      } else {
        balance = this.creditPointsWithinTransaction(
          raw,
          identity,
          use.cost,
          'refund',
          reason,
          `redemption-refund:${purchaseId}`,
          { purchaseId }
        )
      }
      return { username: use.username, platform: use.platform, balance }
    })
    const result = tx()
    if (!result) return null
    this.emitBalanceChanged(result.username, result.platform, result.balance)
    return result.balance
  }

  public getTopAccounts(limit = 25): EconomyAccount[] {
    return this.mapTopAccounts(loadEconomyOwnerAggregates(this.db.getRawDb()), limit)
  }

  private mapTopAccounts(owners: EconomyOwnerAggregate[], limit = 25): EconomyAccount[] {
    const safeLimit = Math.max(1, Math.min(100, integer(limit) || 25))
    return owners
      .filter((owner) => owner.points > 0 || owner.xp > 0)
      .sort((first, second) => second.points - first.points || second.xp - first.xp)
      .slice(0, safeLimit)
      .map((owner) => ({
        username: owner.username,
        platform: owner.platform,
        points: owner.points,
        xp: owner.xp,
        level: getLoyaltyLevelForXp(owner.xp),
        updatedAt: owner.updatedAt
      }))
  }

  public getTransactions(limit = 100): EconomyTransaction[] {
    const safeLimit = Math.max(1, Math.min(500, integer(limit) || 100))
    const rows = this.db.getRawDb().prepare(`
      SELECT id, username, platform, delta, balance_after, kind, reason,
             reference_id, metadata_json, created_at
      FROM economy_transactions
      ORDER BY id DESC
      LIMIT ?
    `).all(safeLimit) as any[]
    return rows.map(mapTransaction)
  }

  public getDashboard(): EconomyDashboard {
    const raw = this.db.getRawDb()
    const owners = loadEconomyOwnerAggregates(raw)
    const ledger = raw.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0) AS lifetime_earned,
        COALESCE(ABS(SUM(CASE WHEN delta < 0 THEN delta ELSE 0 END)), 0) AS lifetime_spent
      FROM economy_transactions
    `).get() as { lifetime_earned: number; lifetime_spent: number }
    const redemptionCount = raw.prepare('SELECT COUNT(*) AS count FROM economy_redemptions WHERE enabled = 1').get() as { count: number }

    return {
      config: this.getConfig(),
      totals: {
        accounts: owners.length,
        pointsInCirculation: owners.reduce((total, owner) => total + owner.points, 0),
        lifetimeEarned: Number(ledger?.lifetime_earned || 0),
        lifetimeSpent: Number(ledger?.lifetime_spent || 0),
        activeRedemptions: Number(redemptionCount?.count || 0)
      },
      leaders: this.mapTopAccounts(owners, 25),
      recentTransactions: this.getTransactions(75),
      redemptions: this.getRedemptions()
    }
  }

  public halving() {
    const raw = this.db.getRawDb()
    const tx = raw.transaction(() => {
      const owners = loadEconomyOwnerAggregates(raw).filter((owner) => owner.points > 0)
      for (const owner of owners) {
        const next = Math.floor(owner.points / 2)
        const reduction = owner.points - next
        const actor = owner.members[0]
        if (!actor) continue
        const identity = resolveEconomyIdentity(this.db, actor.username, actor.platform)
        const debit = this.debitPointsWithinTransaction(raw, identity, reduction)
        if (!debit.ok) throw new Error(`Could not halve shared balance for ${owner.ownerKey}.`)
        this.insertTransaction(
          raw,
          owner.username,
          owner.platform,
          -reduction,
          next,
          'adjustment',
          'The Snap halving',
          `halving:${randomUUID()}`
        )
      }
      raw.prepare('UPDATE economy_users SET total_likes = total_likes / 2').run()
    })
    tx()
    this.likeScores.clear() // Reset session scores for maximum chaos
    this.likeLabels.clear()
    this.emitLeaderboardNow()
    this.emit('balances-changed')
  }

  // --- Points Drop Logic ---
  public triggerPointsDrop() {
    this.pointsDropActive = true
    this.pointsDropWinner = null
    this.emit('points-drop-start', { amount: 100 }) // Example amount
  }

  public claimPointsDrop(
    username: string,
    platform: string,
    identityHint: EconomyIdentityHint = {}
  ): boolean {
    if (!this.pointsDropActive) return false
    
    this.pointsDropActive = false
    this.pointsDropWinner = username
    this.creditPoints(username, platform, 100, 'earn', 'Points drop claimed', undefined, {}, identityHint)
    this.emit('points-drop-claimed', { username, amount: 100 })
    return true
  }

  public dispose() {
    if (this.decayInterval) clearInterval(this.decayInterval)
    if (this.likeFlushTimer) {
      clearTimeout(this.likeFlushTimer)
      this.likeFlushTimer = null
      this.flushLikeDeltasNow()
    }
    if (this.leaderboardTimer) clearTimeout(this.leaderboardTimer)
  }

  private settleWager(
    username: string,
    platform: string,
    game: EconomyWagerResult['game'],
    bet: number,
    payoutMultiplier: number,
    outcome: string,
    identityHint: EconomyIdentityHint = {}
  ): EconomyWagerResult {
    const identity = this.normalizeIdentity(username, platform, identityHint)
    const safeBet = positiveInteger(bet)
    const raw = this.db.getRawDb()
    const currentBalance = this.getBalanceForIdentity(raw, identity)
    if (!this.config.enabled || !this.config.gamblingEnabled) {
      return { ok: false, error: 'disabled', game, bet: safeBet, payout: 0, balance: currentBalance, outcome, won: false }
    }
    if (!safeBet || safeBet < this.config.minBet || safeBet > this.config.maxBet) {
      return { ok: false, error: 'invalid-bet', game, bet: safeBet, payout: 0, balance: currentBalance, outcome, won: false }
    }

    const wagerId = `${game}:${randomUUID()}`
    const payout = Math.max(0, Math.floor(safeBet * Math.max(0, payoutMultiplier)))
    const tx = raw.transaction((): EconomyWagerResult => {
      const debit = this.debitPointsWithinTransaction(raw, identity, safeBet)
      if (!debit.ok) {
        return { ok: false, error: 'insufficient-points', game, bet: safeBet, payout: 0, balance: debit.balance, outcome, won: false }
      }

      let balance = debit.balance
      this.insertTransaction(raw, identity.username, identity.platform, -safeBet, balance, 'wager', `${game} wager`, wagerId, { outcome })
      if (payout > 0) {
        balance = this.creditPointsWithinTransaction(raw, identity, payout, 'payout', `${game} payout`, wagerId, { outcome, multiplier: payoutMultiplier })
      }
      return { ok: true, game, bet: safeBet, payout, balance, outcome, won: payout > safeBet }
    })
    const result = tx()
    if (result.ok) this.emitBalanceChanged(identity.username, identity.platform, result.balance)
    return result
  }

  private debitPoints(
    username: string,
    platform: string,
    amount: number,
    kind: EconomyTransactionKind,
    reason: string,
    referenceId?: string,
    metadata: Record<string, unknown> = {},
    identityHint: EconomyIdentityHint = {}
  ): { ok: boolean; balance: number } {
    const identity = this.normalizeIdentity(username, platform, identityHint)
    const raw = this.db.getRawDb()
    const tx = raw.transaction(() => {
      const result = this.debitPointsWithinTransaction(raw, identity, amount)
      if (!result.ok) return result
      const balance = result.balance
      this.insertTransaction(raw, identity.username, identity.platform, -amount, balance, kind, reason, referenceId, metadata)
      return { ok: true, balance }
    })
    const result = tx()
    if (result.ok) this.emitBalanceChanged(identity.username, identity.platform, result.balance)
    return result
  }

  private creditPoints(
    username: string,
    platform: string,
    amount: number,
    kind: EconomyTransactionKind,
    reason: string,
    referenceId?: string,
    metadata: Record<string, unknown> = {},
    identityHint: EconomyIdentityHint = {}
  ): number {
    const identity = this.normalizeIdentity(username, platform, identityHint)
    const safeAmount = positiveInteger(amount)
    if (!safeAmount) return this.getBalanceForIdentity(this.db.getRawDb(), identity)
    const raw = this.db.getRawDb()
    const tx = raw.transaction(() => this.creditPointsWithinTransaction(
      raw,
      identity,
      safeAmount,
      kind,
      reason,
      referenceId,
      metadata
    ))
    const balance = tx()
    this.emitBalanceChanged(identity.username, identity.platform, balance)
    return balance
  }

  private creditPointsWithinTransaction(
    raw: ReturnType<Database['getRawDb']>,
    identity: EconomyIdentity,
    amount: number,
    kind: EconomyTransactionKind,
    reason: string,
    referenceId?: string,
    metadata: Record<string, unknown> = {}
  ): number {
    raw.prepare(`
      INSERT INTO economy_users (username, platform, points)
      VALUES (?, ?, ?)
      ON CONFLICT(username, platform) DO UPDATE SET
        points = points + excluded.points,
        updated_at = CURRENT_TIMESTAMP
    `).run(identity.username, identity.platform, amount)
    const balance = this.getBalanceForIdentity(raw, identity)
    this.insertTransaction(raw, identity.username, identity.platform, amount, balance, kind, reason, referenceId, metadata)
    return balance
  }

  private debitPointsWithinTransaction(
    raw: ReturnType<Database['getRawDb']>,
    identity: EconomyIdentity,
    amount: number
  ): { ok: boolean; balance: number; allocations: EconomyDebitAllocation[] } {
    const rows = this.getPointRows(raw, identity)
    const balance = rows.reduce((total, row) => total + row.points, 0)
    if (amount <= 0 || balance < amount) return { ok: false, balance, allocations: [] }

    // Spend the invoking account's own row first, then linked rows in a stable
    // order. The transaction keeps the shared balance atomic and no member row
    // is ever allowed to go negative.
    rows.sort((first, second) => {
      const firstIsActor = first.platform === identity.platform && first.username.toLowerCase() === identity.username.toLowerCase()
      const secondIsActor = second.platform === identity.platform && second.username.toLowerCase() === identity.username.toLowerCase()
      if (firstIsActor !== secondIsActor) return firstIsActor ? -1 : 1
      if (second.points !== first.points) return second.points - first.points
      return `${first.platform}:${first.username}`.localeCompare(`${second.platform}:${second.username}`)
    })

    let remaining = amount
    const debit = raw.prepare(`
      UPDATE economy_users
      SET points = points - ?, updated_at = CURRENT_TIMESTAMP
      WHERE username = ? AND platform = ? AND points >= ?
    `)
    const findPlatformUserId = raw.prepare(`
      SELECT COALESCE(
        (
          SELECT platform_user_id FROM viewer_accounts
          WHERE platform = ? AND username = LOWER(?)
          LIMIT 1
        ),
        (
          SELECT platform_user_id FROM user_stats
          WHERE platform = ? AND username = LOWER(?)
          LIMIT 1
        )
      ) AS platform_user_id
    `)
    const allocations: EconomyDebitAllocation[] = []
    for (const row of rows) {
      if (remaining <= 0) break
      const deduction = Math.min(row.points, remaining)
      if (deduction <= 0) continue
      const changed = debit.run(deduction, row.username, row.platform, deduction)
      if (changed.changes !== 1) {
        throw new Error(`Shared economy debit lost atomicity for ${row.platform}:${row.username}.`)
      }
      const account = findPlatformUserId.get(
        row.platform,
        row.username,
        row.platform,
        row.username
      ) as { platform_user_id?: string | null } | undefined
      const platformUserId = String(account?.platform_user_id || '').trim()
      allocations.push({
        username: row.username,
        platform: row.platform,
        amount: deduction,
        ...(platformUserId ? { platformUserId } : {})
      })
      remaining -= deduction
    }
    if (remaining !== 0) throw new Error('Shared economy debit did not settle the requested amount.')
    return { ok: true, balance: balance - amount, allocations }
  }

  private getRedemptionDebitAllocations(
    raw: ReturnType<Database['getRawDb']>,
    purchaseId: string,
    expectedTotal: number
  ): EconomyDebitAllocation[] | null {
    const row = raw.prepare(`
      SELECT metadata_json
      FROM economy_transactions
      WHERE reference_id = ? AND kind = 'spend'
      ORDER BY id DESC
      LIMIT 1
    `).get(`redemption:${purchaseId}`) as { metadata_json?: string } | undefined
    if (!row?.metadata_json) return null

    try {
      const metadata = JSON.parse(row.metadata_json) as { debitAllocations?: unknown }
      if (!Array.isArray(metadata.debitAllocations)) return null
      const allocations = metadata.debitAllocations.flatMap((entry): EconomyDebitAllocation[] => {
        if (!entry || typeof entry !== 'object') return []
        const candidate = entry as Partial<EconomyDebitAllocation>
        const username = String(candidate.username || '').trim()
        const platform = String(candidate.platform || '').trim()
        const amount = positiveInteger(candidate.amount)
        const platformUserId = String(candidate.platformUserId || '').trim()
        if (!username || !isStreamPlatform(platform) || !amount) return []
        return [{ username, platform, amount, ...(platformUserId ? { platformUserId } : {}) }]
      })
      if (allocations.length !== metadata.debitAllocations.length) return null
      if (allocations.reduce((total, allocation) => total + allocation.amount, 0) !== expectedTotal) return null

      const exactRow = raw.prepare(`
        SELECT username FROM economy_users WHERE username = ? AND platform = ?
      `)
      const accountByPlatformId = raw.prepare(`
        SELECT username FROM viewer_accounts
        WHERE platform = ? AND platform_user_id = ?
        ORDER BY last_seen_at DESC
        LIMIT 1
      `)
      const statByPlatformId = raw.prepare(`
        SELECT username FROM user_stats
        WHERE platform = ? AND platform_user_id = ?
        ORDER BY last_seen_at DESC
        LIMIT 1
      `)
      const economyRowByCurrentName = raw.prepare(`
        SELECT username FROM economy_users
        WHERE platform = ? AND username COLLATE NOCASE = ?
        ORDER BY CASE WHEN username = ? THEN 0 ELSE 1 END, username
        LIMIT 1
      `)
      const resolved = new Map<string, EconomyDebitAllocation>()
      for (const allocation of allocations) {
        const exact = exactRow.get(allocation.username, allocation.platform) as { username: string } | undefined
        let currentUsername = exact?.username || ''
        if (!currentUsername && allocation.platformUserId) {
          const currentAccount = accountByPlatformId.get(
            allocation.platform,
            allocation.platformUserId
          ) as { username: string } | undefined
          const currentStat = currentAccount || statByPlatformId.get(
            allocation.platform,
            allocation.platformUserId
          ) as { username: string } | undefined
          if (currentStat?.username) {
            const currentEconomyRow = economyRowByCurrentName.get(
              allocation.platform,
              currentStat.username,
              currentStat.username
            ) as { username: string } | undefined
            currentUsername = currentEconomyRow?.username || ''
          }
        }
        if (!currentUsername) return null

        const key = `${allocation.platform}:${currentUsername}`
        const previous = resolved.get(key)
        if (previous) {
          previous.amount += allocation.amount
        } else {
          resolved.set(key, { ...allocation, username: currentUsername })
        }
      }
      return Array.from(resolved.values())
    } catch {
      return null
    }
  }

  private insertTransaction(
    raw: ReturnType<Database['getRawDb']>,
    username: string,
    platform: string,
    delta: number,
    balanceAfter: number,
    kind: EconomyTransactionKind,
    reason: string,
    referenceId?: string,
    metadata: Record<string, unknown> = {}
  ): void {
    raw.prepare(`
      INSERT INTO economy_transactions (
        username, platform, delta, balance_after, kind, reason, reference_id, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      username,
      platform,
      delta,
      balanceAfter,
      kind,
      String(reason || kind).slice(0, 160),
      referenceId || null,
      JSON.stringify(metadata)
    )
  }

  private getBalance(
    username: string,
    platform: string,
    identityHint: EconomyIdentityHint = {}
  ): number {
    const identity = this.normalizeIdentity(username, platform, identityHint)
    return this.getBalanceForIdentity(this.db.getRawDb(), identity)
  }

  private getBalanceForIdentity(raw: ReturnType<Database['getRawDb']>, identity: EconomyIdentity): number {
    const scope = economyScopeWhere(identity, 'economy_users')
    const row = raw.prepare(`
      SELECT COALESCE(SUM(CASE WHEN economy_users.points > 0 THEN economy_users.points ELSE 0 END), 0) AS points
      FROM economy_users
      WHERE ${scope.sql}
    `).get(...scope.params) as { points: number } | undefined
    return Math.max(0, integer(row?.points))
  }

  private getPointRows(
    raw: ReturnType<Database['getRawDb']>,
    identity: EconomyIdentity
  ): EconomyMemberRow[] {
    const scope = economyScopeWhere(identity, 'economy_users')
    const rows = raw.prepare(`
      SELECT username, platform, COALESCE(points, 0) AS points,
             COALESCE(xp, 0) AS xp, updated_at
      FROM economy_users
      WHERE ${scope.sql}
    `).all(...scope.params) as Array<{
      username: string
      platform: Platform
      points: number
      xp: number
      updated_at: string | null
    }>
    return rows.map((row) => ({
      username: row.username,
      platform: row.platform,
      points: Math.max(0, integer(row.points)),
      xp: Math.max(0, integer(row.xp)),
      updatedAt: row.updated_at ? String(row.updated_at) : null
    }))
  }

  private emitBalanceChanged(username: string, platform: string, balance: number): void {
    this.emit('balance-changed', { username, platform, balance })
  }

  private seedDefaultRedemptions(): void {
    try {
      const raw = this.db.getRawDb()
      const seeded = raw.prepare('SELECT value_json FROM stream_state WHERE key = ?').get(ECONOMY_SEEDED_STATE_KEY) as { value_json?: string } | undefined
      if (seeded?.value_json === 'true') return
      const tx = raw.transaction(() => {
        for (const redemption of DEFAULT_REDEMPTIONS) this.saveRedemption(redemption)
        raw.prepare('INSERT OR REPLACE INTO stream_state (key, value_json) VALUES (?, ?)')
          .run(ECONOMY_SEEDED_STATE_KEY, 'true')
      })
      tx()
    } catch (err) {
      console.warn('[economy] Could not seed starter redemptions:', err)
    }
  }

  private mapRedemption(row: any): EconomyRedemption {
    return {
      id: String(row.id),
      name: String(row.name),
      command: normalizeCommand(row.command),
      description: String(row.description || ''),
      cost: Math.max(1, integer(row.cost)),
      minLevel: Math.max(1, integer(row.min_level)),
      cooldownSeconds: Math.max(0, integer(row.cooldown_seconds)),
      enabled: Boolean(row.enabled),
      action: normalizeRedemptionAction(JSON.parse(row.action_json)),
      createdAt: row.created_at ? String(row.created_at) : undefined,
      updatedAt: row.updated_at ? String(row.updated_at) : undefined
    }
  }

  private normalizeIdentity(
    username: string,
    platform: string,
    identityHint: EconomyIdentityHint = {}
  ): EconomyIdentity {
    return resolveEconomyIdentity(this.db, username, platform, identityHint)
  }

  private normalizeUsername(username: string): string {
    const normalized = String(username || '').trim().toLowerCase()
    return normalized || 'anonymous'
  }
}

const ROULETTE_RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])

function integer(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.floor(parsed) : 0
}

function positiveInteger(value: unknown): number {
  return Math.max(0, integer(value))
}

function normalizeCommand(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/^!+/, '')
}

function normalizeRedemptionId(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 80)
}

function normalizeRedemptionAction(value: unknown): EconomyRedemptionAction {
  const action = value && typeof value === 'object' ? value as Partial<EconomyRedemptionAction> : {}
  if (action.type === 'sound') {
    const soundId = String(action.soundId || '').trim().slice(0, 240)
    if (!soundId) throw new Error('Choose a sound for this redemption.')
    const parsedVolume = Number(action.volume)
    const volume = Number.isFinite(parsedVolume) ? Math.max(0, Math.min(1, parsedVolume)) : 1
    return { type: 'sound', soundId, volume }
  }
  if (action.type === 'lighting') {
    const lighting = action as Partial<EconomyLightingAction>
    const effect = lighting.effect === 'pulse' ? 'pulse' : 'flash'
    const color = /^#[0-9a-f]{6}$/i.test(String(lighting.color || '')) ? String(lighting.color).toUpperCase() : '#19C8FF'
    const targetDeviceIds = Array.isArray(lighting.targetDeviceIds)
      ? Array.from(new Set(lighting.targetDeviceIds.map(String).map((id) => id.trim()).filter(Boolean))).slice(0, 100)
      : []
    const allowedPlatforms = new Set(['hue', 'govee', 'nanoleaf', 'lifx', 'wiz', 'yeelight', 'elgato', 'razer', 'corsair'])
    const targetPlatforms = Array.isArray(lighting.targetPlatforms)
      ? Array.from(new Set(lighting.targetPlatforms.filter((platform) => allowedPlatforms.has(platform)))) as EconomyLightingAction['targetPlatforms']
      : []
    return {
      type: 'lighting',
      effect,
      color,
      durationMs: Math.max(250, Math.min(10_000, integer(lighting.durationMs) || 1500)),
      targetDeviceIds,
      targetPlatforms
    }
  }
  throw new Error('Redemption action must be a sound or lighting effect.')
}

function mapTransaction(row: any): EconomyTransaction {
  let metadata: Record<string, unknown> = {}
  try {
    metadata = JSON.parse(row.metadata_json || '{}')
  } catch {
    metadata = {}
  }
  return {
    id: integer(row.id),
    username: String(row.username),
    platform: row.platform as Platform,
    delta: integer(row.delta),
    balanceAfter: Math.max(0, integer(row.balance_after)),
    kind: row.kind as EconomyTransactionKind,
    reason: String(row.reason || ''),
    referenceId: row.reference_id ? String(row.reference_id) : null,
    metadata,
    createdAt: String(row.created_at || '')
  }
}

function toUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function toSqliteTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}
