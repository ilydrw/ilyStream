import { Database } from '../db/database'
import crypto from 'crypto'

interface RemoteTokenRow {
  token_hash: string
  token_suffix: string
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
    const rawDb = this.db.getRawDb()
    const columns = rawDb.prepare(`PRAGMA table_info(remote_tokens)`).all() as Array<{ name: string }>
    const hasPlaintextTokens = columns.some((column) => column.name === 'token')

    const migrate = rawDb.transaction(() => {
      rawDb.exec(`
        CREATE TABLE IF NOT EXISTS remote_tokens_v2 (
          token_hash TEXT PRIMARY KEY,
          token_suffix TEXT NOT NULL,
          label TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_used DATETIME
        )
      `)

      if (hasPlaintextTokens) {
        const legacyRows = rawDb.prepare(`
          SELECT token, label, created_at, last_used FROM remote_tokens
        `).all() as Array<{
          token: string
          label: string | null
          created_at: string
          last_used: string | null
        }>
        const insert = rawDb.prepare(`
          INSERT OR REPLACE INTO remote_tokens_v2
            (token_hash, token_suffix, label, created_at, last_used)
          VALUES (?, ?, ?, ?, ?)
        `)
        for (const row of legacyRows) {
          insert.run(
            this.hashToken(row.token),
            row.token.slice(-8),
            row.label,
            row.created_at,
            row.last_used
          )
        }
        rawDb.exec(`DROP TABLE remote_tokens`)
      }

      const currentColumns = rawDb.prepare(`PRAGMA table_info(remote_tokens)`).all() as Array<{ name: string }>
      if (currentColumns.length === 0) {
        rawDb.exec(`ALTER TABLE remote_tokens_v2 RENAME TO remote_tokens`)
      } else {
        rawDb.exec(`DROP TABLE IF EXISTS remote_tokens_v2`)
      }
    })
    migrate()
  }

  generateToken(label: string): string {
    const token = crypto.randomBytes(32).toString('hex')
    this.db.getRawDb().prepare(`
      INSERT INTO remote_tokens (token_hash, token_suffix, label) VALUES (?, ?, ?)
    `).run(this.hashToken(token), token.slice(-8), label)
    return token
  }

  verifyToken(token: string): boolean {
    const normalizedToken = String(token || '').trim()
    if (!normalizedToken) return false
    const tokenHash = this.hashToken(normalizedToken)
    const row = this.db.getRawDb().prepare(`
      SELECT token_hash FROM remote_tokens WHERE token_hash = ?
    `).get(tokenHash)
    
    if (row) {
      this.db.getRawDb().prepare(`
        UPDATE remote_tokens SET last_used = CURRENT_TIMESTAMP WHERE token_hash = ?
      `).run(tokenHash)
      return true
    }
    return false
  }

  revokeToken(token: string): void {
    const normalizedToken = String(token || '').trim()
    if (!normalizedToken) return
    this.db.getRawDb().prepare(`DELETE FROM remote_tokens WHERE token_hash = ?`)
      .run(this.hashToken(normalizedToken))
  }

  revokeTokenById(id: string): void {
    const normalizedId = String(id || '').trim()
    if (!normalizedId) return
    this.db.getRawDb().prepare(`DELETE FROM remote_tokens WHERE substr(token_hash, 1, 24) = ?`)
      .run(normalizedId)
  }

  revokeTokenByIdOrToken(value: string): void {
    const normalized = String(value || '').trim()
    if (!normalized) return
    const tokenHash = this.hashToken(normalized)
    this.db.getRawDb().prepare(`
      DELETE FROM remote_tokens
      WHERE token_hash = ? OR substr(token_hash, 1, 24) = ?
    `).run(tokenHash, normalized)
  }

  listTokenSummaries(): RemoteTokenSummary[] {
    return this.getAllTokens().map((row) => ({
      id: row.token_hash.slice(0, 24),
      tokenSuffix: row.token_suffix,
      label: row.label,
      created_at: row.created_at,
      last_used: row.last_used
    }))
  }

  private getAllTokens(): RemoteTokenRow[] {
    return this.db.getRawDb().prepare(`SELECT * FROM remote_tokens`).all() as RemoteTokenRow[]
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token, 'utf8').digest('hex')
  }
}
