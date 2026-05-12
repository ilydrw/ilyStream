import { create } from 'zustand'
import type { Platform, ConnectionStatus } from '../../main/platforms/types'

export interface ReconnectInfo {
  attempt: number
  maxAttempts: number
  delayMs: number
}

export interface PlatformEventDiagnostic {
  id: string
  platform: Platform
  type: string
  summary: string
  timestamp: Date
}

interface ConnectionStore {
  statuses: Partial<Record<Platform, ConnectionStatus>>
  viewerCounts: Partial<Record<Platform, number>>
  errors: Partial<Record<Platform, string | null>>
  reconnectInfo: Partial<Record<Platform, ReconnectInfo | null>>
  recentEvents: PlatformEventDiagnostic[]

  setStatus: (platform: Platform, status: ConnectionStatus) => void
  setViewerCount: (platform: Platform, count: number) => void
  setError: (platform: Platform, message: string | null) => void
  setReconnectInfo: (platform: Platform, info: ReconnectInfo | null) => void
  addEventDiagnostic: (event: PlatformEventDiagnostic) => void
}

export const useConnectionStore = create<ConnectionStore>((set) => ({
  statuses: {},
  viewerCounts: {},
  errors: {},
  reconnectInfo: {},
  recentEvents: [],

  setStatus: (platform, status) =>
    set((state) => ({
      statuses: { ...state.statuses, [platform]: status },
      errors:
        status === 'error'
          ? state.errors
          : { ...state.errors, [platform]: null },
      // Clear reconnect info when status changes away from 'connecting'
      reconnectInfo:
        status !== 'connecting'
          ? { ...state.reconnectInfo, [platform]: null }
          : state.reconnectInfo
    })),

  setViewerCount: (platform, count) =>
    set((state) => ({
      viewerCounts: { ...state.viewerCounts, [platform]: count }
    })),

  setError: (platform, message) =>
    set((state) => ({
      errors: { ...state.errors, [platform]: message }
    })),

  setReconnectInfo: (platform, info) =>
    set((state) => ({
      reconnectInfo: { ...state.reconnectInfo, [platform]: info }
    })),

  addEventDiagnostic: (event) =>
    set((state) => ({
      recentEvents: [event, ...state.recentEvents].slice(0, 80)
    }))
}))
