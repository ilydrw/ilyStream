import { describe, expect, it } from 'vitest'
import { TTSQueue, type TTSQueueItem } from './queue'

let counter = 0

function makeItem(overrides: Partial<TTSQueueItem> = {}): TTSQueueItem {
  const n = counter++
  return {
    id: `item-${n}`,
    text: 'hello world',
    originalText: 'hello world',
    username: `user${n}`,
    platform: 'twitch',
    priority: 'normal',
    eventType: 'chat',
    enqueuedAt: Date.now(),
    ...overrides
  }
}

describe('TTSQueue – peek', () => {
  it('returns the first item without removing it', () => {
    const queue = new TTSQueue()
    const item = makeItem()
    queue.add(item)

    expect(queue.peek()).toMatchObject({ id: item.id })
    expect(queue.length).toBe(1) // item still present after peek
  })

  it('returns undefined on an empty queue', () => {
    const queue = new TTSQueue()
    expect(queue.peek()).toBeUndefined()
  })

  it('reflects priority ordering — urgent item is peeked first', () => {
    const queue = new TTSQueue()
    queue.setPerUserLimit(10)

    const low = makeItem({ username: 'alpha', priority: 'low', id: 'low-item' })
    const urgent = makeItem({ username: 'beta', priority: 'urgent', id: 'urgent-item' })
    queue.add(low)
    queue.add(urgent)

    expect(queue.peek()!.id).toBe('urgent-item')
    expect(queue.length).toBe(2) // both items still in queue
  })

  it('peek does not advance the queue (next() returns the same item)', () => {
    const queue = new TTSQueue()
    const item = makeItem()
    queue.add(item)

    const peeked = queue.peek()
    const dequeued = queue.next()
    expect(peeked?.id).toBe(dequeued?.id)
    expect(queue.length).toBe(0)
  })
})

describe('TTSQueue – stale-user pruning', () => {
  it('pruneStaleEnqueues removes users whose timestamps have all expired', () => {
    const queue = new TTSQueue()
    queue.setMaxSize(100)
    queue.setPerUserLimit(100)
    queue.setPerUserWindow(0) // 0 ms — every timestamp expires immediately

    queue.add(makeItem({ username: 'alice' }))
    queue.add(makeItem({ username: 'bob' }))
    queue.add(makeItem({ username: 'carol' }))

    const removed = queue.pruneStaleEnqueues()
    expect(removed).toBeGreaterThanOrEqual(3)
  })

  it('pruneStaleEnqueues keeps users with timestamps still within the window', () => {
    const queue = new TTSQueue()
    queue.setMaxSize(100)
    queue.setPerUserLimit(100)
    queue.setPerUserWindow(60_000) // 60-second window — freshly added timestamps are safe

    queue.add(makeItem({ username: 'alice' }))
    const removed = queue.pruneStaleEnqueues()
    expect(removed).toBe(0)
  })

  it('auto-prunes when recentUserEnqueues exceeds 500 entries', () => {
    const queue = new TTSQueue()
    queue.setMaxSize(100_000)
    queue.setPerUserLimit(100_000)
    queue.setPerUserWindow(0) // all entries go stale so the prune clears them

    // Add 501 distinct users — each occupies one slot in recentUserEnqueues
    for (let i = 0; i < 501; i++) {
      queue.add(makeItem({ username: `bot${i}`, id: `item-${i}` }))
    }

    // Adding the 502nd user triggers the size check (>500) and auto-prune
    const added = queue.add(makeItem({ username: 'trigger-user', id: 'trigger-item' }))
    expect(added).toBe(true)
  })
})
