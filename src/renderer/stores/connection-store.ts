import { create } from 'zustand'

type Platform = 'tiktok' | 'twitch' | 'youtube' | 'kick'
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

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
  statuses: Record<Platform, ConnectionStatus>
  viewerCounts: Record<Platform, number>
  errors: Record<Platform, string | null>
  reconnectInfo: Record<Platform, ReconnectInfo | null>
  recentEvents: PlatformEventDiagnostic[]

  setStatus: (platform: Platform, status: ConnectionStatus) => void
  setViewerCount: (platform: Platform, count: number) => void
  setError: (platform: Platform, message: string | null) => void
  setReconnectInfo: (platform: Platform, info: ReconnectInfo | null) => void
  addEventDiagnostic: (event: PlatformEventDiagnostic) => void
}

export const useConnectionStore = create<ConnectionStore>((set) => ({
  statuses: {
    tiktok: 'disconnected',
    twitch: 'disconnected',
    youtube: 'disconnected',
    kick: 'disconnected'
  },
  viewerCounts: {
    tiktok: 0,
    twitch: 0,
    youtube: 0,
    kick: 0
  },
  errors: {
    tiktok: null,
    twitch: null,
    youtube: null,
    kick: null
  },
  reconnectInfo: {
    tiktok: null,
    twitch: null,
    youtube: null,
    kick: null
  },
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
