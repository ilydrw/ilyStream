import { create } from 'zustand'

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug'

export interface LogEntry {
  id: number
  timestamp: number
  level: LogLevel
  source: string 
  category: string
  args: string
}

interface LogStore {
  entries: LogEntry[]
  addEntry: (entry: LogEntry) => void
  clear: () => void
}

const MAX_ENTRIES = 2000

export const useLogStore = create<LogStore>((set) => ({
  entries: [],
  addEntry: (entry) => set((state) => {
    const next = [...state.entries, entry]
    return {
      entries: next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next
    }
  }),
  clear: () => set({ entries: [] })
}))
