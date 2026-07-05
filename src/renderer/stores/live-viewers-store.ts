import { create } from 'zustand'

interface LiveViewersState {
  recordPresence: (data: any) => void
}

export const useLiveViewersStore = create<LiveViewersState>((set) => ({
  recordPresence: () => {},
}))
