import { describe, expect, it } from 'vitest'
import type { Database } from '../db/database'
import { RemoteAuthService } from './remote-auth-service'

interface StoredRow {
  token_hash: string
  token_suffix: string
  label: string | null
  created_at: string
  last_used: string | null
}

class MemoryRawDb {
  schema: 'absent' | 'legacy' | 'hashed' = 'absent'
  rows: StoredRow[] = []
  legacyRows: Array<{ token: string; label: string | null; created_at: string; last_used: string | null }> = []
  private stagedRows: StoredRow[] = []

  transaction<T extends () => unknown>(operation: T): T { return operation }

  exec(sql: string): void {
    if (sql.includes('CREATE TABLE IF NOT EXISTS remote_tokens_v2')) this.stagedRows = []
    if (sql.includes('DROP TABLE remote_tokens')) this.schema = 'absent'
    if (sql.includes('ALTER TABLE remote_tokens_v2 RENAME TO remote_tokens')) {
      this.schema = 'hashed'
      this.rows = this.stagedRows
    }
  }

  prepare(sql: string): any {
    if (sql.includes('PRAGMA table_info(remote_tokens)')) {
      return { all: () => this.schema === 'absent' ? [] : this.schema === 'legacy' ? [{ name: 'token' }] : [{ name: 'token_hash' }] }
    }
    if (sql.includes('SELECT token, label, created_at, last_used FROM remote_tokens')) return { all: () => this.legacyRows }
    if (sql.includes('INSERT OR REPLACE INTO remote_tokens_v2')) {
      return { run: (token_hash: string, token_suffix: string, label: string | null, created_at: string, last_used: string | null) => {
        this.stagedRows.push({ token_hash, token_suffix, label, created_at, last_used })
      } }
    }
    if (sql.includes('INSERT INTO remote_tokens (token_hash')) {
      return { run: (token_hash: string, token_suffix: string, label: string | null) => {
        this.rows.push({ token_hash, token_suffix, label, created_at: 'now', last_used: null })
      } }
    }
    if (sql.includes('SELECT token_hash FROM remote_tokens')) {
      return { get: (hash: string) => this.rows.find((row) => row.token_hash === hash) }
    }
    if (sql.includes('UPDATE remote_tokens SET last_used')) {
      return { run: (hash: string) => {
        const row = this.rows.find((candidate) => candidate.token_hash === hash)
        if (row) row.last_used = 'now'
      } }
    }
    if (sql.includes('DELETE FROM remote_tokens') && sql.includes('OR substr')) {
      return { run: (hash: string, id: string) => {
        this.rows = this.rows.filter((row) => row.token_hash !== hash && !row.token_hash.startsWith(id))
      } }
    }
    if (sql.includes('DELETE FROM remote_tokens WHERE substr')) {
      return { run: (id: string) => { this.rows = this.rows.filter((row) => !row.token_hash.startsWith(id)) } }
    }
    if (sql.includes('DELETE FROM remote_tokens WHERE token_hash = ?')) {
      return { run: (hash: string) => { this.rows = this.rows.filter((row) => row.token_hash !== hash) } }
    }
    if (sql.includes('SELECT * FROM remote_tokens')) return { all: () => this.rows }
    return { all: () => [], get: () => undefined, run: () => undefined }
  }
}

function serviceFor(rawDb: MemoryRawDb): RemoteAuthService {
  return new RemoteAuthService({ getRawDb: () => rawDb } as unknown as Database)
}

describe('RemoteAuthService', () => {
  it('stores only a verifier while preserving token verification and revocation', () => {
    const rawDb = new MemoryRawDb()
    const service = serviceFor(rawDb)
    const token = service.generateToken('Companion')

    expect(rawDb.rows[0]).not.toHaveProperty('token')
    expect(rawDb.rows[0].token_hash).not.toBe(token)
    expect(rawDb.rows[0].token_suffix).toBe(token.slice(-8))
    expect(service.verifyToken(token)).toBe(true)

    const [summary] = service.listTokenSummaries()
    service.revokeTokenById(summary.id)
    expect(service.verifyToken(token)).toBe(false)
  })

  it('migrates existing plaintext rows without invalidating paired clients', () => {
    const rawDb = new MemoryRawDb()
    const token = 'a'.repeat(64)
    rawDb.schema = 'legacy'
    rawDb.legacyRows = [{ token, label: 'Legacy', created_at: 'then', last_used: null }]

    const service = serviceFor(rawDb)

    expect(rawDb.schema).toBe('hashed')
    expect(rawDb.rows[0]).not.toHaveProperty('token')
    expect(service.verifyToken(token)).toBe(true)
    expect(service.listTokenSummaries()).toMatchObject([{ label: 'Legacy', tokenSuffix: 'aaaaaaaa' }])
  })
})
