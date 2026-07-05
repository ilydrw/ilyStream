import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SCHEMA_SQL } from '../db/schema'
import { EconomyService } from './economy-service'

describe('EconomyService schema', () => {
  it('has a backing stream_state table in the canonical startup schema', () => {
    expect(SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS stream_state')
    expect(SCHEMA_SQL).toContain('key TEXT PRIMARY KEY')
    expect(SCHEMA_SQL).toContain('value_json TEXT NOT NULL')
  })
})

interface EconomyRow { username: string; platform: string; total_likes: number; points: number }

/**
 * Minimal in-memory stand-in for `better-sqlite3` — only implements the
 * three call shapes EconomyService actually uses: `prepare().run()` for the
 * batched UPSERT, `prepare().get()` for the stream_state load, and
 * `transaction(fn) → (arg) => fn(arg)` for the wrapper around the batch.
 *
 * Using the real native module would be ideal but it ships compiled for
 * Electron's NODE_MODULE_VERSION, which doesn't match the host Node that
 * vitest runs under.
 */
function makeFakeDb() {
  const rows = new Map<string, EconomyRow>()
  let runCount = 0
  let transactionCount = 0

  function rowKey(username: string, platform: string) { return `${platform}:${username}` }

  function fakePrepare(sql: string) {
    const isLikeUpsert = sql.includes('INSERT INTO economy_users') && sql.includes('total_likes = total_likes + EXCLUDED.total_likes')
    const isStreamStateSelect = sql.includes('FROM stream_state')

    return {
      run: (...args: any[]) => {
        runCount++
        if (isLikeUpsert) {
          const [username, totalLikes] = args
          const key = rowKey(username, 'tiktok')
          const existing = rows.get(key)
          if (existing) {
            existing.total_likes += totalLikes
          } else {
            rows.set(key, { username, platform: 'tiktok', total_likes: totalLikes, points: 0 })
          }
        }
        // Other SQL (halving's UPDATEs, etc) is a no-op for these tests.
        return { changes: 1 }
      },
      get: (..._args: any[]) => {
        if (isStreamStateSelect) return undefined // no persisted subathon
        return undefined
      },
      all: () => [],
    }
  }

  function fakeTransaction<TArgs extends any[]>(fn: (...a: TArgs) => void) {
    return (...args: TArgs) => {
      transactionCount++
      fn(...args)
    }
  }

  const raw = { prepare: fakePrepare, transaction: fakeTransaction }
  return {
    db: { getRawDb: () => raw } as any,
    rows,
    getRunCount: () => runCount,
    getTransactionCount: () => transactionCount
  }
}

describe('EconomyService like batching', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('coalesces a burst of likes into one leaderboard emit (~1.5s window)', () => {
    const fake = makeFakeDb()
    const service = new EconomyService(fake.db)
    const emits: any[] = []
    service.on('leaderboard-update', (data) => emits.push(data))

    for (let i = 0; i < 15; i++) service.registerLike('alice', 1)
    for (let i = 0; i < 5; i++) service.registerLike('bob', 1)

    // Before the trailing-fire window elapses, no emit.
    expect(emits).toHaveLength(0)

    vi.advanceTimersByTime(1500)

    expect(emits).toHaveLength(1)
    const lb = emits[0]
    expect(lb[0]).toEqual({ username: 'alice', score: 15 })
    expect(lb[1]).toEqual({ username: 'bob', score: 5 })
  })

  it('batches per-user DB writes — burst becomes one transactional batch per window', () => {
    const fake = makeFakeDb()
    const service = new EconomyService(fake.db)
    const initialTx = fake.getTransactionCount()

    for (let i = 0; i < 20; i++) service.registerLike('alice', 1)
    for (let i = 0; i < 7; i++) service.registerLike('bob', 2)

    // Nothing flushed yet.
    expect(fake.rows.size).toBe(0)
    expect(fake.getTransactionCount() - initialTx).toBe(0)

    vi.advanceTimersByTime(1000)

    // Exactly one transaction, one row per user, totals summed.
    expect(fake.getTransactionCount() - initialTx).toBe(1)
    expect(fake.rows.get('tiktok:alice')?.total_likes).toBe(20)
    expect(fake.rows.get('tiktok:bob')?.total_likes).toBe(14)
  })

  it('subsequent burst after a flush opens a fresh window and adds on top', () => {
    const fake = makeFakeDb()
    const service = new EconomyService(fake.db)

    service.registerLike('alice', 3)
    vi.advanceTimersByTime(1000)
    expect(fake.rows.get('tiktok:alice')?.total_likes).toBe(3)

    service.registerLike('alice', 5)
    service.registerLike('alice', 2)
    vi.advanceTimersByTime(1000)
    expect(fake.rows.get('tiktok:alice')?.total_likes).toBe(10)
  })

  it('in-memory like score is updated synchronously so the leaderboard sort is current', () => {
    const fake = makeFakeDb()
    const service = new EconomyService(fake.db)
    const emits: any[] = []
    service.on('leaderboard-update', (data) => emits.push(data))

    // Two distinct bursts within the same 1.5s window — emit should reflect both.
    service.registerLike('alice', 4)
    vi.advanceTimersByTime(200)
    service.registerLike('alice', 6)
    vi.advanceTimersByTime(1300) // total 1500ms from first call

    expect(emits).toHaveLength(1)
    expect(emits[0][0]).toEqual({ username: 'alice', score: 10 })
  })

  it('exposes the current in-memory leaderboard for late browser-source hydration', () => {
    const fake = makeFakeDb()
    const service = new EconomyService(fake.db)

    service.registerLike('alice', 4)
    service.registerLike('bob', 12)
    service.registerLike('alice', 3)

    expect(service.getLeaderboardSnapshot()).toEqual([
      { username: 'bob', score: 12 },
      { username: 'alice', score: 7 }
    ])
  })

  it('resets the session likeathon leaderboard without dropping pending lifetime like writes', () => {
    const fake = makeFakeDb()
    const service = new EconomyService(fake.db)
    const emits: any[] = []
    service.on('leaderboard-update', (data) => emits.push(data))

    service.registerLike('alice', 4)
    expect(service.getLeaderboardSnapshot()).toEqual([{ username: 'alice', score: 4 }])

    service.resetLikeathon()

    expect(service.getLeaderboardSnapshot()).toEqual([])
    expect(emits[emits.length - 1]).toEqual([])

    vi.advanceTimersByTime(1000)
    expect(fake.rows.get('tiktok:alice')?.total_likes).toBe(4)
  })
})
