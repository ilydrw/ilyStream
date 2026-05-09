import { Database } from '../db/database'
import crypto from 'crypto'

export class RemoteAuthService {
  constructor(private db: Database) {
    this.initTable()
  }

  private initTable() {
    this.db.getRawDb().exec(`
      CREATE TABLE IF NOT EXISTS remote_tokens (
        token TEXT PRIMARY KEY,
        label TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_used DATETIME
      )
    `)
  }

  generateToken(label: string): string {
    const token = crypto.randomBytes(32).toString('hex')
    this.db.getRawDb().prepare(`
      INSERT INTO remote_tokens (token, label) VALUES (?, ?)
    `).run(token, label)
    return token
  }

  verifyToken(token: string): boolean {
    const row = this.db.getRawDb().prepare(`
      SELECT token FROM remote_tokens WHERE token = ?
    `).get(token)
    
    if (row) {
      this.db.getRawDb().prepare(`
        UPDATE remote_tokens SET last_used = CURRENT_TIMESTAMP WHERE token = ?
      `).run(token)
      return true
    }
    return false
  }

  revokeToken(token: string): void {
    this.db.getRawDb().prepare(`DELETE FROM remote_tokens WHERE token = ?`).run(token)
  }

  getAllTokens(): any[] {
    return this.db.getRawDb().prepare(`SELECT * FROM remote_tokens`).all()
  }
}
