import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnyStreamEvent } from '../platforms/types'
import { LoyaltyService } from './loyalty-service'

function makeFakeDb() {
  const rows = new Map<string, { username: string; platform: string; xp: number; level: number; points: number }>()
  const raw = {
    prepare: (sql: string) => ({
      get: (platform: string, username: string) => rows.get(`${platform}:${username}`),
      all: () => [],
      run: (username: string, platform: string, xp: number, level: number) => {
        if (sql.includes('INSERT INTO economy_users')) {
          const key = `${platform}:${username}`
          const existing = rows.get(key)
          const nextXp = sql.includes('COALESCE(economy_users.xp, 0) + excluded.xp')
            ? (existing?.xp || 0) + xp
            : xp
          rows.set(key, { username, platform, xp: nextXp, level, points: existing?.points || 0 })
        }
        return { changes: 1 }
      }
    }),
    transaction: <TArgs extends any[]>(fn: (...args: TArgs) => unknown) => (...args: TArgs) => fn(...args)
  }
  return { db: { getRawDb: () => raw } as any, rows }
}

function makeEvent(type: 'follow' | 'like', id: string, likeCount = 1): AnyStreamEvent {
  const base = {
    id,
    platform: 'tiktok' as const,
    timestamp: new Date(),
    raw: {},
    user: {
      id: 'viewer-1', username: 'viewer', displayName: 'Viewer',
      isModerator: false, isSubscriber: false, isVip: false, badges: []
    }
  }
  if (type === 'like') return { ...base, type, likeCount, totalLikes: likeCount }
  return { ...base, type }
}

describe('LoyaltyService economy bridge safety', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('does not award XP or points twice for a replayed platform event', () => {
    const fake = makeFakeDb()
    const service = new LoyaltyService(fake.db)
    const awards: unknown[] = []
    service.on('xp-awarded', (event) => awards.push(event))

    service.recordEvent(makeEvent('follow', 'follow-1'))
    service.recordEvent(makeEvent('follow', 'follow-1'))

    expect(fake.rows.get('tiktok:viewer')?.xp).toBe(35)
    expect(awards).toHaveLength(1)
  })

  it('does not overwrite synchronous XP while a like batch is pending', () => {
    const fake = makeFakeDb()
    const service = new LoyaltyService(fake.db)

    service.recordEvent(makeEvent('like', 'like-1', 10))
    service.recordEvent(makeEvent('follow', 'follow-2'))
    expect(fake.rows.get('tiktok:viewer')?.xp).toBe(35)

    vi.advanceTimersByTime(1000)

    expect(fake.rows.get('tiktok:viewer')?.xp).toBe(45)
  })
})
