import { create } from 'zustand'

export interface ChatMessage {
  id: string
  platform: 'tiktok' | 'twitch' | 'youtube' | 'kick'
  username: string
  displayName: string
  message: string
  isModerator: boolean
  isSubscriber: boolean
  isFanClub?: boolean
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
  maxMessages: 500,
  platformFilter: null,
  searchQuery: '',

  addMessage: (msg) =>
    set((state) => ({
      messages: [...state.messages, msg].slice(-state.maxMessages)
    })),

  clearMessages: () => set({ messages: [] }),

  setPlatformFilter: (platform) => set({ platformFilter: platform }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setMaxMessages: (maxMessages) =>
    set((state) => ({
      maxMessages,
      messages: state.messages.slice(-maxMessages)
    }))
}))
