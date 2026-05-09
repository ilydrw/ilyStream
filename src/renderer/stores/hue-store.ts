import { create } from 'zustand'

export interface HueLight {
  id: string
  name: string
  on: boolean
  reachable: boolean
  color?: string
}

export interface HueBridge {
  id: string
  internalipaddress: string
}

export interface HueGroup {
  id: string
  name: string
  lights: string[]
  type: string
  class?: string
}

interface HueStore {
  bridgeIp: string | null
  username: string | null
  lights: HueLight[]
  groups: HueGroup[]
  isConnected: boolean
  isDiscovering: boolean
  isSafetyLocked: boolean
  selectedLightIds: string[]
  
  discoverBridges: () => Promise<HueBridge[]>
  setUsername: (username: string) => Promise<void>
  connect: (ip: string, username: string) => Promise<boolean>
  setSafetyLock: (locked: boolean) => Promise<void>
  toggleLightSelection: (lightId: string) => Promise<void>
  fetchLights: () => Promise<void>
  fetchGroups: () => Promise<void>
  triggerFlash: (color?: { r: number, g: number, b: number }) => Promise<void>
  triggerStrobe: (durationMs: number) => Promise<void>
  syncStatus: () => Promise<void>
}

export const useHueStore = create<HueStore>((set, get) => ({
  bridgeIp: null,
  username: null,
  lights: [],
  groups: [],
  isConnected: false,
  isDiscovering: false,
  isSafetyLocked: true,
  selectedLightIds: [],

  discoverBridges: async () => {
    if (!window.api?.hue) {
      throw new Error('Hardware API not initialized. Please restart the IlyStream application.')
    }
    set({ isDiscovering: true })
    try {
      return await window.api.hue.discoverBridges()
    } finally {
      set({ isDiscovering: false })
    }
  },

  setUsername: async (username: string) => {
    if (window.api?.hue) {
      await window.api.hue.saveUsername(username)
    }
    set({ username })
  },

  connect: async (ip, username) => {
    if (!window.api?.hue) {
      throw new Error('Hardware API not initialized. Please restart the IlyStream application.')
    }
    const success = await window.api.hue.connect(ip, username)
    if (success) {
      const status = await window.api.hue.getStatus()
      set({ 
        bridgeIp: status.bridgeIp, 
        username: status.username, 
        isConnected: status.isConnected,
        isSafetyLocked: status.isSafetyLocked,
        selectedLightIds: status.selectedLightIds || []
      })
      await get().fetchLights()
    }
    return success
  },

  setSafetyLock: async (locked) => {
    if (!window.api?.hue) return
    await window.api.hue.setSafetyLock(locked)
    set({ isSafetyLocked: locked })
  },

  toggleLightSelection: async (lightId) => {
    if (!window.api?.hue) return
    const { selectedLightIds } = get()
    const newSelection = selectedLightIds.includes(lightId)
      ? selectedLightIds.filter(id => id !== lightId)
      : [...selectedLightIds, lightId]
    
    await window.api.hue.setSelectedLights(newSelection)
    set({ selectedLightIds: newSelection })
  },

  fetchLights: async () => {
    if (!window.api?.hue) return
    const lights = await window.api.hue.getLights()
    set({ lights })
    // Also fetch groups whenever lights are fetched to keep them in sync
    await get().fetchGroups()
  },

  fetchGroups: async () => {
    if (!window.api?.hue) return
    const groups = await window.api.hue.getGroups()
    set({ groups })
  },

  triggerFlash: async (color) => {
    if (!window.api?.hue) return
    await window.api.hue.triggerFlash(color)
  },

  triggerStrobe: async (durationMs) => {
    if (!window.api?.hue) return
    await window.api.hue.triggerStrobe(durationMs)
  },

  syncStatus: async () => {
    if (!window.api?.hue) return
    const status = await window.api.hue.getStatus()
    set({ 
      bridgeIp: status.bridgeIp, 
      username: status.username, 
      isConnected: status.isConnected,
      isSafetyLocked: status.isSafetyLocked,
      selectedLightIds: status.selectedLightIds || []
    })
    if (status.isConnected) {
      await get().fetchLights()
    }
  }
}))
