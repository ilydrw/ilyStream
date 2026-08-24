import { describe, expect, it } from 'vitest'
import { CHAT_BOTTOM_THRESHOLD, countAppendedChatMessages, getChatScrollState } from './chat-scroll'

describe('getChatScrollState', () => {
  it('keeps bottom-following active at the Companion threshold', () => {
    expect(
      getChatScrollState({ scrollHeight: 1_000, clientHeight: 400, scrollTop: 600 - CHAT_BOTTOM_THRESHOLD })
    ).toMatchObject({ isPinnedToBottom: true, scrollPercent: 93 })
  })

  it('releases bottom-following once the user scrolls farther than the threshold', () => {
    expect(
      getChatScrollState({ scrollHeight: 1_000, clientHeight: 400, scrollTop: 559 })
    ).toMatchObject({ isPinnedToBottom: false, scrollPercent: 93 })
  })

  it('treats a non-scrollable feed as live and at the top', () => {
    expect(getChatScrollState({ scrollHeight: 320, clientHeight: 400, scrollTop: 0 })).toEqual({
      atTop: true,
      isPinnedToBottom: true,
      scrollPercent: 100
    })
  })
})

describe('countAppendedChatMessages', () => {
  it('detects a new tail when a full retention buffer keeps the same length', () => {
    expect(
      countAppendedChatMessages('message-3', 3, [
        { id: 'message-2' },
        { id: 'message-3' },
        { id: 'message-4' }
      ])
    ).toBe(1)
  })

  it('counts multiple messages appended after the previous tail', () => {
    expect(
      countAppendedChatMessages('message-2', 2, [
        { id: 'message-1' },
        { id: 'message-2' },
        { id: 'message-3' },
        { id: 'message-4' }
      ])
    ).toBe(2)
  })

  it('ignores a feed update whose newest message did not change', () => {
    expect(countAppendedChatMessages('message-3', 3, [{ id: 'message-2' }, { id: 'message-3' }])).toBe(0)
  })
})
