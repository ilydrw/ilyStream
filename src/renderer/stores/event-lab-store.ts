import { create } from 'zustand'
import {
  createReplayRecording,
  createReplaySession,
  loadReplaySessions,
  replayableEntryToEvent,
  saveReplaySessions,
  type ActiveReplayState,
  type EventLabEntryKind,
  type EventReplayRecording,
  type EventReplaySession
} from '../lib/event-replay'

export type { EventLabEntryKind } from '../lib/event-replay'

export interface EventLabEntry {
  id: string
  kind: EventLabEntryKind
  title: string
  detail: string
  timestamp: string
  platform?: string
  eventType?: string
  channel?: string
  payload?: unknown
  replayable?: boolean
}

interface EventLabStore {
  entries: EventLabEntry[]
  recording: EventReplayRecording | null
  replaySessions: EventReplaySession[]
  activeReplay: ActiveReplayState | null
  addEntry: (entry: EventLabEntry) => void
  clear: () => void
  startRecording: (name?: string) => void
  stopRecording: () => EventReplaySession | null
  discardRecording: () => void
  deleteReplaySession: (sessionId: string) => void
  importReplaySession: (session: EventReplaySession) => void
  updateReplaySession: (sessionId: string, updates: Partial<Pick<EventReplaySession, 'name' | 'description'>>) => void
  setActiveReplay: (state: ActiveReplayState | null) => void
}

export const useEventLabStore = create<EventLabStore>((set, get) => ({
  entries: [],
  recording: null,
  replaySessions: loadReplaySessions(),
  activeReplay: null,
  addEntry: (entry) =>
    set((state) => {
      let recording = state.recording

      if (recording && !state.activeReplay?.running) {
        const replayEvent = replayableEntryToEvent(
          entry,
          recording.startedAt,
          Date.now() - Date.parse(recording.startedAt)
        )
        if (replayEvent) {
          recording = {
            ...recording,
            events: [...recording.events, replayEvent].slice(0, 500)
          }
        }
      }

      return {
        recording,
        entries: [entry, ...state.entries.filter((item) => item.id !== entry.id)].slice(0, 240)
      }
    }),
  clear: () => set({ entries: [] }),
  startRecording: (name) => set({ recording: createReplayRecording(name) }),
  stopRecording: () => {
    const recording = get().recording
    if (!recording) return null

    set({ recording: null })
    if (recording.events.length === 0) return null

    const session = createReplaySession(recording.events, {
      name: recording.name,
      createdAt: recording.startedAt
    })
    const sessions = [session, ...get().replaySessions.filter((item) => item.id !== session.id)].slice(0, 24)
    saveReplaySessions(sessions)
    set({ replaySessions: sessions })
    return session
  },
  discardRecording: () => set({ recording: null }),
  deleteReplaySession: (sessionId) => {
    const sessions = get().replaySessions.filter((session) => session.id !== sessionId)
    saveReplaySessions(sessions)
    set({ replaySessions: sessions })
  },
  importReplaySession: (session) => {
    const sessions = [session, ...get().replaySessions.filter((item) => item.id !== session.id)].slice(0, 24)
    saveReplaySessions(sessions)
    set({ replaySessions: sessions })
  },
  updateReplaySession: (sessionId, updates) => {
    const sessions = get().replaySessions.map((session) => {
      if (session.id !== sessionId) return session
      return {
        ...session,
        name: updates.name?.trim() || session.name,
        description: updates.description?.trim() ?? session.description,
        updatedAt: new Date().toISOString()
      }
    })
    saveReplaySessions(sessions)
    set({ replaySessions: sessions })
  },
  setActiveReplay: (activeReplay) => set({ activeReplay })
}))

export function createEventLabId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function summarizeEventForLab(event: any): { title: string; detail: string } {
  const name = event?.user?.displayName || event?.user?.username || 'System'

  switch (event?.type) {
    case 'chat':
      return { title: `${name} chatted`, detail: String(event.message ?? '').slice(0, 180) }
    case 'gift':
      return {
        title: `${name} sent a gift`,
        detail: `${event.giftName ?? 'Gift'} x${event.giftCount ?? 1}`
      }
    case 'subscription':
      return {
        title: `${name} subscribed`,
        detail: `${event.tier ?? 'Subscription'} for ${event.months ?? 1} month(s)`
      }
    case 'follow':
      return { title: `${name} followed`, detail: 'Follow event routed through the stream pipeline' }
    case 'raid':
      return { title: `${name} raided`, detail: `${event.viewerCount ?? 0} viewer(s)` }
    case 'like':
      return {
        title: `${name} sent likes`,
        detail: `${event.likeCount ?? 1} like(s), ${event.totalLikes ?? 0} total reported`
      }
    case 'share':
      return { title: `${name} shared`, detail: 'Share event routed through overlays and triggers' }
    case 'join':
      return { title: `${name} joined`, detail: 'Join/fan event received' }
    case 'viewer-count':
      return { title: 'Viewer count updated', detail: `${event.count ?? 0} viewer(s)` }
    default:
      return {
        title: `${name} triggered ${event?.type ?? 'event'}`,
        detail: 'Stream event routed through the app'
      }
  }
}
