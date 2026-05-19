import { describe, expect, it } from 'vitest'
import { SCHEMA_SQL } from '../db/schema'

describe('EconomyService', () => {
  it('has a backing stream_state table in the canonical startup schema', () => {
    expect(SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS stream_state')
    expect(SCHEMA_SQL).toContain('key TEXT PRIMARY KEY')
    expect(SCHEMA_SQL).toContain('value_json TEXT NOT NULL')
  })
})
