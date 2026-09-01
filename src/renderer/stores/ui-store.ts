import { create } from 'zustand'

interface UIState {
  sidebarCollapsed: boolean
  consoleOpen: boolean
  updateStatus: { state: string; version?: string; percent?: number; message?: string } | null
  toggleSidebar: () => void
  setConsoleOpen: (open: boolean) => void
  setUpdateStatus: (status: UIState['updateStatus']) => void
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  consoleOpen: false,
  updateStatus: null,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setConsoleOpen: (open) => set({ consoleOpen: open }),
  setUpdateStatus: (status) => set({ updateStatus: status })
}))
