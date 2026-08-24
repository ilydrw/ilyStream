import { useEffect, useRef } from 'react'
import type { StudioLayer } from '../../../../shared/studio'
import { resolveLayerLayout } from '../../../../shared/studio'
import { resolveBrowserSourceUrl, resolveBrowserCaptureSettings, getBrowserFrameSurface } from './CanvasEditor.utils'
import type { BrowserFrameSurface } from './CanvasEditor.types'

interface BrowserSourceOptions {
  enabled?: boolean
  layers: StudioLayer[]
  aspectRatio: string
  overlayPort: number
  browserFrameCache: React.MutableRefObject<Record<string, BrowserFrameSurface>>
  /**
   * False when no consumer needs frames right now (studio hidden, nothing
   * streaming/recording/mirrored). Captures stay alive so widget pages keep
   * their state, but drop to 1fps to stop full-frame IPC churn.
   */
  framesNeeded?: boolean
  /**
   * False when the capture must keep running at full rate (a native-engine sink
   * still consumes it) but the RENDERER has no consumer — the studio page is
   * hidden and no canvas output/preview draws these sources. Main then stops
   * pushing frames to the renderer over IPC without starving the engine. Only
   * the main studio instance manages this (see manageRendererDelivery).
   */
  deliverFramesToRenderer?: boolean
  /** Whether this hook instance owns the deliverToRenderer flag (main studio only). */
  manageRendererDelivery?: boolean
}

export function useBrowserSources(options: BrowserSourceOptions) {
  const {
    enabled = true, layers, aspectRatio, overlayPort, browserFrameCache, framesNeeded = true,
    deliverFramesToRenderer = true, manageRendererDelivery = false
  } = options
  const browserWorkerRef = useRef<Worker | null>(null)
  const browserWorkerBusy = useRef<Record<string, boolean>>({})
  const latestBrowserBitmaps = useRef<Record<string, any>>({})
  const browserBlankFrames = useRef<Record<string, number>>({})
  const capturedBrowserSourceIds = useRef<Set<string>>(new Set())
  const lastBrowserConfigs = useRef<Record<string, string>>({})

  useEffect(() => {
    if (!enabled) return
    const worker = new Worker(new URL('../../../workers/browser-frame.worker.ts', import.meta.url))
    browserWorkerRef.current = worker

    worker.onmessage = (event) => {
      const { id, bitmap, width, height, isBlank } = event.data
      browserWorkerBusy.current[id] = false

      if (!capturedBrowserSourceIds.current.has(id)) {
        try { bitmap?.close?.() } catch {}
        return
      }

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
      // Studio mode mounts separate preview and program editors in the same
      // renderer. Each receives the IPC event, but only an editor that owns
      // this source should allocate/process its bitmap.
      if (!capturedBrowserSourceIds.current.has(id)) return

      try {
        if (browserWorkerBusy.current[id]) {
          try { latestBrowserBitmaps.current[id]?.bitmap?.close?.() } catch {}
          latestBrowserBitmaps.current[id] = payload
        } else {
          browserWorkerBusy.current[id] = true
          postWorkerFrame(worker, { id, source: bitmap, width, height }, bitmap)
        }
      } finally {
        window.api.studio.browserSourceFrameConsumed(id)
      }
    }

    const unsub = window.api?.on?.('browser-source:frame', onIpcFrame)
    return () => {
      unsub?.()
      worker.terminate()
      for (const surface of Object.values(browserFrameCache.current)) {
        try { surface.bitmap?.close() } catch {}
      }
      browserFrameCache.current = {}
      for (const payload of Object.values(latestBrowserBitmaps.current)) {
        try { payload?.bitmap?.close?.() } catch {}
      }
      latestBrowserBitmaps.current = {}
      browserWorkerBusy.current = {}
      browserBlankFrames.current = {}
      for (const id of Array.from(capturedBrowserSourceIds.current)) {
        void window.api?.studio?.stopBrowserSource(id)
      }
      capturedBrowserSourceIds.current.clear()
      lastBrowserConfigs.current = {}
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled || !window.api?.studio) return
    const activeIds = new Set<string>()

    for (const layer of layers) {
      if (layer.type !== 'widget' && layer.type !== 'browser') continue
      activeIds.add(layer.id)
      const layout = resolveLayerLayout(layer, aspectRatio as any)
      const url = resolveBrowserSourceUrl(layer, overlayPort)
      const capture = resolveBrowserCaptureSettings(layer, layout.width, layout.height)
      // A layer hidden in both aspects can never be drawn anywhere — idle its
      // capture too, independent of the global framesNeeded signal.
      const hiddenEverywhere =
        !resolveLayerLayout(layer, '16:9').visible &&
        !resolveLayerLayout(layer, '9:16').visible
      if (!framesNeeded || hiddenEverywhere) capture.fps = 1
      const config = {
        id: layer.id,
        url,
        ...capture,
        // Only the owning instance sets this; omitting it leaves main's current
        // delivery state untouched (other managers of the same id won't stomp it).
        ...(manageRendererDelivery ? { deliverToRenderer: deliverFramesToRenderer } : {})
      }
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
        delete lastBrowserConfigs.current[id]
        const surface = browserFrameCache.current[id]
        try { surface?.bitmap?.close() } catch {}
        delete browserFrameCache.current[id]
        const pending = latestBrowserBitmaps.current[id]
        try { pending?.bitmap?.close?.() } catch {}
        delete latestBrowserBitmaps.current[id]
        delete browserWorkerBusy.current[id]
        delete browserBlankFrames.current[id]
        void window.api.studio.stopBrowserSource(id)
      }
    }
  }, [enabled, layers, aspectRatio, overlayPort, framesNeeded, deliverFramesToRenderer, manageRendererDelivery])
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
