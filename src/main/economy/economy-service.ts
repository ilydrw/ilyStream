import { EventEmitter } from 'events'
import { Database } from '../db/database'

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

  constructor(private db: Database) {
    super()
    this.loadState()
    this.startDecayLoop()
  }

  private loadState() {
    try {
      const row = this.db.getRawDb().prepare('SELECT value_json FROM stream_state WHERE key = ?').get('subathon_end') as any
      if (row) {
        this.subathonEndTime = JSON.parse(row.value_json).timestamp
      }
    } catch (err) {
      console.warn('[economy] Could not load stream_state; continuing with a fresh subathon timer.', err)
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

  private scheduleLikeFlush() {
    if (this.likeFlushTimer) return
    this.likeFlushTimer = setTimeout(() => {
      this.likeFlushTimer = null
      this.flushLikeDeltasNow()
    }, LIKE_DB_FLUSH_INTERVAL_MS)
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
  public async addPoints(username: string, platform: string, amount: number) {
    this.db.getRawDb().prepare(`
      INSERT INTO economy_users (username, platform, points)
      VALUES (?, ?, ?)
      ON CONFLICT(username, platform) DO UPDATE SET 
        points = points + EXCLUDED.points,
        updated_at = CURRENT_TIMESTAMP
    `).run(username, platform, amount)
  }

  public async getPoints(username: string, platform: string): Promise<number> {
    const row = this.db.getRawDb().prepare('SELECT points FROM economy_users WHERE username = ? AND platform = ?')
      .get(username, platform) as any
    return row ? row.points : 0
  }

  public async spendPoints(username: string, platform: string, amount: number): Promise<boolean> {
    // Atomic check-and-decrement: do the read and the conditional write inside
    // a single SQLite transaction. The old read-then-write pattern had a
    // TOCTOU window — two concurrent `!spin` commands could both pass the
    // `current < amount` check and then both decrement, leading to negative
    // points. `UPDATE ... WHERE points >= ?` returning `changes === 1` is the
    // canonical single-statement check-and-set. Wrapping in `db.transaction`
    // upgrades to BEGIN IMMEDIATE so a second concurrent caller waits at the
    // SQLite level rather than racing the read.
    const raw = this.db.getRawDb()
    const tx = raw.transaction((u: string, p: string, a: number) => {
      const result = raw.prepare(
        'UPDATE economy_users SET points = points - ?, updated_at = CURRENT_TIMESTAMP WHERE username = ? AND platform = ? AND points >= ?'
      ).run(a, u, p, a)
      return result.changes === 1
    })
    return tx(username, platform, amount)
  }

  public halving() {
    this.db.getRawDb().prepare('UPDATE economy_users SET points = points / 2').run()
    this.db.getRawDb().prepare('UPDATE economy_users SET total_likes = total_likes / 2').run()
    this.likeScores.clear() // Reset session scores for maximum chaos
    this.likeLabels.clear()
    this.emitLeaderboardNow()
  }

  // --- Points Drop Logic ---
  public triggerPointsDrop() {
    this.pointsDropActive = true
    this.pointsDropWinner = null
    this.emit('points-drop-start', { amount: 100 }) // Example amount
  }

  public claimPointsDrop(username: string, platform: string): boolean {
    if (!this.pointsDropActive) return false
    
    this.pointsDropActive = false
    this.pointsDropWinner = username
    this.addPoints(username, platform, 100)
    this.emit('points-drop-claimed', { username, amount: 100 })
    return true
  }

  public dispose() {
    if (this.decayInterval) clearInterval(this.decayInterval)
    if (this.likeFlushTimer) clearTimeout(this.likeFlushTimer)
    if (this.leaderboardTimer) clearTimeout(this.leaderboardTimer)
  }

  private normalizeUsername(username: string): string {
    const normalized = String(username || '').trim().toLowerCase()
    return normalized || 'anonymous'
  }
}
