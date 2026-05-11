import { create } from 'zustand'

interface UIState {
  isPageDirty: boolean
  sidebarCollapsed: boolean
  updateStatus: { state: string; version?: string; percent?: number; message?: string } | null
  setPageDirty: (dirty: boolean) => void
  toggleSidebar: () => void
  setUpdateStatus: (status: UIState['updateStatus']) => void
}

export const useUIStore = create<UIState>((set) => ({
  isPageDirty: false,
  sidebarCollapsed: false,
  updateStatus: null,
  setPageDirty: (dirty) => set({ isPageDirty: dirty }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setUpdateStatus: (status) => set({ updateStatus: status })
}))
