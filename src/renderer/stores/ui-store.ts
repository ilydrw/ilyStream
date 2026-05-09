import { create } from 'zustand'

interface UIState {
  isPageDirty: boolean
  sidebarCollapsed: boolean
  setPageDirty: (dirty: boolean) => void
  toggleSidebar: () => void
}

export const useUIStore = create<UIState>((set) => ({
  isPageDirty: false,
  sidebarCollapsed: false,
  setPageDirty: (dirty) => set({ isPageDirty: dirty }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }))
}))
