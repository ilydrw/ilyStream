import { create } from 'zustand'

interface UIState {
  isPageDirty: boolean
  sidebarCollapsed: boolean
  consoleOpen: boolean
  updateStatus: { state: string; version?: string; percent?: number; message?: string } | null
  setPageDirty: (dirty: boolean) => void
  toggleSidebar: () => void
  setConsoleOpen: (open: boolean) => void
  setUpdateStatus: (status: UIState['updateStatus']) => void
}

export const useUIStore = create<UIState>((set) => ({
  isPageDirty: false,
  sidebarCollapsed: false,
  consoleOpen: false,
  updateStatus: null,
  setPageDirty: (dirty) => set({ isPageDirty: dirty }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setConsoleOpen: (open) => set({ consoleOpen: open }),
  setUpdateStatus: (status) => set({ updateStatus: status })
}))
