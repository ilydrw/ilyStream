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
  addEntry: (entry: Omit<LogEntry, 'id' | 'timestamp' | 'category' | 'source'>) => void
  clear: () => void
}

const MAX_ENTRIES = 2000

function detectSourceAndCategory(text: string): { source: string; category: string } {
  let source = 'app'
  let category = 'System'

  const t = text.toLowerCase()

  // Hardware
  if (t.includes('[audio]') || t.includes('[sound]') || t.includes('[mic]') || t.includes('[speaker]')) {
    source = 'audio'; category = 'Hardware'
  } else if (t.includes('[obs]') || t.includes('[obs-websocket]')) {
    source = 'obs'; category = 'Hardware'
  } else if (t.includes('[elgato]') || t.includes('[streamdeck]')) {
    source = 'elgato'; category = 'Hardware'
  } else if (t.includes('[govee]') || t.includes('[hue]') || t.includes('[lifx]') || t.includes('[nanoleaf]')) {
    source = 'lights'; category = 'Hardware'
  } else if (t.includes('[deskthing]') || t.includes('[loupedeck]') || t.includes('[razer]') || t.includes('[logitech]')) {
    source = 'peripherals'; category = 'Hardware'
  }
  // Platforms
  else if (t.includes('[tiktok]') || t.includes('[twitch]') || t.includes('[youtube]') || t.includes('[kick]') || t.includes('[discord]')) {
    source = 'social'; category = 'Platforms'
  } else if (t.includes('[tts]') || t.includes('[elevenlabs]') || t.includes('[kokoro]')) {
    source = 'tts'; category = 'Platforms'
  } else if (t.includes('[streaming]') || t.includes('[rtmp]') || t.includes('[broadcast]')) {
    source = 'streaming'; category = 'Platforms'
  } else if (t.includes('[overlay]') || t.includes('[widgets]')) {
    source = 'overlay'; category = 'Platforms'
  }
  // Renderer
  else if (t.includes('[renderer]') || t.includes('[ui]') || t.includes('[nav]') || t.includes('[style]')) {
    source = 'renderer'; category = 'Renderer'
  } else if (t.includes('[vite]') || t.includes('[hmr]')) {
    source = 'dev-server'; category = 'Renderer'
  } else if (t.includes('[preload]')) {
    source = 'preload'; category = 'Renderer'
  }
  // System
  else if (t.includes('[main]') || t.includes('[electron]')) {
    source = 'main'; category = 'System'
  } else if (t.includes('[store]') || t.includes('[state]') || t.includes('[db]') || t.includes('[sqlite]')) {
    source = 'store'; category = 'System'
  } else if (t.includes('[socket]') || t.includes('[ws]') || t.includes('[network]')) {
    source = 'network'; category = 'System'
  }

  return { source, category }
}

export const useLogStore = create<LogStore>((set) => ({
  entries: [],
  addEntry: (entry) => set((state) => {
    const text = entry.args
    const { source, category } = detectSourceAndCategory(text)
    
    const fullEntry: LogEntry = {
      ...entry,
      id: Date.now() + Math.random(),
      timestamp: Date.now(),
      source,
      category
    }

    const next = [...state.entries, fullEntry]
    return {
      entries: next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next
    }
  }),
  clear: () => set({ entries: [] })
}))

// Listen for system logs
if (typeof window !== 'undefined' && (window as any).api) {
  ;(window as any).api.on('system:log', (logData: { level: LogLevel; args: any[] }) => {
    const argsStr = logData.args.map(a => 
      typeof a === 'object' ? JSON.stringify(a) : String(a)
    ).join(' ')
    
    useLogStore.getState().addEntry({
      level: logData.level,
      args: argsStr
    })
  })
}
