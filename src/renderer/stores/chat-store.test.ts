import { beforeEach, describe, expect, it } from 'vitest'
import { CHAT_MESSAGE_RETENTION_LIMIT } from '../../shared/app-settings'
import { useChatStore, type ChatMessage } from './chat-store'

describe('chat store retention', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      maxMessages: CHAT_MESSAGE_RETENTION_LIMIT,
      platformFilter: null,
      searchQuery: ''
    })
  })

  it('keeps the latest 150 messages and removes the oldest even when configured higher', () => {
    useChatStore.getState().setMaxMessages(2000)

    for (let index = 0; index <= CHAT_MESSAGE_RETENTION_LIMIT; index++) {
      useChatStore.getState().addMessage(createMessage(index))
    }

    const { messages, maxMessages } = useChatStore.getState()

    expect(maxMessages).toBe(150)
    expect(messages).toHaveLength(150)
    expect(messages[0].id).toBe('message-1')
    expect(messages.at(-1)?.id).toBe('message-150')
  })
})

function createMessage(index: number): ChatMessage {
  return {
    id: `message-${index}`,
    platform: 'twitch',
    username: `viewer-${index}`,
    displayName: `Viewer ${index}`,
    message: `Message ${index}`,
    isModerator: false,
    isSubscriber: false,
    timestamp: new Date(index)
  }
}
