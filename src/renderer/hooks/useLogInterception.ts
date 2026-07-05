import { useEffect, useRef } from 'react'
import { useLogStore, LogLevel } from '../stores/log-store'

export function useLogInterception() {
  const addEntry = useLogStore(state => state.addEntry)
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

        const entry = {
          level,
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
