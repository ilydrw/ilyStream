import { create } from 'zustand'
import { isRelayFormattedEchoText, isTikTokLikeSystemText } from '../../shared/chat-event-filter'
import { CHAT_MESSAGE_RETENTION_LIMIT, normalizeChatMessageRetention } from '../../shared/app-settings'

const DUPLICATE_WINDOW_MS = 2_500

/** Feed item kinds mirroring the overlay/DeskThing unified feed (likes stay on dedicated widgets). */
export type ChatFeedKind = 'chat' | 'gift' | 'subscription' | 'follow' | 'raid' | 'share'

export type ChatKindFilter = 'all' | 'chat' | 'events'

export interface ChatMessage {
  id: string
  /** Omitted means 'chat'. Non-chat kinds render as event cards in the unified feed. */
  kind?: ChatFeedKind
  platform: 'tiktok' | 'twitch' | 'youtube' | 'kick'
  username: string
  displayName: string
  message: string
  /** Secondary label for events, e.g. a gift's dollar value. */
  meta?: string
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
  kindFilter: ChatKindFilter
  searchQuery: string

  addMessage: (msg: ChatMessage) => void
  clearMessages: () => void
  setPlatformFilter: (platform: string | null) => void
  setKindFilter: (filter: ChatKindFilter) => void
  setSearchQuery: (query: string) => void
  setMaxMessages: (maxMessages: number) => void
}

export function isChatKind(message: ChatMessage): boolean {
  return (message.kind ?? 'chat') === 'chat'
}

export function matchesKindFilter(message: ChatMessage, filter: ChatKindFilter): boolean {
  if (filter === 'all') return true
  return filter === 'chat' ? isChatKind(message) : !isChatKind(message)
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  maxMessages: CHAT_MESSAGE_RETENTION_LIMIT,
  platformFilter: null,
  kindFilter: 'all',
  searchQuery: '',

  addMessage: (msg) =>
    set((state) => {
      if (isChatKind(msg)) {
        if (msg.platform === 'tiktok' && isTikTokLikeSystemText(msg.message)) {
          return state
        }

        if (isRelayFormattedEchoText(msg.message, msg.platform)) {
          return state
        }
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

  setKindFilter: (filter) => set({ kindFilter: filter }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setMaxMessages: (maxMessages) =>
    set((state) => {
      const normalizedMaxMessages = normalizeChatMessageRetention(maxMessages)
      return {
        maxMessages: normalizedMaxMessages,
        messages: state.messages.slice(-normalizedMaxMessages)
      }
    })
}))

function isDuplicateChatMessage(messages: ChatMessage[], next: ChatMessage): boolean {
  if (messages.some((existing) => existing.id === next.id)) {
    return true
  }

  // Events carry platform-unique ids; text fingerprinting only makes sense for chat.
  if (!isChatKind(next)) {
    return false
  }

  const nextTime = chatMessageTime(next)
  const nextFingerprint = chatMessageFingerprint(next)

  for (let i = messages.length - 1; i >= 0; i--) {
    const existing = messages[i]

    const existingTime = chatMessageTime(existing)
    if (nextTime - existingTime > DUPLICATE_WINDOW_MS) {
      break
    }

    if (!isChatKind(existing)) continue

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
