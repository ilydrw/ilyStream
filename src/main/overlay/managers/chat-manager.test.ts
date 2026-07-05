import { describe, expect, it, vi } from 'vitest'
import type { ChatEvent, LikeEvent } from '../../platforms/types'
import { ChatManager } from './chat-manager'

function createChatEvent(overrides: Partial<ChatEvent> = {}): ChatEvent {
  return {
    id: 'chat-1',
    platform: 'tiktok',
    timestamp: new Date('2026-05-18T09:00:00.000Z'),
    type: 'chat',
    raw: {},
    message: 'hello chat',
    emotes: [],
    user: {
      id: 'user-1',
      username: 'stream_friend',
      displayName: 'Stream Friend',
      isModerator: false,
      isSubscriber: false,
      isVip: false,
      badges: []
    },
    ...overrides
  }
}

function createLikeEvent(): LikeEvent {
  return {
    id: 'like-1',
    platform: 'tiktok',
    timestamp: new Date('2026-05-18T09:00:01.000Z'),
    type: 'like',
    raw: {},
    likeCount: 25,
    totalLikes: 250,
    user: {
      id: 'user-2',
      username: 'like_friend',
      displayName: 'Like Friend',
      isModerator: false,
      isSubscriber: false,
      isVip: false,
      badges: []
    }
  }
}

describe('ChatManager', () => {
  it('does not append like events to chat feeds', () => {
    const sse = { broadcast: vi.fn() }
    const manager = new ChatManager(sse as any)

    manager.handleEvent(createLikeEvent())

    expect(manager.getHistory()).toEqual([])
    expect(sse.broadcast).not.toHaveBeenCalled()
  })

  it('still appends real chat messages to chat feeds', () => {
    const sse = { broadcast: vi.fn() }
    const manager = new ChatManager(sse as any)

    manager.handleEvent(createChatEvent())

    expect(manager.getHistory()).toEqual([
      expect.objectContaining({
        kind: 'chat',
        message: 'hello chat'
      })
    ])
    expect(sse.broadcast).toHaveBeenCalledWith(
      'chat',
      expect.objectContaining({
        type: 'append',
        payload: expect.objectContaining({ kind: 'chat' })
      })
    )
    expect(sse.broadcast).toHaveBeenCalledWith(
      'chat-unified',
      expect.objectContaining({
        type: 'append',
        payload: expect.objectContaining({ kind: 'chat' })
      })
    )
  })

  it('does not append duplicate chat events to chat feeds', () => {
    const sse = { broadcast: vi.fn() }
    const manager = new ChatManager(sse as any)

    manager.handleEvent(createChatEvent({ id: 'chat-1' }))
    manager.handleEvent(createChatEvent({ id: 'chat-1', message: 'same id replay' }))
    manager.handleEvent(createChatEvent({
      id: 'chat-2',
      timestamp: new Date('2026-05-18T09:00:01.000Z')
    }))

    expect(manager.getHistory()).toHaveLength(1)
    expect(sse.broadcast).toHaveBeenCalledTimes(2)
  })

  it('allows repeated chat text outside the duplicate window', () => {
    const sse = { broadcast: vi.fn() }
    const manager = new ChatManager(sse as any)

    manager.handleEvent(createChatEvent({ id: 'chat-1' }))
    manager.handleEvent(createChatEvent({
      id: 'chat-2',
      timestamp: new Date('2026-05-18T09:00:03.000Z')
    }))

    expect(manager.getHistory()).toHaveLength(2)
  })
})
