import { useEffect, useRef } from 'react'
import { useLogStore, LogLevel, LogEntry } from '../stores/log-store'

const CATEGORIES = ['Renderer', 'Platforms', 'Hardware', 'System'] as const
type Category = (typeof CATEGORIES)[number]

function detectSourceAndCategory(text: string): { source: string; category: Category } {
  let source = 'app'
  let category: Category = 'System'

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

export function useLogInterception() {
  const addEntry = useLogStore(state => state.addEntry)
  const entryIdRef = useRef(0)
  const interceptedRef = useRef(false)

  useEffect(() => {
    if (interceptedRef.current) return
    interceptedRef.current = true

    const originals: Record<LogLevel, (...args: any[]) => void> = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
    }

    let isProcessing = false
    const createInterceptor = (level: LogLevel) => (...args: any[]) => {
      // Call original first so it shows in DevTools
      originals[level](...args)

      if (isProcessing) return
      isProcessing = true

      try {
        const text = args.map(a => {
          if (typeof a === 'string') return a
          try { return JSON.stringify(a, null, 2) } catch { return String(a) }
        }).join(' ')

        const { source, category } = detectSourceAndCategory(text)
        const entry: LogEntry = {
          id: ++entryIdRef.current,
          timestamp: Date.now(),
          level,
          source,
          category,
          args: text,
        }

        // Defer the state update to avoid "Cannot update a component while rendering"
        // and potential infinite loops if a log happens during render.
        queueMicrotask(() => {
          addEntry(entry)
        })
      } finally {
        isProcessing = false
      }
    }

    console.log = createInterceptor('log')
    console.info = createInterceptor('info')
    console.warn = createInterceptor('warn')
    console.error = createInterceptor('error')
    console.debug = createInterceptor('debug')

    return () => {
      // We actually don't want to revert this during the app lifetime
      // but if the component unmounts (which App shouldn't), we do.
      // console.log = originals.log
      // console.info = originals.info
      // console.warn = originals.warn
      // console.error = originals.error
      // console.debug = originals.debug
    }
  }, [addEntry])
}
