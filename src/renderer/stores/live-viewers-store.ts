import { create } from 'zustand'
import type { Platform } from '../../main/platforms/types'

/**
 * A viewer we've seen activity from in the current live session. We can't get a
 * true "who's watching right now" list across platforms (TikTok never sends
 * leave events, etc.), so presence is activity-based: anyone who fired an event
 * (join, chat, gift, like, follow, share) is considered present, and they age
 * out after PRESENCE_TTL_MS of silence — same model TikTok Live Studio's viewer
 * list effectively uses.
 */
export interface ViewerPresence {
  id: string // `${platform}:${username}`
  platform: Platform
  username: string
  displayName: string
  profilePictureUrl?: string
  isModerator?: boolean
  isSubscriber?: boolean
  isVip?: boolean
  isFanClub?: boolean
  isSuperFan?: boolean
  badges?: Array<{ id: string; name: string; imageUrl?: string }>
  firstSeenAt: number
  lastSeenAt: number
  lastAction: string
}

/** How long since last activity before a viewer drops off the present list. */
export const PRESENCE_TTL_MS = 5 * 60 * 1000

export interface RecordPresenceInput {
  platform: Platform
  username: string
  displayName?: string
  profilePictureUrl?: string
  isModerator?: boolean
  isSubscriber?: boolean
  isVip?: boolean
  isFanClub?: boolean
  isSuperFan?: boolean
  badges?: Array<{ id: string; name: string; imageUrl?: string }>
  action: string
}

interface LiveViewersStore {
  viewers: Record<string, ViewerPresence>
  recordPresence: (input: RecordPresenceInput) => void
  prune: (ttlMs?: number) => void
  clear: () => void
}

export const useLiveViewersStore = create<LiveViewersStore>((set) => ({
  viewers: {},

  recordPresence: (input) =>
    set((state) => {
      const username = (input.username || '').trim()
      if (!username) return state
      const id = `${input.platform}:${username.toLowerCase()}`
      const existing = state.viewers[id]
      const now = Date.now()

      // Throttle churn from high-frequency events (TikTok like spam): if we just
      // saw this viewer and they bring nothing new, skip the state update so the
      // panel doesn't re-render on every like.
      if (existing && now - existing.lastSeenAt < 2000) {
        const gainsRole =
          (input.isModerator && !existing.isModerator) ||
          (input.isSubscriber && !existing.isSubscriber) ||
          (input.isVip && !existing.isVip) ||
          (input.isFanClub && !existing.isFanClub) ||
          (input.isSuperFan && !existing.isSuperFan)
        const gainsAvatar = Boolean(input.profilePictureUrl && !existing.profilePictureUrl)
        if (!gainsRole && !gainsAvatar) return state
      }

      const next: ViewerPresence = {
        id,
        platform: input.platform,
        username,
        displayName: input.displayName?.trim() || existing?.displayName || username,
        profilePictureUrl: input.profilePictureUrl || existing?.profilePictureUrl,
        // Role flags are sticky — once we've seen someone is a mod/sub/fan we
        // keep that for the session even if a later event omits it.
        isModerator: Boolean(input.isModerator || existing?.isModerator),
        isSubscriber: Boolean(input.isSubscriber || existing?.isSubscriber),
        isVip: Boolean(input.isVip || existing?.isVip),
        isFanClub: Boolean(input.isFanClub || existing?.isFanClub),
        isSuperFan: Boolean(input.isSuperFan || existing?.isSuperFan),
        badges: input.badges?.length ? input.badges : existing?.badges,
        firstSeenAt: existing?.firstSeenAt ?? now,
        lastSeenAt: now,
        lastAction: input.action
      }

      return { viewers: { ...state.viewers, [id]: next } }
    }),

  prune: (ttlMs = PRESENCE_TTL_MS) =>
    set((state) => {
      const cutoff = Date.now() - ttlMs
      let changed = false
      const next: Record<string, ViewerPresence> = {}
      for (const [id, viewer] of Object.entries(state.viewers)) {
        if (viewer.lastSeenAt >= cutoff) next[id] = viewer
        else changed = true
      }
      return changed ? { viewers: next } : state
    }),

  clear: () => set({ viewers: {} })
}))
