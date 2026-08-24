import { describe, expect, it } from 'vitest'
import { SSEManager } from './sse-manager'

describe('SSEManager history', () => {
  it('pages unseen events from oldest to newest without advancing past omissions', () => {
    const manager = new SSEManager()

    for (let index = 1; index <= 5; index += 1) {
      manager.broadcast('chat', { index })
    }

    expect(manager.getEventsSince('chat', 0, 2).map((entry) => entry.id)).toEqual([1, 2])
    expect(manager.getEventsSince('chat', 2, 2).map((entry) => entry.id)).toEqual([3, 4])
    expect(manager.getEventsSince('chat', 4, 2).map((entry) => entry.id)).toEqual([5])
  })
})
