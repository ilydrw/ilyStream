import { create } from 'zustand'
import type { Platform, StreamEvent } from '../../main/platforms/types'

export interface LatestGiftInsight {
  platform: Platform
  username: string
  giftName: string
  count: number
  valueCents: number
  timestamp: number
}

interface LiveInsightsStore {
  startedAt: number | null
  lastEventAt: number | null
  revenueCents: number
  giftCount: number
  subscriptionCount: number
  followCount: number
  shareCount: number
  likeCount: number
  peakViewers: number
  latestGift: LatestGiftInsight | null

  ensureStarted: (timestamp?: unknown) => void
  recordEvent: (event: StreamEvent | any) => void
  recordViewerTotal: (total: number) => void
  reset: () => void
}

const initialState = {
  startedAt: null,
  lastEventAt: null,
  revenueCents: 0,
  giftCount: 0,
  subscriptionCount: 0,
  followCount: 0,
  shareCount: 0,
  likeCount: 0,
  peakViewers: 0,
  latestGift: null
}

export const useLiveInsightsStore = create<LiveInsightsStore>((set) => ({
  ...initialState,

  ensureStarted: (timestamp) =>
    set((state) => {
      if (state.startedAt) return state
      return { startedAt: eventTimeMs(timestamp), lastEventAt: eventTimeMs(timestamp) }
    }),

  recordViewerTotal: (total) =>
    set((state) => ({
      peakViewers: Math.max(state.peakViewers, Math.max(0, Math.floor(total || 0)))
    })),

  recordEvent: (event) =>
    set((state) => {
      const timestamp = eventTimeMs(event?.timestamp)
      const next: Partial<LiveInsightsStore> = {
        startedAt: state.startedAt ?? timestamp,
        lastEventAt: timestamp
      }

      switch (event?.type) {
        case 'gift': {
          if (event.isCombo) return next
          const count = Math.max(1, Math.floor(Number(event.giftCount) || 1))
          const valueCents = Math.max(0, Math.floor(Number(event.monetaryValue) || 0))
          next.giftCount = state.giftCount + count
          next.revenueCents = state.revenueCents + valueCents
          next.latestGift = {
            platform: event.platform,
            username: event.user?.displayName || event.user?.username || 'Unknown',
            giftName: event.giftName || 'Gift',
            count,
            valueCents,
            timestamp
          }
          break
        }
        case 'subscription':
          next.subscriptionCount = state.subscriptionCount + 1
          next.revenueCents = state.revenueCents + Math.max(0, Math.floor(Number(event.monetaryValue) || 0))
          break
        case 'follow':
          next.followCount = state.followCount + 1
          break
        case 'share':
          next.shareCount = state.shareCount + 1
          break
        case 'like':
          next.likeCount = state.likeCount + Math.max(1, Math.floor(Number(event.likeCount) || 1))
          break
        case 'viewer-count':
          next.peakViewers = Math.max(state.peakViewers, Math.max(0, Math.floor(Number(event.count) || 0)))
          break
      }

      return next
    }),

  reset: () => set(initialState)
}))

function eventTimeMs(timestamp: unknown): number {
  if (timestamp instanceof Date) return timestamp.getTime()
  if (typeof timestamp === 'number') return Number.isFinite(timestamp) ? timestamp : Date.now()
  if (typeof timestamp === 'string') {
    const parsed = new Date(timestamp).getTime()
    return Number.isFinite(parsed) ? parsed : Date.now()
  }
  return Date.now()
}
