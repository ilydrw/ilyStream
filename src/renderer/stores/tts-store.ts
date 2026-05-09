import { create } from 'zustand'

export interface TTSQueueItem {
  id: string
  text: string
  username: string
  platform: string
  priority: string
  eventType: string
  enqueuedAt: number
}

interface TTSStore {
  enabled: boolean
  paused: boolean
  queue: TTSQueueItem[]
  currentlySpeaking: string | null

  setEnabled: (enabled: boolean) => void
  setPaused: (paused: boolean) => void
  setQueue: (queue: TTSQueueItem[]) => void
  setCurrentlySpeaking: (id: string | null) => void
}

export const useTTSStore = create<TTSStore>((set) => ({
  enabled: true,
  paused: false,
  queue: [],
  currentlySpeaking: null,

  setEnabled: (enabled) => set({ enabled }),
  setPaused: (paused) => set({ paused }),
  setQueue: (queue) => set({ queue }),
  setCurrentlySpeaking: (id) => set({ currentlySpeaking: id })
}))
