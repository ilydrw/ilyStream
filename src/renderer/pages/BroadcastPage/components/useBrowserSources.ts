import { useEffect, useRef } from 'react'
import type { StudioLayer } from '../../../../shared/studio'
import { resolveLayerLayout } from '../../../../shared/studio'
import { resolveBrowserSourceUrl, resolveBrowserCaptureSettings, getBrowserFrameSurface } from './CanvasEditor.utils'
import type { BrowserFrameSurface } from './CanvasEditor.types'

interface BrowserSourceOptions {
  layers: StudioLayer[]
  aspectRatio: string
  overlayPort: number
  browserFrameCache: React.MutableRefObject<Record<string, BrowserFrameSurface>>
}

export function useBrowserSources(options: BrowserSourceOptions) {
  const { layers, aspectRatio, overlayPort, browserFrameCache } = options
  const browserWorkerRef = useRef<Worker | null>(null)
  const browserWorkerBusy = useRef<Record<string, boolean>>({})
  const latestBrowserBitmaps = useRef<Record<string, any>>({})
  const browserBlankFrames = useRef<Record<string, number>>({})
  const capturedBrowserSourceIds = useRef<Set<string>>(new Set())
  const lastBrowserConfigs = useRef<Record<string, string>>({})

  useEffect(() => {
    const worker = new Worker(new URL('../../../workers/browser-frame.worker.ts', import.meta.url))
    browserWorkerRef.current = worker

    worker.onmessage = (event) => {
      const { id, bitmap, width, height, isBlank } = event.data
      browserWorkerBusy.current[id] = false

      // Disable blank frame optimization for now as it causes mostly-transparent widgets to stop updating
      /*
      if (isBlank && browserFrameCache.current[id]?.lastUpdateAt) {
        const blanks = (browserBlankFrames.current[id] || 0) + 1
        browserBlankFrames.current[id] = blanks
        if (blanks < 30) {
          try { bitmap?.close?.() } catch {}
          const latest = latestBrowserBitmaps.current[id]
          if (latest) {
            delete latestBrowserBitmaps.current[id]
            browserWorkerBusy.current[id] = true
            postWorkerFrame(worker, { id: latest.id, source: latest.bitmap, width: latest.width, height: latest.height }, latest.bitmap)
          }
          return
        }
      }
      */

      browserBlankFrames.current[id] = 0
      const surface = getBrowserFrameSurface(browserFrameCache.current, id, width, height)
      try { surface.bitmap?.close() } catch {}
      surface.bitmap = bitmap
      surface.lastUpdateAt = performance.now()

      const latest = latestBrowserBitmaps.current[id]
      if (latest) {
        delete latestBrowserBitmaps.current[id]
        browserWorkerBusy.current[id] = true
        postWorkerFrame(worker, { id: latest.id, source: latest.bitmap, width: latest.width, height: latest.height }, latest.bitmap)
      }
    }

    const onIpcFrame = (payload: any) => {
      const { id, bitmap, width, height } = payload

      if (browserWorkerBusy.current[id]) {
        try { latestBrowserBitmaps.current[id]?.bitmap?.close?.() } catch {}
        latestBrowserBitmaps.current[id] = payload
      } else {
        browserWorkerBusy.current[id] = true
        postWorkerFrame(worker, { id, source: bitmap, width, height }, bitmap)
      }
    }

    const unsub = window.api?.on?.('browser-source:frame', onIpcFrame)
    return () => { unsub?.(); worker.terminate() }
  }, [])

  useEffect(() => {
    if (!window.api?.studio) return
    const activeIds = new Set<string>()

    for (const layer of layers) {
      if (layer.type !== 'widget' && layer.type !== 'browser') continue
      activeIds.add(layer.id)
      const layout = resolveLayerLayout(layer, aspectRatio as any)
      const url = resolveBrowserSourceUrl(layer, overlayPort)
      const capture = resolveBrowserCaptureSettings(layer, layout.width, layout.height)
      const config = { id: layer.id, url, ...capture }
      const sig = JSON.stringify(config)

      if (capturedBrowserSourceIds.current.has(layer.id)) {
        if (lastBrowserConfigs.current[layer.id] !== sig) {
          lastBrowserConfigs.current[layer.id] = sig
          void window.api.studio.updateBrowserSource(config)
        }
      } else {
        capturedBrowserSourceIds.current.add(layer.id)
        lastBrowserConfigs.current[layer.id] = sig
        void window.api.studio.startBrowserSource(config)
      }
    }

    for (const id of Array.from(capturedBrowserSourceIds.current)) {
      if (!activeIds.has(id)) {
        capturedBrowserSourceIds.current.delete(id)
        void window.api.studio.stopBrowserSource(id)
      }
    }
  }, [layers, aspectRatio, overlayPort])
}

function postWorkerFrame(worker: Worker, message: unknown, source: unknown): void {
  const transfer = getFrameTransferList(source)
  try {
    worker.postMessage(message, transfer)
  } catch (err) {
    if (transfer.length === 0) throw err
    worker.postMessage(message)
  }
}

function getFrameTransferList(source: unknown): Transferable[] {
  if (source instanceof ArrayBuffer) return [source]
  if (ArrayBuffer.isView(source) && source.buffer instanceof ArrayBuffer) return [source.buffer]
  return []
}
