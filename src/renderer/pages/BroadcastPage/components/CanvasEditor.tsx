import { useRef, useState, useEffect, useMemo, useCallback, useImperativeHandle, forwardRef } from 'react'
import { useStudioStore } from '../../../stores/studio-store'
import { resolveLayerLayout, type StudioLayer, type StudioScene } from '../../../../shared/studio'
import { ContextMenu, type ContextMenuItem } from '../../../components/ui/ContextMenu'
import { Maximize, Minimize, Monitor, Grid3x3, RotateCcw, RotateCw } from 'lucide-react'

import { 
  type CanvasEditorProps, 
  type CanvasEditorHandle, 
  type DragState, 
  type ResizeState, 
  type BrowserFrameSurface, 
  type CachedMediaFrame,
  type RotateState,
  type HandleDir,
  type Crop
} from './CanvasEditor.types'

import { 
  drawMediaFallback, 
  drawAndCacheMediaFrame, 
  wrapCanvasText, 
  resolveImageSource,
  resolveBrowserSourceUrl,
  resolveBrowserCaptureSettings,
  getBrowserFrameSurface
} from './CanvasEditor.utils'

import { useBroadcastAudio } from './useBroadcastAudio'
import { useVideoEncoder } from './useVideoEncoder'

const HANDLE_CURSORS: Record<HandleDir, string> = {
  nw: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', se: 'nwse-resize',
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize'
}

const SNAP_THRESHOLD = 15

