import { EventEmitter } from 'events'
import { Database } from '../db/database'

export interface EconomyUser {
  username: string
  platform: string
  points: number
  totalLikes: number
}

export class EconomyService extends EventEmitter {
  private likeScores = new Map<string, number>() // username:score
  private subathonEndTime: number = 0
  private decayInterval: NodeJS.Timeout | null = null
  private pointsDropActive: boolean = false
  private pointsDropWinner: string | null = null

  constructor(private db: Database) {
    super()
    this.loadState()
    this.startDecayLoop()
  }

  private loadState() {
    const row = this.db.getRawDb().prepare('SELECT value_json FROM stream_state WHERE key = ?').get('subathon_end') as any
    if (row) {
      this.subathonEndTime = JSON.parse(row.value_json).timestamp
    }
  }

  private saveState() {
    this.db.getRawDb().prepare('INSERT OR REPLACE INTO stream_state (key, value_json) VALUES (?, ?)')
      .run('subathon_end', JSON.stringify({ timestamp: this.subathonEndTime }))
  }

  // --- Likeathon (Decay Loop) ---
  private startDecayLoop() {
    this.decayInterval = setInterval(() => {
      if (this.likeScores.size === 0) return

      for (const [username, score] of this.likeScores.entries()) {
        const newScore = Math.floor(score * 0.95)
        if (newScore <= 0) {
          this.likeScores.delete(username)
        } else {
          this.likeScores.set(username, newScore)
        }
      }
      this.emitLeaderboardUpdate()
    }, 10000)
  }

  public registerLike(username: string, count: number = 1) {
    const current = this.likeScores.get(username) || 0
    this.likeScores.set(username, current + count)
    
    // Also track in DB for long-term stats
    this.db.getRawDb().prepare(`
      INSERT INTO economy_users (username, platform, total_likes)
      VALUES (?, 'tiktok', ?)
      ON CONFLICT(username, platform) DO UPDATE SET 
        total_likes = total_likes + EXCLUDED.total_likes,
        updated_at = CURRENT_TIMESTAMP
    `).run(username, count)

    this.emitLeaderboardUpdate()
  }

  private emitLeaderboardUpdate() {
    const top10 = Array.from(this.likeScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([username, score]) => ({ username, score }))
    
    this.emit('leaderboard-update', top10)
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
    const current = await this.getPoints(username, platform)
    if (current < amount) return false

    this.db.getRawDb().prepare('UPDATE economy_users SET points = points - ? WHERE username = ? AND platform = ?')
      .run(amount, username, platform)
    return true
  }

  public halving() {
    this.db.getRawDb().prepare('UPDATE economy_users SET points = points / 2').run()
    this.db.getRawDb().prepare('UPDATE economy_users SET total_likes = total_likes / 2').run()
    this.likeScores.clear() // Reset session scores for maximum chaos
    this.emitLeaderboardUpdate()
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
  }
}
