import { create } from 'zustand'
import { isTikTokLikeSystemText } from '../../shared/chat-event-filter'

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

      if (state.messages.some((existing) => existing.id === msg.id)) {
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