export const CanvasEditor = forwardRef<CanvasEditorHandle, CanvasEditorProps>((props, ref) => {
  const { 
    activeScene, isStreaming, isRecording, captureInputFormat, 
    outputFps, outputBitrateKbps, videoRefs, streamReady, outputCodec
  } = props
  const canvasWidth = useStudioStore(s => s.canvasWidth)
  const canvasHeight = useStudioStore(s => s.canvasHeight)
  const aspectRatio = useStudioStore(s => s.aspectRatio)
  const setSelectedLayer = useStudioStore(s => s.setSelectedLayer)
  const updateLayer = useStudioStore(s => s.updateLayer)
  const saveHistory = useStudioStore(s => s.saveHistory)
  const duplicateLayer = useStudioStore(s => s.duplicateLayer)
  const copyLayer = useStudioStore(s => s.copyLayer)
  const removeLayer = useStudioStore(s => s.removeLayer)
  const activeSceneId = useStudioStore(s => s.activeSceneId)
  const reorderLayer = useStudioStore(s => s.reorderLayer)
  const selectedLayerId = useStudioStore(s => s.selectedLayerId)
  const undo = useStudioStore(s => s.undo)
  const redo = useStudioStore(s => s.redo)
  
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageCache = useRef<Record<string, HTMLImageElement>>({})
  const mediaFrameCache = useRef<Record<string, CachedMediaFrame>>({})
  const browserFrameCache = useRef<Record<string, BrowserFrameSurface>>({})
  const browserWorkerRef = useRef<Worker | null>(null)
  const browserWorkerBusy = useRef<Record<string, boolean>>({})
  const latestBrowserBitmaps = useRef<Record<string, any>>({})
  const browserBlankFrames = useRef<Record<string, number>>({})
  const capturedBrowserSourceIds = useRef<Set<string>>(new Set())
  const activeMediaStreams = useRef<Record<string, { video: HTMLVideoElement }>>({})
  const audioClockRef = useRef({ totalSamples: 0, receivedAt: 0 })
  const outputActive = isStreaming || isRecording
  const browserBlankHoldFrames = useRef(Math.max(18, Math.round(outputFps * 1.5)))

  useEffect(() => {
    browserBlankHoldFrames.current = Math.max(18, Math.round(outputFps * 1.5))
  }, [outputFps])

  // 2. Video Encoder
  const { workerRef: encoderWorkerRef, firstVideoChunkReceivedRef } = useVideoEncoder(outputActive, {
    format: captureInputFormat,
    fps: outputFps,
    bitrate: outputBitrateKbps,
    width: canvasWidth,
    height: canvasHeight,
    codec: outputCodec
  }, () => {
    if (isStreaming) void window.api.streaming.stop()
    if (isRecording) void window.api.streaming.stopRecording()
  })

  // 2.1 Audio Clock Sync
  useEffect(() => {
    if (!outputActive) {
      audioClockRef.current = { totalSamples: 0, receivedAt: 0 }
      return
    }
    return window.api.on('streaming:native-audio-clock', (data: any) => {
      audioClockRef.current = {
        totalSamples: data.totalSamples,
        receivedAt: performance.now()
      }
    })
  }, [outputActive])

  // Sync layers to the background renderer worker
  useEffect(() => {
    if (encoderWorkerRef.current) {
      encoderWorkerRef.current.postMessage({
        type: 'update_layers',
        payload: { layers: activeScene.layers }
      })
    }
  }, [activeScene.layers, encoderWorkerRef.current])

  // The stream encoder now uses the already-composited preview canvas. Older
  // builds also attached MediaStreamTrackProcessor readers to every camera,
  // which could starve Chromium's capture buffers while streaming.
  const mediaProcessors = useRef<Record<string, { reader: any; track: any }>>({})

  useEffect(() => {
    Object.values(mediaProcessors.current).forEach(p => {
      try { p.reader?.cancel() } catch {}
    })
    mediaProcessors.current = {}
  }, [outputActive])
  
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)
  const [activeGuides, setActiveGuides] = useState<{ x: boolean; y: boolean }>({ x: false, y: false })
  const [overlayPort, setOverlayPort] = useState(8899)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [resetKey, setResetKey] = useState(0)

  const dragRef = useRef<DragState | null>(null)
  const resizeRef = useRef<ResizeState | null>(null)
  const rotateRef = useRef<RotateState | null>(null)
  const [fitScale, setFitScale] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panRef = useRef({ startX: 0, startY: 0, origX: 0, origY: 0 })
  const scaleRef = useRef(1) // effective scale
  const [fps, setFps] = useState(0)
  const fpsRef = useRef({ count: 0, globalCount: 0, lastTime: performance.now() })
  
  const viewportRef = useRef<HTMLDivElement>(null)
  const lastWheelTime = useRef(0)

  // 3. Audio Engine
  useBroadcastAudio(isStreaming || isRecording, videoRefs, streamReady)

  useImperativeHandle(ref, () => ({
    takeScreenshot: async () => {
      const canvas = canvasRef.current
      if (!canvas || !window.api?.streaming) return
      canvas.toBlob(async (blob) => {
        if (!blob) return
        const buf = await blob.arrayBuffer()
        await window.api.streaming.takeScreenshot(new Uint8Array(buf))
      }, 'image/jpeg', 0.95)
    }
  }))

  // Stable state for render loop
  const stateRef = useRef({ 
    captureRequested: false 
  })
  const compositedCaptureRef = useRef({ lastAt: 0, frameCount: 0 })

  useEffect(() => {
    compositedCaptureRef.current = { lastAt: 0, frameCount: 0 }
  }, [outputActive, outputFps])

  const containerRef = useRef<HTMLDivElement>(null)

  // Direct DOM scaling for snappiness
  useEffect(() => {
    const el = wrapperRef.current
    const container = containerRef.current
    if (!el || !container) return

    const obs = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect
      if (!r) return
      
      const sx = (r.width - 48) / canvasWidth
      const sy = (r.height - 48) / canvasHeight
      const s = Math.min(sx, sy)
      
      setFitScale(s)
    })
    
    obs.observe(el)
    return () => obs.disconnect()
  }, [canvasWidth, canvasHeight])

  useEffect(() => {
    const effectiveScale = fitScale * zoom
    scaleRef.current = effectiveScale
    const el = wrapperRef.current
    const container = containerRef.current
    const viewport = viewportRef.current
    if (el && container && viewport) {
      el.style.setProperty('--preview-scale', effectiveScale.toString())
      container.style.width = `${Math.round(canvasWidth * effectiveScale)}px`
      container.style.height = `${Math.round(canvasHeight * effectiveScale)}px`
    }
  }, [fitScale, zoom, canvasWidth, canvasHeight])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const delta = -e.deltaY
      const factor = delta > 0 ? 1.1 : 0.9
      const newZoom = Math.max(0.05, Math.min(zoom * factor, 10))
      
      if (newZoom !== zoom) {
        const viewport = viewportRef.current
        if (viewport) {
          const rect = viewport.getBoundingClientRect()
          const mouseX = e.clientX - rect.left
          const mouseY = e.clientY - rect.top
          
          const scrollX = viewport.scrollLeft
          const scrollY = viewport.scrollTop
          
          setZoom(newZoom)
          
          // Sync scroll after zoom update
          requestAnimationFrame(() => {
            if (viewportRef.current) {
              viewportRef.current.scrollLeft = scrollX * factor + (factor - 1) * mouseX
              viewportRef.current.scrollTop = scrollY * factor + (factor - 1) * mouseY
            }
          })
        } else {
          setZoom(newZoom)
        }
      }
    }
  }, [zoom, fitScale])

  // Clamp pan when zoom changes or window resizes to keep canvas visible
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const rect = viewport.getBoundingClientRect()
    const effectiveScale = fitScale * zoom
    const cw = canvasWidth * effectiveScale
    const ch = canvasHeight * effectiveScale
    
    // Allow panning such that at least 100px of the canvas is always visible
    const margin = 100
    const limitX = (rect.width / 2) + (cw / 2) - margin
    const limitY = (rect.height / 2) + (ch / 2) - margin
    
    setPan(prev => ({
      x: Math.max(-limitX, Math.min(prev.x, limitX)),
      y: Math.max(-limitY, Math.min(prev.y, limitY))
    }))
  }, [zoom, fitScale, canvasWidth, canvasHeight])

  const sortedLayers = useMemo(() => 
    [...activeScene.layers]
      .sort((a, b) => a.zIndex - b.zIndex)
      .map(l => ({ layer: l, layout: resolveLayerLayout(l, aspectRatio) })),
    [activeScene.layers, aspectRatio]
  )

  const layersRef = useRef(sortedLayers)
  useEffect(() => {
    layersRef.current = sortedLayers
  }, [sortedLayers])

  // Main Render Loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    // Optimization: High quality rendering for sharp text and media
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high' 

    let frameId: number
    const configuredOutputFps = Math.max(1, Math.min(60, Math.round(outputFps || 30)))
    const minRenderFps = outputActive ? Math.min(60, Math.max(30, configuredOutputFps)) : 30
    const maxRenderFps = 60
    let targetRenderFps = maxRenderFps
    let targetFrameMs = 1000 / targetRenderFps
    let lastRenderAt = 0
    let perfWindowStart = performance.now()
    let perfFrameCount = 0
    let perfRenderTime = 0
    const render = () => {
      const renderStartedAt = performance.now()
      const now = renderStartedAt

      if (lastRenderAt > 0 && now - lastRenderAt < targetFrameMs - 1) {
        frameId = requestAnimationFrame(render)
        return
      }

      lastRenderAt = lastRenderAt === 0
        ? now
        : now - ((now - lastRenderAt) % targetFrameMs)

      // FPS tracking logic
      fpsRef.current.count++
      fpsRef.current.globalCount++
      if (now - fpsRef.current.lastTime >= 1000) {
        setFps(fpsRef.current.count)
        fpsRef.current.count = 0
        fpsRef.current.lastTime = now
      }

      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const currentLayers = layersRef.current
      for (let i = 0; i < currentLayers.length; i++) {
        const { layer: l, layout } = currentLayers[i]
        if (!layout.visible) continue
        ctx.save()
        ctx.globalAlpha = l.opacity ?? 1
        const rotation = Number(layout.rotation || 0)
        const drawLayout = rotation
          ? { ...layout, x: -layout.width / 2, y: -layout.height / 2 }
          : layout
        if (rotation) {
          ctx.translate(layout.x + layout.width / 2, layout.y + layout.height / 2)
          ctx.rotate(rotation * Math.PI / 180)
        }
        
        if (l.type === 'camera' || l.type === 'display') {
          const video = videoRefs.current[l.id]
          const stream = video?.srcObject as MediaStream | null
          const track = stream?.getVideoTracks()[0]
          
          const isReady =
            video &&
            video.readyState >= 2 &&
            video.videoWidth > 0 &&
            video.videoHeight > 0 &&
            track?.readyState !== 'ended'

          if (!isReady) {
            const cached = mediaFrameCache.current[l.id]
            if (cached) {
              ctx.drawImage(cached.canvas, Math.round(drawLayout.x), Math.round(drawLayout.y), Math.round(drawLayout.width), Math.round(drawLayout.height))
            } else {
              drawMediaFallback(ctx, mediaFrameCache.current, l.id, drawLayout, track?.muted ? 'HIDDEN' : 'WAITING', l.name)
            }
          } else {
            try {
              const coversProgram = layout.width >= canvas.width * 0.85 && layout.height >= canvas.height * 0.85
              drawAndCacheMediaFrame(ctx, mediaFrameCache.current, l.id, video, drawLayout, fpsRef.current.globalCount, layout.crop, coversProgram ? 1 : 2)
            } catch (err) {
              drawMediaFallback(ctx, mediaFrameCache.current, l.id, drawLayout, 'STALLED', l.name, { showBadge: false })
            }
          }
        } else if (l.type === 'image' && imageCache.current[l.id]) {
          ctx.drawImage(imageCache.current[l.id], Math.round(drawLayout.x), Math.round(drawLayout.y), Math.round(drawLayout.width), Math.round(drawLayout.height))
        } else if (l.type === 'widget' || l.type === 'browser') {
          const frame = browserFrameCache.current[l.id]
          if (frame) {
            const crop = layout.crop
            if (crop) {
              ctx.drawImage(
                frame.canvas,
                crop.left, crop.top, frame.width - crop.left - crop.right, frame.height - crop.top - crop.bottom,
                Math.round(drawLayout.x), Math.round(drawLayout.y), Math.round(drawLayout.width), Math.round(drawLayout.height)
              )
            } else {
              ctx.drawImage(frame.canvas, Math.round(drawLayout.x), Math.round(drawLayout.y), Math.round(drawLayout.width), Math.round(drawLayout.height))
            }
          }
        } else if (l.type === 'text') {
          const fontSize = Number(l.config?.fontSize) || 48
          ctx.fillStyle = l.config?.color || '#fff'
          ctx.font = `700 ${fontSize}px Inter, sans-serif`
          ctx.textBaseline = 'top'
          wrapCanvasText(ctx, l.config?.text || '', drawLayout.x, drawLayout.y, drawLayout.width, fontSize * 1.2, drawLayout.height)
        }
        ctx.restore()
      }

      if (outputActive && encoderWorkerRef.current) {
        const capture = compositedCaptureRef.current
        const intervalMs = 1000 / Math.max(1, Math.min(60, Math.round(outputFps || 30)))
        // Use a 2ms grace period to prevent skipping frames due to requestAnimationFrame jitter
        if (now - capture.lastAt >= intervalMs - 2) {
          if (capture.lastAt === 0) {
            console.log('[CanvasEditor] Starting fresh capture sequence.')
            capture.frameCount = 0
          }
          capture.lastAt = now
          capture.frameCount++
          try {
            // Strictly monotonic timestamps slaved to the master audio clock
            const audioSamples = audioClockRef.current.totalSamples
            const audioRate = 48000
            const fps = Math.max(1, outputFps || 30)
            
            // Baseline time from samples processed by main
            const audioBaseUs = (audioSamples / audioRate) * 1_000_000
            
            // Refinement based on time since last clock update to keep it fluid
            const msSinceClock = performance.now() - audioClockRef.current.receivedAt
            // Capping offset at 100ms to prevent runaway if IPC is lost, but allowing 
            // enough room for smooth advancement beyond a single frame duration.
            const smoothedOffsetUs = Math.min(msSinceClock * 1000, 100_000) 
            
            const timestamp = Math.round(audioBaseUs + smoothedOffsetUs)

            const frame = new VideoFrame(canvas, { timestamp })
            encoderWorkerRef.current.postMessage(
              { type: 'composited_frame', payload: { frame } },
              [frame]
            )
          } catch (err) {
            console.error('[CanvasEditor] Failed to capture composited stream frame:', err)
          }
        }
      }

      const finishedAt = performance.now()
      perfFrameCount++
      perfRenderTime += finishedAt - renderStartedAt

      if (finishedAt - perfWindowStart >= 1500 && perfFrameCount > 0) {
        const avgRenderMs = perfRenderTime / perfFrameCount
        const budgetMs = 1000 / targetRenderFps

        if (avgRenderMs > budgetMs * 0.75 && targetRenderFps > minRenderFps) {
          targetRenderFps = Math.max(minRenderFps, targetRenderFps - 10)
          targetFrameMs = 1000 / targetRenderFps
        } else if (avgRenderMs < budgetMs * 0.45 && targetRenderFps < maxRenderFps) {
          targetRenderFps = Math.min(maxRenderFps, targetRenderFps + 5)
          targetFrameMs = 1000 / targetRenderFps
        }

        perfWindowStart = finishedAt
        perfFrameCount = 0
        perfRenderTime = 0
      }
      
      frameId = requestAnimationFrame(render)
    }

    render()
    return () => cancelAnimationFrame(frameId)
  }, [outputActive, outputFps])

  // 3. Browser Source Frame Worker
  useEffect(() => {
    const worker = new Worker(new URL('../../../workers/browser-frame.worker.ts', import.meta.url))
    browserWorkerRef.current = worker

    // Handler for processed frames from the worker
    worker.onmessage = (event) => {
      const { id, bitmap, width, height, isBlank } = event.data
      browserWorkerBusy.current[id] = false

      const previous = browserFrameCache.current[id]
      if (isBlank && previous?.lastUpdateAt) {
        const blanks = (browserBlankFrames.current[id] || 0) + 1
        browserBlankFrames.current[id] = blanks
        if (blanks < browserBlankHoldFrames.current) {
          try { bitmap?.close?.() } catch {}
          if (latestBrowserBitmaps.current[id]) {
            const payload = latestBrowserBitmaps.current[id]
            delete latestBrowserBitmaps.current[id]
            sendToWorker(payload)
          }
          return
        }
      }

      browserBlankFrames.current[id] = 0
      const surface = getBrowserFrameSurface(browserFrameCache.current, id, width, height)
      surface.ctx.clearRect(0, 0, surface.width, surface.height)
      surface.ctx.drawImage(bitmap, 0, 0, surface.width, surface.height)
      surface.lastUpdateAt = performance.now()
      try { bitmap.close() } catch {}

      // If we have a buffered frame, process it now
      if (latestBrowserBitmaps.current[id]) {
        const payload = latestBrowserBitmaps.current[id]
        delete latestBrowserBitmaps.current[id]
        sendToWorker(payload)
      }
    }

    const sendToWorker = (payload: any) => {
      const { id, width, height, bitmap } = payload
      const layer = layersRef.current.find(entry => entry.layer.id === id)?.layer
      const transparentBackground = layer?.config?.transparentBackground !== false
      browserWorkerBusy.current[id] = true
      
      // We do NOT transfer the buffer here because Electron IPC buffers 
      // are often reused/shared and detaching them causes crashes.
      worker.postMessage({
        id,
        source: bitmap,
        width,
        height,
        transparentBackground,
        transparentChromaTolerance: isLikelyScreenBorderLayer(layer) ? 48 : 8
      })
    }

    // Handler for raw frames from the main process
    const onIpcFrame = (payload: any) => {
      const { id } = payload
      if (browserWorkerBusy.current[id]) {
        // Worker is busy, buffer the latest frame and discard old ones
        latestBrowserBitmaps.current[id] = payload
      } else {
        sendToWorker(payload)
      }
    }

    const unsub = window.api.on('browser-source:frame', onIpcFrame)
    return () => {
      unsub()
      worker.terminate()
      for (const payload of Object.values(latestBrowserBitmaps.current)) {
        try { payload?.bitmap?.close?.() } catch {}
      }
      latestBrowserBitmaps.current = {}
      browserWorkerBusy.current = {}
      browserBlankFrames.current = {}
      browserFrameCache.current = {}
    }
  }, [])

  const lastBrowserConfigs = useRef<Record<string, string>>({})
  useEffect(() => {
    if (!window.api?.studio) return
    const activeIds = new Set<string>()

    for (const layer of activeScene.layers) {
      if (layer.type !== 'widget' && layer.type !== 'browser') continue
      const layout = resolveLayerLayout(layer, aspectRatio)
      if (!layout.visible) continue

      activeIds.add(layer.id)
      const url = resolveBrowserSourceUrl(layer, overlayPort)
      const capture = resolveBrowserCaptureSettings(layer, layout.width, layout.height)
      const config = { id: layer.id, url, ...capture }
      const configSig = JSON.stringify(config)

      if (capturedBrowserSourceIds.current.has(layer.id)) {
        // Only update if the relevant config actually changed to prevent flickering
        if (lastBrowserConfigs.current[layer.id] !== configSig) {
          lastBrowserConfigs.current[layer.id] = configSig
          void window.api.studio.updateBrowserSource(config)
        }
      } else {
        capturedBrowserSourceIds.current.add(layer.id)
        lastBrowserConfigs.current[layer.id] = configSig
        void window.api.studio.startBrowserSource(config)
      }
    }

    for (const id of Array.from(capturedBrowserSourceIds.current)) {
      if (!activeIds.has(id)) {
        capturedBrowserSourceIds.current.delete(id)
        delete lastBrowserConfigs.current[id]
        delete browserFrameCache.current[id]
        delete browserWorkerBusy.current[id]
        delete latestBrowserBitmaps.current[id]
        delete browserBlankFrames.current[id]
        void window.api.studio.stopBrowserSource(id)
      }
    }
  }, [activeScene.layers, aspectRatio, overlayPort])

  useEffect(() => {
    return () => {
      if (!window.api?.studio) return
      for (const id of Array.from(capturedBrowserSourceIds.current)) {
        void window.api.studio.stopBrowserSource(id)
      }
      capturedBrowserSourceIds.current.clear()
    }
  }, [])

  // Drag & Resize Handlers
  const screenToCanvas = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: (clientX - rect.left) / scaleRef.current,
      y: (clientY - rect.top) / scaleRef.current
    }
  }, [])

  const handleMouseDown = (e: React.MouseEvent, layer: StudioLayer) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      // Middle click or Shift+Left for panning (common shortcut)
      // Actually we'll handle Space+Left in the wrapper
      return
    }
    if (e.button !== 0) return
    e.stopPropagation()
    saveHistory()
    const layout = resolve(layer)
    dragRef.current = {
      id: layer.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: layout.x,
      origY: layout.y,
      width: layout.width,
      height: layout.height
    }
    setSelectedLayer(layer.id)
  }

  const handleResizeStart = (e: React.MouseEvent, layer: StudioLayer, handle: HandleDir) => {
    e.stopPropagation()
    saveHistory()
    const layout = resolve(layer)
    resizeRef.current = {
      id: layer.id,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      origX: layout.x,
      origY: layout.y,
      origW: layout.width,
      origH: layout.height,
      ratio: (() => {
        const video = videoRefs.current[layer.id]
        if (video && (video as any).videoWidth > 0) return (video as any).videoWidth / (video as any).videoHeight
        return layout.width / layout.height
      })(),
      isCropping: e.altKey
    }
  }

  const handleRotateStart = (e: React.MouseEvent, layer: StudioLayer) => {
    e.stopPropagation()
    saveHistory()
    const layout = resolve(layer)
    const centerX = layout.x + layout.width / 2
    const centerY = layout.y + layout.height / 2
    const canvasPoint = screenToCanvas(e.clientX, e.clientY)
    rotateRef.current = {
      id: layer.id,
      centerX,
      centerY,
      startAngle: Math.atan2(canvasPoint.y - centerY, canvasPoint.x - centerX) * 180 / Math.PI,
      origRotation: Number(layout.rotation || 0)
    }
    setSelectedLayer(layer.id)
  }

  const handleAutoCrop = (layer: StudioLayer) => {
    let sourceCanvas: HTMLCanvasElement | HTMLImageElement | ImageBitmap | null = null
    
    if (layer.type === 'widget' || layer.type === 'browser') {
      sourceCanvas = browserFrameCache.current[layer.id]?.canvas || null
    } else if (layer.type === 'image') {
      sourceCanvas = imageCache.current[layer.id] || null
    }

    if (!sourceCanvas) return

    // Analysis dimensions
    const sw = sourceCanvas.width
    const sh = sourceCanvas.height
    
    // Use a small analysis canvas to avoid blocking the main thread too long
    const analysisCanvas = document.createElement('canvas')
    analysisCanvas.width = sw
    analysisCanvas.height = sh
    const analysisCtx = analysisCanvas.getContext('2d', { alpha: true })
    if (!analysisCtx) return
    
    analysisCtx.drawImage(sourceCanvas, 0, 0)
    const imageData = analysisCtx.getImageData(0, 0, sw, sh)
    const data = imageData.data

    let minX = sw, minY = sh, maxX = 0, maxY = 0
    let found = false

    // Skip pixels for speed (every 2nd pixel)
    for (let y = 0; y < sh; y += 2) {
      for (let x = 0; x < sw; x += 2) {
        const alpha = data[(y * sw + x) * 4 + 3]
        if (alpha > 8) { // Visible threshold
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
          found = true
        }
      }
    }

    if (!found) return

    // Padding (5px)
    minX = Math.max(0, minX - 5)
    minY = Math.max(0, minY - 5)
    maxX = Math.min(sw, maxX + 5)
    maxY = Math.min(sh, maxY + 5)

    const layout = resolve(layer)
    const currentCrop = (aspectRatio === '9:16' ? layer.portraitCrop : layer.crop) || { top: 0, bottom: 0, left: 0, right: 0 }
    
    const visibleSourceW = sw - currentCrop.left - currentCrop.right
    const visibleSourceH = sh - currentCrop.top - currentCrop.bottom
    const sx = layout.width / visibleSourceW
    const sy = layout.height / visibleSourceH

    const nextCrop = {
      left: minX,
      right: sw - maxX,
      top: minY,
      bottom: sh - maxY
    }

    const nextLayout = {
      x: layout.x + (minX - currentCrop.left) * sx,
      y: layout.y + (minY - currentCrop.top) * sy,
      width: (maxX - minX) * sx,
      height: (maxY - minY) * sy
    }

    updateLayer(activeScene.id, layer.id, {
      ...nextLayout,
      [aspectRatio === '9:16' ? 'portraitCrop' : 'crop']: nextCrop
    })
  }

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && (window as any).__spacePressed)) {
        setIsPanning(true)
        panRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          origX: pan.x,
          origY: pan.y
        }
        e.preventDefault()
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (isPanning || (window as any).__spacePressed) {
        const viewport = viewportRef.current
        if (viewport) {
          viewport.scrollLeft -= e.movementX
          viewport.scrollTop -= e.movementY
        }
        return
      }

      const drag = dragRef.current
      const rotate = rotateRef.current
      if (rotate) {
        const point = screenToCanvas(e.clientX, e.clientY)
        const angle = Math.atan2(point.y - rotate.centerY, point.x - rotate.centerX) * 180 / Math.PI
        let nextRotation = rotate.origRotation + angle - rotate.startAngle
        if (e.shiftKey) nextRotation = Math.round(nextRotation / 15) * 15
        updateLayer(activeScene.id, rotate.id, { rotation: Math.round(nextRotation * 10) / 10 })
      } else if (drag) {
        const { id, startX, startY, origX, origY } = drag
        const dx = (e.clientX - startX) / scaleRef.current
        const dy = (e.clientY - startY) / scaleRef.current
        
        let nx = origX + dx
        let ny = origY + dy

        // 1. Collect all possible snap lines
        const snapPointsX: number[] = [0, canvasWidth / 2, canvasWidth]
        const snapPointsY: number[] = [0, canvasHeight / 2, canvasHeight]
        
        layersRef.current.forEach(({ layer: other, layout: otherLayout }) => {
          if (other.id === id || !otherLayout.visible) return
          snapPointsX.push(otherLayout.x, otherLayout.x + otherLayout.width / 2, otherLayout.x + otherLayout.width)
          snapPointsY.push(otherLayout.y, otherLayout.y + otherLayout.height / 2, otherLayout.y + otherLayout.height)
        })

        const guides = { x: false, y: false }
        
        // Snap X
        const currentPointsX = [nx, nx + drag.width / 2, nx + drag.width]
        let bestDiffX = SNAP_THRESHOLD
        currentPointsX.forEach((p, idx) => {
          snapPointsX.forEach(sp => {
            const diff = sp - p
            if (Math.abs(diff) < Math.abs(bestDiffX)) {
              bestDiffX = diff
              guides.x = true
            }
          })
        })
        if (guides.x) nx += bestDiffX

        // Snap Y
        const currentPointsY = [ny, ny + drag.height / 2, ny + drag.height]
        let bestDiffY = SNAP_THRESHOLD
        currentPointsY.forEach((p, idx) => {
          snapPointsY.forEach(sp => {
            const diff = sp - p
            if (Math.abs(diff) < Math.abs(bestDiffY)) {
              bestDiffY = diff
              guides.y = true
            }
          })
        })
        if (guides.y) ny += bestDiffY
        
        setActiveGuides(guides)
        updateLayer(activeScene.id, id, { x: nx, y: ny })
      } else if (resizeRef.current) {
        const { id, handle, startX, startY, origX, origY, origW, origH, ratio, isCropping } = resizeRef.current
        const dx = (e.clientX - startX) / scaleRef.current
        const dy = (e.clientY - startY) / scaleRef.current

        if (isCropping) {
          const layer = activeScene.layers.find(l => l.id === id)
          if (!layer) return
          const layout = resolve(layer)
          
          // Determine source dimensions for coordinate conversion
          let sw = 1920, sh = 1080
          if (layer.type === 'camera' || layer.type === 'display') {
            const video = videoRefs.current[layer.id]
            if (video) { sw = video.videoWidth; sh = video.videoHeight }
          } else if (layer.config?.width && layer.config?.height) {
            sw = layer.config.width; sh = layer.config.height
          }

          const currentCrop = { ...((aspectRatio === '9:16' ? layer.portraitCrop : layer.crop) || { top: 0, bottom: 0, left: 0, right: 0 }) }
          const nextLayout = { x: origX, y: origY, width: origW, height: origH }
          
          // Current scale: canvas pixels / visible source pixels
          const visibleSourceW = sw - currentCrop.left - currentCrop.right
          const visibleSourceH = sh - currentCrop.top - currentCrop.bottom
          const sx = origW / visibleSourceW
          const sy = origH / visibleSourceH

          if (handle.includes('e')) {
            const dWidth = Math.max(-origW + 20, dx)
            nextLayout.width = origW + dWidth
            currentCrop.right = Math.max(0, currentCrop.right - (dWidth / sx))
          }
          if (handle.includes('w')) {
            const dWidth = Math.max(-origW + 20, -dx)
            nextLayout.width = origW + dWidth
            nextLayout.x = origX - (nextLayout.width - origW)
            currentCrop.left = Math.max(0, currentCrop.left - (dWidth / sx))
          }
          if (handle.includes('s')) {
            const dHeight = Math.max(-origH + 20, dy)
            nextLayout.height = origH + dHeight
            currentCrop.bottom = Math.max(0, currentCrop.bottom - (dHeight / sy))
          }
          if (handle.includes('n')) {
            const dHeight = Math.max(-origH + 20, -dy)
            nextLayout.height = origH + dHeight
            nextLayout.y = origY - (nextLayout.height - origH)
            currentCrop.top = Math.max(0, currentCrop.top - (dHeight / sy))
          }

          updateLayer(activeScene.id, id, { 
            ...nextLayout,
            [aspectRatio === '9:16' ? 'portraitCrop' : 'crop']: currentCrop 
          })
        } else {
          let nw = origW, nh = origH, nx = origX, ny = origY

          if (handle.includes('e')) nw = Math.max(20, origW + dx)
          if (handle.includes('w')) {
            nw = Math.max(20, origW - dx)
            nx = origX - (nw - origW)
          }
          if (handle.includes('s')) nh = Math.max(20, origH + dy)
          if (handle.includes('n')) {
            nh = Math.max(20, origH - dy)
            ny = origY - (nh - origH)
          }

          // Snapping for Resize
          const snapPointsX: number[] = [0, canvasWidth / 2, canvasWidth]
          const snapPointsY: number[] = [0, canvasHeight / 2, canvasHeight]
          layersRef.current.forEach(({ layer: other, layout: otherLayout }) => {
            if (other.id === id || !otherLayout.visible) return
            snapPointsX.push(otherLayout.x, otherLayout.x + otherLayout.width / 2, otherLayout.x + otherLayout.width)
            snapPointsY.push(otherLayout.y, otherLayout.y + otherLayout.height / 2, otherLayout.y + otherLayout.height)
          })

          const guides = { x: false, y: false }
          
          // Snap based on which handle is being moved
          if (handle.includes('e')) {
            const edge = nx + nw
            const match = snapPointsX.find(p => Math.abs(p - edge) < SNAP_THRESHOLD)
            if (match !== undefined) { nw = match - nx; guides.x = true }
          } else if (handle.includes('w')) {
            const match = snapPointsX.find(p => Math.abs(p - nx) < SNAP_THRESHOLD)
            if (match !== undefined) { 
              const diff = match - nx
              nx = match; nw -= diff; guides.x = true 
            }
          }

          if (handle.includes('s')) {
            const edge = ny + nh
            const match = snapPointsY.find(p => Math.abs(p - edge) < SNAP_THRESHOLD)
            if (match !== undefined) { nh = match - ny; guides.y = true }
          } else if (handle.includes('n')) {
            const match = snapPointsY.find(p => Math.abs(p - ny) < SNAP_THRESHOLD)
            if (match !== undefined) { 
              const diff = match - ny
              ny = match; nh -= diff; guides.y = true 
            }
          }
          
          setActiveGuides(guides)

          // Aspect Ratio Locking (Default ON, Shift to bypass)
          const isProportional = !e.shiftKey
          if (isProportional && ratio > 0) {
            const wChange = Math.abs(nw - origW) / origW
            const hChange = Math.abs(nh - origH) / origH
            
            if (wChange > hChange) {
              nh = nw / ratio
            } else {
              nw = nh * ratio
            }
            
            // Re-calculate position for handles that move the origin
            if (handle.includes('w')) nx = origX - (nw - origW)
            if (handle.includes('n')) ny = origY - (nh - origH)
          }

          updateLayer(activeScene.id, id, { x: nx, y: ny, width: nw, height: nh })
        }
      }
    }

    const handleMouseUp = () => {
      dragRef.current = null
      resizeRef.current = null
      rotateRef.current = null
      setIsPanning(false)
      setActiveGuides({ x: false, y: false })
    }

    const handleWheel = (e: WheelEvent) => {
      // Global wheel handling for smart zoom is now handled via React callback for better event context
      // but we still keep this here to prevent default browser behavior when zooming
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
      }
    }

    window.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('wheel', handleWheel, { passive: false })

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        (window as any).__spacePressed = true
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault()
          undo()
        } else if (e.key.toLowerCase() === 'y') {
          e.preventDefault()
          redo()
        }
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        redo()
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        (window as any).__spacePressed = false
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('wheel', handleWheel)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [canvasWidth, canvasHeight, pan, zoom, fitScale, isPanning, undo, redo, screenToCanvas])

  const resolve = (layer: StudioLayer) => resolveLayerLayout(layer, aspectRatio)

  return (
    <div className="relative flex-1 flex flex-col bg-black/40 overflow-hidden [text-rendering:optimizeLegibility] [-webkit-font-smoothing:antialiased]" ref={wrapperRef} style={{ '--preview-scale': scaleRef.current } as any}>
      {/* Toolbar */}
      <div className="h-12 px-4 border-b border-white/5 flex items-center justify-between bg-black/20 backdrop-blur-md z-20">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 border border-white/10">
            <Monitor size={14} className="text-accent" />
            <span className="text-[10px] font-black uppercase tracking-tighter text-white/60">
              {canvasWidth}x{canvasHeight}
            </span>
          </div>
          <button 
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors"
          >
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => { setPan({ x: 0, y: 0 }); setZoom(1) }}
            className="flex items-center gap-2 px-3 py-1.5 rounded bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-all group"
          >
            <RotateCcw size={14} className="group-hover:rotate-[-45deg] transition-transform" />
            <span className="text-[10px] font-black uppercase tracking-widest">Reset View</span>
          </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div 
        ref={viewportRef}
        onWheel={handleWheel}
        onMouseDown={(e) => {
          if (e.button !== 0 || (window as any).__spacePressed) return
          if (e.button === 0 && (window as any).__spacePressed) {
            setIsPanning(true)
            return
          }
          setSelectedLayer(null)
        }}
        onMouseUp={() => setIsPanning(false)}
        onMouseLeave={() => setIsPanning(false)}
        className={`flex-1 relative overflow-auto custom-scrollbar bg-[#0a0a0a] ${isPanning ? 'cursor-grabbing' : ((window as any).__spacePressed ? 'cursor-grab' : '')}`}
      >
        <div 
          className="min-w-full min-h-full p-[50vh_50vw] flex"
          style={{ width: 'max-content', height: 'max-content' }}
        >
          <div 
            ref={containerRef}
            className="relative m-auto flex-none shadow-[2xl] border border-white/10 bg-[#050505] transition-shadow duration-300"
          >
            <canvas
              ref={canvasRef}
              width={canvasWidth}
              height={canvasHeight}
              className="block w-full h-full [image-rendering:auto] [backface-visibility:hidden] [transform:translateZ(0)]"
              style={{ 
                imageRendering: zoom > 1 ? 'pixelated' : 'auto',
                willChange: 'transform'
              }}
            />
          
          {/* Performance HUD */}
          <div className="absolute top-4 left-4 px-2 py-1 bg-black/60 rounded border border-white/10 flex items-center gap-2 pointer-events-none backdrop-blur-md z-10">
            <div className={`w-2 h-2 rounded-full ${fps >= (outputFps - 2) ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-amber-500 shadow-[0_0_8px_#f59e0b]'}`} />
            <span className="text-[10px] font-black tabular-nums text-white/90">{fps} FPS</span>
            <span className="text-[8px] font-bold text-white/25 uppercase tracking-tighter">{captureInputFormat}</span>
          </div>
          
          {/* Selection & Guides */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {activeGuides.x && <div className="absolute left-0 top-0 bottom-0 w-px bg-accent/40 shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" />}
            {activeGuides.y && <div className="absolute top-0 left-0 right-0 h-px bg-accent/40 shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]" />}
          </div>

          {/* Interaction Layer */}
          {activeScene.layers.map(layer => {
            const layout = resolve(layer)
            if (!layout.visible) return null
            const isSelected = selectedLayerId === layer.id
            const isCropping = resizeRef.current?.id === layer.id && resizeRef.current?.isCropping
            
            return (
              <div
                key={layer.id}
                onMouseDown={(e) => handleMouseDown(e, layer)}
                className={`absolute pointer-events-auto cursor-move transition-shadow duration-300 ${
                  isSelected 
                    ? `${isCropping ? 'ring-2 ring-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.3)]' : 'ring-2 ring-accent shadow-[0_0_30px_rgba(var(--accent-rgb),0.3)]'} z-10` 
                    : 'hover:ring-1 hover:ring-white/20'
                }`}
                style={{
                  left: `calc(${layout.x}px * var(--preview-scale))`,
                  top: `calc(${layout.y}px * var(--preview-scale))`,
                  width: `calc(${layout.width}px * var(--preview-scale))`,
                  height: `calc(${layout.height}px * var(--preview-scale))`,
                  transform: `rotate(${Number(layout.rotation || 0)}deg)`,
                  transformOrigin: 'center center'
                }}
              >
                {isSelected && (
                  <>
                    <div
                      className="absolute left-1/2 top-0 h-9 w-px -translate-x-1/2 -translate-y-full bg-accent/70 pointer-events-none"
                    />
                    <button
                      onMouseDown={(e) => handleRotateStart(e, layer)}
                      className="absolute left-1/2 top-0 flex h-7 w-7 -translate-x-1/2 -translate-y-[calc(100%+30px)] items-center justify-center rounded-full border-2 border-accent bg-[#050505] text-accent shadow-lg hover:scale-110 hover:bg-accent hover:text-white transition-all pointer-events-auto z-40"
                      title="Rotate layer. Hold Shift for 15-degree steps."
                    >
                      <RotateCw size={14} />
                    </button>
                    {(['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'] as HandleDir[]).map(dir => (
                      <div
                        key={dir}
                        onMouseDown={(e) => handleResizeStart(e, layer, dir)}
                        className={`absolute ${dir.length === 1 ? 'w-5 h-2' : 'w-3.5 h-3.5'} bg-white border-2 ${isCropping ? 'border-emerald-500 bg-emerald-50' : 'border-accent'} rounded-full -translate-x-1/2 -translate-y-1/2 shadow-lg hover:scale-125 transition-transform cursor-pointer pointer-events-auto z-30`}
                        style={{
                          left: dir.includes('e') ? '100%' : (dir.includes('w') ? '0%' : '50%'),
                          top: dir.includes('s') ? '100%' : (dir.includes('n') ? '0%' : '50%'),
                          cursor: HANDLE_CURSORS[dir],
                          width: dir.length === 1 ? (['n', 's'].includes(dir) ? '16px' : '6px') : '14px',
                          height: dir.length === 1 ? (['n', 's'].includes(dir) ? '6px' : '16px') : '14px',
                          borderRadius: dir.length === 1 ? '2px' : '50%'
                        }}
                      />
                    ))}
                    <div 
                      className="absolute flex items-center gap-1 z-20"
                      style={{
                        bottom: layout.y < 40 ? 'auto' : '100%',
                        top: layout.y < 40 ? '100%' : 'auto',
                        left: layout.x < 120 ? '0' : (layout.x + layout.width > canvasWidth - 120 ? 'auto' : '50%'),
                        right: layout.x + layout.width > canvasWidth - 120 ? '0' : 'auto',
                        transform: `${layout.y < 40 ? 'translateY(8px)' : 'translateY(-8px)'} ${layout.x < 120 || layout.x + layout.width > canvasWidth - 120 ? 'translateX(0)' : 'translateX(-50%)'}`,
                        maxWidth: '300px',
                        width: 'max-content'
                      }}
                    >
                      <div className={`px-2 py-1 ${isCropping ? 'bg-emerald-500' : 'bg-accent'} text-white text-[9px] font-black rounded uppercase tracking-widest shadow-lg whitespace-nowrap`}>
                        {isCropping ? `Cropping: ${layer.name}` : layer.name}
                      </div>
                      {(layer.type === 'widget' || layer.type === 'browser' || layer.type === 'image') && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAutoCrop(layer) }}
                          className="px-2 py-1 bg-white text-accent hover:bg-accent hover:text-white transition-colors text-[9px] font-black rounded uppercase tracking-widest shadow-lg pointer-events-auto"
                          title="Auto-Crop to Content"
                        >
                          Auto-Wrap
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
          </div>
        </div>
      </div>

      {/* OBS-style Zoom & Status Bar */}
      <div className="shrink-0 h-10 px-4 bg-black/40 border-t border-white/5 flex items-center justify-between backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-2 py-1 bg-white/5 rounded-md border border-white/5">
            <div className={`w-1.5 h-1.5 rounded-full ${fps >= (outputFps - 2) ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span className="text-[10px] font-black tabular-nums text-white/60">{fps} FPS</span>
          </div>
          <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">{captureInputFormat.toUpperCase()}</span>
        </div>

        <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5 border border-white/10">
          <button 
            onClick={() => setZoom(z => Math.max(0.05, z * 0.8))}
            className="p-1.5 hover:bg-white/10 rounded-md text-white/40 hover:text-white transition-all"
            title="Zoom Out"
          >
            <Minimize size={14} />
          </button>
          
          <div className="px-2 min-w-[60px] text-center">
            <span className="text-[11px] font-black tabular-nums text-white/80">
              {Math.round(zoom * 100)}%
            </span>
          </div>

          <button 
            onClick={() => setZoom(z => Math.min(10, z * 1.2))}
            className="p-1.5 hover:bg-white/10 rounded-md text-white/40 hover:text-white transition-all"
            title="Zoom In"
          >
            <Maximize size={14} />
          </button>

          <div className="w-px h-4 bg-white/10 mx-1" />

          <button 
            onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}
            className="p-1.5 hover:bg-white/10 rounded-md text-white/40 hover:text-white transition-all flex items-center gap-1.5"
            title="Reset Zoom"
          >
            <RotateCcw size={14} />
            <span className="text-[9px] font-black uppercase">Fit</span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-[10px] font-bold text-white/20">
          <span>{canvasWidth}x{canvasHeight}</span>
          <span className="opacity-50">|</span>
          <span className="uppercase">{aspectRatio}</span>
        </div>
      </div>

      {/* Offscreen Video Elements */}
      <div style={{ position: 'fixed', left: -9999, top: -9999, width: 1, height: 1, overflow: 'hidden', pointerEvents: 'none' }}>
        {Object.entries(videoRefs.current).map(([id, video]) => (
          <div key={id} ref={el => { if (el && video && !el.contains(video)) el.appendChild(video) }} />
        ))}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
})

function isLikelyScreenBorderLayer(layer?: StudioLayer): boolean {
  if (!layer) return false
  const haystack = `${layer.name || ''} ${layer.config?.widgetType || ''} ${layer.config?.type || ''}`.toLowerCase()
  return haystack.includes('screen border') || haystack.includes('screen-border')
}
