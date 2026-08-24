import { create } from 'zustand'
import type { Platform, ConnectionStatus } from '../../main/platforms/types'

export interface ReconnectInfo {
  attempt: number
  maxAttempts: number
  delayMs: number
  /** Human-friendly reason for waiting, e.g. "you're not live yet". */
  reason?: string
}

export interface PlatformEventDiagnostic {
  id: string
  platform: Platform
  type: string
  summary: string
  timestamp: Date
  simulated: boolean
}

export interface PlatformProfileHealth {
  state: 'idle' | 'healthy' | 'degraded'
  lastSuccessAt?: number
  lastFailureAt?: number
  retryAt?: number
  error?: string
}

interface ConnectionStore {
  statuses: Partial<Record<Platform, ConnectionStatus>>
  viewerCounts: Partial<Record<Platform, number>>
  errors: Partial<Record<Platform, string | null>>
  reconnectInfo: Partial<Record<Platform, ReconnectInfo | null>>
  profileHealth: Partial<Record<Platform, PlatformProfileHealth>>
  recentEvents: PlatformEventDiagnostic[]

  setStatus: (platform: Platform, status: ConnectionStatus) => void
  setViewerCount: (platform: Platform, count: number) => void
  setError: (platform: Platform, message: string | null) => void
  setReconnectInfo: (platform: Platform, info: ReconnectInfo | null) => void
  setProfileHealth: (platform: Platform, health: PlatformProfileHealth) => void
  addEventDiagnostic: (event: PlatformEventDiagnostic) => void
}

export const useConnectionStore = create<ConnectionStore>((set) => ({
  statuses: {},
  viewerCounts: {},
  errors: {},
  reconnectInfo: {},
  profileHealth: {},
  recentEvents: [],

  setStatus: (platform, status) =>
    set((state) => {
      const viewerCounts = { ...state.viewerCounts }
      const profileHealth = { ...state.profileHealth }
      if (status !== 'connected') delete viewerCounts[platform]
      if (status !== 'connected') delete profileHealth[platform]

      return {
        statuses: { ...state.statuses, [platform]: status },
        viewerCounts,
        profileHealth,
        errors:
          status === 'error'
            ? state.errors
            : { ...state.errors, [platform]: null },
        // Clear reconnect info when status changes away from 'connecting'
        reconnectInfo:
          status !== 'connecting'
            ? { ...state.reconnectInfo, [platform]: null }
            : state.reconnectInfo
      }
    }),

  setViewerCount: (platform, count) =>
    set((state) => ({
      viewerCounts: {
        ...state.viewerCounts,
        [platform]: Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
      }
    })),

  setError: (platform, message) =>
    set((state) => ({
      errors: { ...state.errors, [platform]: message }
    })),

  setReconnectInfo: (platform, info) =>
    set((state) => ({
      reconnectInfo: { ...state.reconnectInfo, [platform]: info }
    })),

  setProfileHealth: (platform, health) =>
    set((state) => ({
      profileHealth: { ...state.profileHealth, [platform]: health }
    })),

  addEventDiagnostic: (event) =>
    set((state) => ({
      recentEvents: [event, ...state.recentEvents].slice(0, 80)
    }))
}))
