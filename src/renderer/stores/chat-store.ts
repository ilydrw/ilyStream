import { create } from 'zustand'
import { isRelayFormattedEchoText, isTikTokLikeSystemText } from '../../shared/chat-event-filter'

const DUPLICATE_WINDOW_MS = 2_500

export interface ChatMessage {
  id: string
  platform: 'tiktok' | 'twitch' | 'youtube' | 'kick'
  username: string
  displayName: string
  message: string
  isModerator: boolean
  isSubscriber: boolean
  isVip?: boolean
  isFollower?: boolean
  isFanClub?: boolean
  isSuperFan?: boolean
  isTeamMember?: boolean
  badges?: Array<{ id: string; name: string; imageUrl?: string }>
  timestamp: Date
  profilePictureUrl?: string
  isAI?: boolean
  emotes?: Array<{
    id: string
    name: string
    imageUrl: string
    startIndex: number
    endIndex: number
  }>
}

interface ChatStore {
  messages: ChatMessage[]
  maxMessages: number
  platformFilter: string | null
  searchQuery: string

  addMessage: (msg: ChatMessage) => void
  clearMessages: () => void
  setPlatformFilter: (platform: string | null) => void
  setSearchQuery: (query: string) => void
  setMaxMessages: (maxMessages: number) => void
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  maxMessages: 2000,
  platformFilter: null,
  searchQuery: '',

  addMessage: (msg) =>
    set((state) => {
      if (msg.platform === 'tiktok' && isTikTokLikeSystemText(msg.message)) {
        return state
      }

      if (isRelayFormattedEchoText(msg.message, msg.platform)) {
        return state
      }

      if (isDuplicateChatMessage(state.messages, msg)) {
        return state
      }

      return {
        messages: [...state.messages, msg].slice(-state.maxMessages)
      }
    }),

  clearMessages: () => set({ messages: [] }),

  setPlatformFilter: (platform) => set({ platformFilter: platform }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setMaxMessages: (maxMessages) =>
    set((state) => ({
      maxMessages,
      messages: state.messages.slice(-maxMessages)
    }))
}))

function isDuplicateChatMessage(messages: ChatMessage[], next: ChatMessage): boolean {
  if (messages.some((existing) => existing.id === next.id)) {
    return true
  }

  const nextTime = chatMessageTime(next)
  const nextFingerprint = chatMessageFingerprint(next)

  for (let i = messages.length - 1; i >= 0; i--) {
    const existing = messages[i]

    const existingTime = chatMessageTime(existing)
    if (nextTime - existingTime > DUPLICATE_WINDOW_MS) {
      break
    }

    if (
      Math.abs(nextTime - existingTime) <= DUPLICATE_WINDOW_MS &&
      chatMessageFingerprint(existing) === nextFingerprint
    ) {
      return true
    }
  }

  return false
}

function chatMessageFingerprint(message: ChatMessage): string {
  return [
    message.platform,
    message.username.trim().toLowerCase(),
    message.displayName.trim().toLowerCase(),
    message.message.replace(/\s+/g, ' ').trim()
  ].join('\u001f')
}

function chatMessageTime(message: ChatMessage): number {
  const time = message.timestamp instanceof Date
    ? message.timestamp.getTime()
    : new Date(message.timestamp).getTime()
  return Number.isFinite(time) ? time : Date.now()
}
