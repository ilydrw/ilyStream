import { Database } from '../db/database'
import crypto from 'crypto'

interface RemoteTokenRow {
  token: string
  label: string | null
  created_at: string
  last_used: string | null
}

export interface RemoteTokenSummary {
  id: string
  tokenSuffix: string
  label: string | null
  created_at: string
  last_used: string | null
}

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

  revokeTokenById(id: string): void {
    const normalizedId = String(id || '').trim()
    if (!normalizedId) return
    const row = this.getAllTokens().find((tokenRow) => this.getTokenId(tokenRow.token) === normalizedId)
    if (!row) return
    this.revokeToken(row.token)
  }

  revokeTokenByIdOrToken(value: string): void {
    const normalized = String(value || '').trim()
    if (!normalized) return
    const row = this.getAllTokens().find((tokenRow) => (
      tokenRow.token === normalized ||
      this.getTokenId(tokenRow.token) === normalized
    ))
    if (!row) return
    this.revokeToken(row.token)
  }

  listTokenSummaries(): RemoteTokenSummary[] {
    return this.getAllTokens().map((row) => ({
      id: this.getTokenId(row.token),
      tokenSuffix: row.token.slice(-8),
      label: row.label,
      created_at: row.created_at,
      last_used: row.last_used
    }))
  }

  getAllTokens(): RemoteTokenRow[] {
    return this.db.getRawDb().prepare(`SELECT * FROM remote_tokens`).all() as RemoteTokenRow[]
  }

  private getTokenId(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex').slice(0, 24)
  }
}
