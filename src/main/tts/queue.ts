import type { VoiceProfile } from './voice-profiles'

export type TTSPriority = 'urgent' | 'high' | 'normal' | 'low'

const PRIORITY_ORDER: Record<TTSPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3
}

export interface TTSQueueItem {
  id: string
  text: string
  originalText: string
  username: string
  platform: string
  priority: TTSPriority
  voiceProfileId?: string
  voiceOverride?: VoiceProfile
  eventType: string
  enqueuedAt: number
}

export class TTSQueue {
  private items: TTSQueueItem[] = []
  private maxSize = 20
  private perUserLimit = 3
  private perUserWindow = 30_000 // 30 seconds
  private recentUserEnqueues: Map<string, number[]> = new Map()

  /** Add an item to the priority queue. Returns false if rejected. */
  add(item: TTSQueueItem): boolean {
    // Sweep stale users when the tracking map grows large to prevent unbounded memory use.
    // Users whose entire window has expired are safe to evict.
    if (this.recentUserEnqueues.size > 500) {
      this.pruneStaleEnqueues()
    }

    // Per-user rate limit
    const now = Date.now()
    const recentTimestamps = this.getRecentUserTimestamps(item.username, now)
    const userCount = recentTimestamps.length

    if (item.eventType !== 'test' && userCount >= this.perUserLimit) {
      return false
    }

    // Max queue size - drop oldest low-priority items
    if (this.items.length >= this.maxSize) {
      const lowestIdx = this.findLowestPriorityIndex()
      if (
        lowestIdx !== -1 &&
        PRIORITY_ORDER[this.items[lowestIdx].priority] > PRIORITY_ORDER[item.priority]
      ) {
        this.items.splice(lowestIdx, 1)
      } else {
        return false
      }
    }

    // Insert in priority order (stable: same priority preserves FIFO)
    const insertIdx = this.items.findIndex(
      (i) => PRIORITY_ORDER[i.priority] > PRIORITY_ORDER[item.priority]
    )

    if (insertIdx === -1) {
      this.items.push(item)
    } else {
      this.items.splice(insertIdx, 0, item)
    }

    if (item.eventType !== 'test') {
      recentTimestamps.push(now)
      this.recentUserEnqueues.set(item.username, recentTimestamps)
    }

    return true
  }

  /** Get and remove the next item */
  next(): TTSQueueItem | undefined {
    return this.items.shift()
  }

  /**
   * Peek at the item that will be dequeued next, without removing it.
   * Used to emit lookahead prefetch signals.
   */
  peek(): TTSQueueItem | undefined {
    return this.items[0]
  }

  /** Get all items (read-only snapshot) */
  getAll(): TTSQueueItem[] {
    return [...this.items]
  }

  /** Remove a specific item */
  remove(id: string): boolean {
    const idx = this.items.findIndex((i) => i.id === id)
    if (idx === -1) return false
    this.items.splice(idx, 1)
    return true
  }

  /** Clear all items */
  clear(): void {
    this.items = []
  }

  /** Get queue length */
  get length(): number {
    return this.items.length
  }

  /** Configure limits */
  setMaxSize(size: number): void {
    this.maxSize = size
  }

  setPerUserLimit(limit: number): void {
    this.perUserLimit = limit
  }

  setPerUserWindow(ms: number): void {
    this.perUserWindow = ms
  }

  /**
   * Remove all entries in recentUserEnqueues whose timestamps have all expired.
   * Called automatically when the map exceeds 500 entries; also available for testing.
   * Returns the number of users removed.
   */
  pruneStaleEnqueues(): number {
    const now = Date.now()
    let removed = 0
    for (const [username, timestamps] of this.recentUserEnqueues) {
      const recent = timestamps.filter((t) => now - t < this.perUserWindow)
      if (recent.length === 0) {
        this.recentUserEnqueues.delete(username)
        removed++
      } else {
        this.recentUserEnqueues.set(username, recent)
      }
    }
    return removed
  }

  private findLowestPriorityIndex(): number {
    let lowestIdx = -1
    let lowestPriority = -1

    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = PRIORITY_ORDER[this.items[i].priority]
      if (p > lowestPriority) {
        lowestPriority = p
        lowestIdx = i
      }
    }

    return lowestIdx
  }

  private getRecentUserTimestamps(username: string, now: number): number[] {
    const timestamps = this.recentUserEnqueues.get(username) ?? []
    const recent = timestamps.filter((timestamp) => now - timestamp < this.perUserWindow)

    if (recent.length === 0) {
      this.recentUserEnqueues.delete(username)
    } else {
      this.recentUserEnqueues.set(username, recent)
    }

    return recent
  }
}
