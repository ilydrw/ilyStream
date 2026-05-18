import { useEffect, useRef, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useStudioStore } from '../../stores/studio-store'
import { resolveLayerLayout } from '../../../shared/studio'
import {
  croppedSourceRect,
  drawAndCacheMediaFrame,
  drawFittedSource,
  drawMediaFallback,
  resolveSourceFitMode,
  resolveBrowserCaptureSettings,
  resolveBrowserSourceUrl
} from './components/CanvasEditor.utils'
import {
  buildCameraConstraints,
  getMediaSignature,
  disposeMediaElement,
  ManagedMediaElement
} from './utils/media-init'

interface Props {
  sceneId?: string
  layerId?: string
}

export default function StudioOverlayPage({ sceneId: explicitSceneId, layerId: explicitLayerId }: Props) {
  const params = useParams()
  const searchParams = new URLSearchParams(window.location.search)
  const sceneId = explicitSceneId || params.sceneId || searchParams.get('projectorSceneId')
  const layerId = explicitLayerId || searchParams.get('projectorLayerId')
  const queryAspectRatio = searchParams.get('aspectRatio') as '16:9' | '9:16' | null
  const scenes = useStudioStore(s => s.scenes)
  const storeCanvasWidth = useStudioStore(s => s.canvasWidth)
  const storeCanvasHeight = useStudioStore(s => s.canvasHeight)
  const storeAspectRatio = useStudioStore(s => s.aspectRatio)
  const aspectRatio = queryAspectRatio || storeAspectRatio

  // Resolve target dimensions for this projector based on the requested aspect ratio
  const canvasWidth = aspectRatio === '9:16'
    ? (storeAspectRatio === '9:16' ? storeCanvasWidth : storeCanvasHeight)
    : (storeAspectRatio === '9:16' ? storeCanvasHeight : storeCanvasWidth)

  const canvasHeight = aspectRatio === '9:16'
    ? (storeAspectRatio === '9:16' ? storeCanvasHeight : storeCanvasWidth)
    : (storeAspectRatio === '9:16' ? storeCanvasWidth : storeCanvasHeight)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRefs = useRef<Record<string, HTMLVideoElement>>({})
  const imageCache = useRef<Record<string, HTMLImageElement>>({})
  const mediaFrameCache = useRef<Record<string, any>>({})
  const [overlayPort, setOverlayPort] = useState(8899)
  const browserFrameWorkerRef = useRef<Worker | null>(null)
  const activeBrowserBitmapsRef = useRef<Record<string, ImageBitmap>>({})
  const browserBlankFrames = useRef<Record<string, number>>({})
  const capturedBrowserSourceIds = useRef<Set<string>>(new Set())
  const browserBlankHoldFrames = useRef(45)
  const browserWorkerBusy = useRef<Record<string, boolean>>({})
  const latestBrowserBitmaps = useRef<Record<string, any>>({})

  const activeScene = useMemo(() => {
    const scene = scenes.find(s => s.id === sceneId) || scenes[0]
    console.log('[StudioOverlay] Initializing. sceneId:', sceneId, 'aspectRatio:', aspectRatio, 'resolvedScene:', scene?.name)
    return scene
  }, [scenes, sceneId, aspectRatio])
  const activeSceneRef = useRef(activeScene)
  useEffect(() => { activeSceneRef.current = activeScene }, [activeScene])

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])

  useEffect(() => {
    const updateDevices = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true }).catch(() => null)
        stream?.getTracks().forEach(t => t.stop())
        const devs = await navigator.mediaDevices.enumerateDevices()
        setDevices(devs)
      } catch (err) {
        console.error('[Projector] Device enumeration failed:', err)
      }
    }
    updateDevices()
    navigator.mediaDevices.addEventListener('devicechange', updateDevices)
    return () => navigator.mediaDevices.removeEventListener('devicechange', updateDevices)
  }, [])

  useEffect(() => {
    const initialPort = (window as any).overlayPort || 8899
    setOverlayPort(initialPort)
  }, [])

  useEffect(() => {
    const applyStatus = (s: any) => {
      if (s?.port) setOverlayPort(s.port)
    }
    window.api?.overlay?.getStatus().then(applyStatus)
    const unsubscribe = window.api?.on?.('overlay:status-changed', applyStatus)
    const statusTimer = window.setInterval(() => {
      void window.api?.overlay?.getStatus?.().then(applyStatus)
    }, 3000)
    return () => {
      unsubscribe?.()
      window.clearInterval(statusTimer)
    }
  }, [])

  useEffect(() => {
    const worker = new Worker(
      new URL('../../workers/browser-frame.worker.ts', import.meta.url),
      { type: 'module' }
    )
    browserFrameWorkerRef.current = worker
    worker.onmessage = (event) => {
      const { bitmap, id, isBlank } = event.data
      browserWorkerBusy.current[id] = false
      if (!capturedBrowserSourceIds.current.has(id)) {
        try { bitmap?.close?.() } catch {}
        return
      }
      const previous = activeBrowserBitmapsRef.current[id]
      if (isBlank && previous) {
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
      if (previous) previous.close()
      activeBrowserBitmapsRef.current[id] = bitmap
      if (latestBrowserBitmaps.current[id]) {
        const payload = latestBrowserBitmaps.current[id]
        delete latestBrowserBitmaps.current[id]
        sendToWorker(payload)
      }
    }
    const sendToWorker = (payload: any) => {
      const { id, bitmap, width, height } = payload
      const layer = activeSceneRef.current?.layers.find(l => l.id === id)
      browserWorkerBusy.current[id] = true
      postWorkerFrame(worker, {
        id,
        source: bitmap,
        width,
        height,
        transparentBackground: layer?.config?.transparentBackground !== false,
        transparentChromaTolerance: isLikelyScreenBorderLayer(layer) ? 48 : 8
      }, bitmap)
    }
    return () => {
      worker.onmessage = null
      worker.terminate()
      for (const bitmap of Object.values(activeBrowserBitmapsRef.current)) {
        try { bitmap.close() } catch {}
      }
      activeBrowserBitmapsRef.current = {}
      browserBlankFrames.current = {}
    }
  }, [])

  const lastBrowserConfigs = useRef<Record<string, string>>({})
  useEffect(() => {
    if (!window.api?.studio) return
    const activeIds = new Set<string>()
    if (activeScene) {
      for (const layer of activeScene.layers) {
        if (layer.type !== 'widget' && layer.type !== 'browser') continue
        const layout = resolveLayerLayout(layer, aspectRatio)
        if (!layout.visible && !layerId) continue
        activeIds.add(layer.id)
        const url = resolveBrowserSourceUrl(layer, overlayPort)
        const capture = resolveBrowserCaptureSettings(layer, layout.width, layout.height)
        const config = { id: layer.id, url, ...capture }
        const configSig = JSON.stringify(config)
        if (capturedBrowserSourceIds.current.has(layer.id)) {
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
    }
    for (const id of Array.from(capturedBrowserSourceIds.current)) {
      if (!activeIds.has(id)) {
        capturedBrowserSourceIds.current.delete(id)
        delete lastBrowserConfigs.current[id]
        const bitmap = activeBrowserBitmapsRef.current[id]
        if (bitmap) {
          try { bitmap.close() } catch {}
          delete activeBrowserBitmapsRef.current[id]
        }
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

  useEffect(() => {
    const unsub = window.api?.on?.('browser-source:frame', async (frame: any) => {
      const { id } = frame
      if (browserWorkerBusy.current[id]) {
        latestBrowserBitmaps.current[id] = frame
      } else {
        const worker = browserFrameWorkerRef.current
        if (!worker) return
        const { id, bitmap, width, height } = frame
        const layer = activeSceneRef.current?.layers.find(l => l.id === id)
        browserWorkerBusy.current[id] = true
        postWorkerFrame(worker, {
          id,
          source: bitmap,
          width,
          height,
          transparentBackground: layer?.config?.transparentBackground !== false,
          transparentChromaTolerance: isLikelyScreenBorderLayer(layer) ? 48 : 8
        }, bitmap)
      }
    })
    return () => unsub?.()
  }, [])

  useEffect(() => {
    if (!activeScene) return
    for (const layer of activeScene.layers) {
      if (layer.type === 'image' && layer.config.assetPath && !imageCache.current[layer.id]) {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        const src = resolveImageSource(layer.config.assetPath)
        img.src = src
        imageCache.current[layer.id] = img
      }
    }
  }, [activeScene])

  const pendingMedia = useRef(new Set<string>())
  useEffect(() => {
    if (!activeScene) return
    const activeLayerIds = new Set(activeScene.layers.map(l => l.id))
    for (const id in videoRefs.current) {
      const el = videoRefs.current[id] as ManagedMediaElement
      const layer = activeScene.layers.find(l => l.id === id)
      const sig = layer ? getMediaSignature(layer, devices) : null
      const hasChanged = el.__ilySignature !== sig
      if (!activeLayerIds.has(id) || hasChanged) {
        disposeMediaElement(el)
        delete videoRefs.current[id]
        pendingMedia.current.delete(id)
      }
    }
    for (const layer of activeScene.layers) {
      if ((layer.type === 'camera' || layer.type === 'display') && !videoRefs.current[layer.id] && !pendingMedia.current.has(layer.id)) {
        pendingMedia.current.add(layer.id)
        const sig = getMediaSignature(layer, devices)
        const startStream = async () => {
          try {
            let stream: MediaStream
            if (layer.type === 'display') {
               let sourceId = String(layer.config.desktopSourceId || '')
               const sourceName = String(layer.config.desktopSourceName || '')
               if (sourceName && window.api?.studio?.getDesktopSources) {
                 const sources = await window.api.studio.getDesktopSources()
                 const match =
                   sources.find((source: { name: string; id: string }) => source.name === sourceName) ||
                   sources.find((source: { name: string; id: string }) => source.name.toLowerCase().includes(sourceName.toLowerCase()))
                 sourceId = match?.id || sourceId
               }
               if (sourceId && window.api?.studio?.prepareDisplayCapture) {
                 const prepared = await window.api.studio.prepareDisplayCapture({ sourceId, withAudio: false, audioOnly: false })
                 if (!prepared?.success) throw new Error(prepared?.error || 'Could not prepare desktop capture')
               }
               stream = await navigator.mediaDevices.getDisplayMedia({
                  video: { width: canvasWidth, height: canvasHeight, frameRate: 30 },
                  audio: false
                } as MediaStreamConstraints)
            } else {
               const constraints = buildCameraConstraints(layer, devices)
               stream = await navigator.mediaDevices.getUserMedia(constraints)
            }
            const video = document.createElement('video')
            video.srcObject = stream; video.muted = true; video.setAttribute('playsinline', ''); await video.play()
            const managed = video as ManagedMediaElement
            managed.__ilySignature = sig
            managed.__ilyCleanup = () => { stream.getTracks().forEach(t => t.stop()) }
            videoRefs.current[layer.id] = video
          } catch (err) {
            console.error('[Projector] Failed to start media stream for layer', layer.id, err)
            pendingMedia.current.delete(layer.id)
          }
        }
        void startStream()
      }
    }
  }, [activeScene, canvasWidth, canvasHeight, devices])

  useEffect(() => {
    let frameId: number
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    const minRenderFps = 30
    const maxRenderFps = 60
    let targetRenderFps = maxRenderFps
    let targetFrameMs = 1000 / targetRenderFps
    let lastRenderAt = 0
    let renderFrameCount = 0
    let perfWindowStart = performance.now()
    let perfFrameCount = 0
    let perfRenderTime = 0

    const render = () => {
      const renderStartedAt = performance.now()
      const now = renderStartedAt
      if (lastRenderAt > 0 && now - lastRenderAt < targetFrameMs - 1) {
        frameId = requestAnimationFrame(render); return
      }
      lastRenderAt = lastRenderAt === 0 ? now : now - ((now - lastRenderAt) % targetFrameMs)
      renderFrameCount++

      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const currentScene = activeSceneRef.current
      if (!currentScene) { frameId = requestAnimationFrame(render); return }

      const layersToDraw = layerId
        ? currentScene.layers.filter(l => l.id === layerId)
        : [...currentScene.layers].sort((a, b) => a.zIndex - b.zIndex)

      for (const raw of layersToDraw) {
        const layout = resolveLayerLayout(raw, aspectRatio)
        if (!layout.visible && !layerId) continue

        let drawLayout = { ...layout }
        if (layerId) {
          const canvasRatio = canvas.width / canvas.height
          const layerRatio = layout.width / layout.height
          if (layerRatio > canvasRatio) {
            drawLayout.width = canvas.width; drawLayout.height = canvas.width / layerRatio
          } else {
            drawLayout.height = canvas.height; drawLayout.width = canvas.height * layerRatio
          }
          drawLayout.x = (canvas.width - drawLayout.width) / 2
          drawLayout.y = (canvas.height - drawLayout.height) / 2
        }

        ctx.save()
        const e = raw.enhancements || {}
        const filters: string[] = []
        if (e.brightness !== undefined && e.brightness !== 100) filters.push(`brightness(${e.brightness}%)`)
        if (e.contrast !== undefined && e.contrast !== 100) filters.push(`contrast(${e.contrast}%)`)
        if (e.saturation !== undefined && e.saturation !== 100) filters.push(`saturate(${e.saturation}%)`)
        if (e.filterPreset && e.filterPreset !== 'none') {
          if (e.filterPreset === 'bw') filters.push('grayscale(100%)')
          if (e.filterPreset === 'sepia') filters.push('sepia(100%)')
          if (e.filterPreset === 'vintage') filters.push('sepia(50%) contrast(120%) saturate(80%)')
          if (e.filterPreset === 'vivid') filters.push('saturate(180%) contrast(110%)')
          if (e.filterPreset === 'kodachrome') filters.push('saturate(150%) contrast(110%) brightness(105%)')
          if (e.filterPreset === 'polaroid') filters.push('contrast(110%) brightness(110%) saturate(130%)')
          if (e.filterPreset === 'cold') filters.push('hue-rotate(180deg) saturate(80%)')
          if (e.filterPreset === 'warm') filters.push('sepia(30%) saturate(140%)')
          if (e.filterPreset === 'faded') filters.push('opacity(80%) saturate(60%) brightness(110%)')
        }
        if (filters.length > 0) ctx.filter = filters.join(' ')

        ctx.globalAlpha = raw.opacity ?? 1
        const rotation = Number(layout.rotation || 0)
        const fitMode = resolveSourceFitMode(raw)
        if (rotation) {
          ctx.translate(drawLayout.x + drawLayout.width / 2, drawLayout.y + drawLayout.height / 2)
          ctx.rotate(rotation * Math.PI / 180)
          drawLayout.x = -drawLayout.width / 2; drawLayout.y = -drawLayout.height / 2
        }

        const shape = (typeof e.shape === 'object' ? e.shape.type : e.shape) || 'none'
        const scope = (typeof e.shape === 'object' ? e.shape.scope : 'both')
        const captureX = (typeof e.shape === 'object' ? e.shape.captureX : 50) ?? 50
        const captureY = (typeof e.shape === 'object' ? e.shape.captureY : 50) ?? 50
        const cx = ((captureX - 50) / 100) * drawLayout.width
        const cy = ((captureY - 50) / 100) * drawLayout.height

        const shouldClip = shape !== 'none' && (scope === 'both' || scope === aspectRatio)
        if (shouldClip) {
          ctx.beginPath()
          const offX = typeof e.shape === 'object' ? (e.shape.x - 50) / 100 * drawLayout.width : 0
          const offY = typeof e.shape === 'object' ? (e.shape.y - 50) / 100 * drawLayout.height : 0
          const scaleFac = typeof e.shape === 'object' ? e.shape.scale / 100 : 1
          const sx = drawLayout.x + drawLayout.width / 2 + offX
          const sy = drawLayout.y + drawLayout.height / 2 + offY
          const sw = scaleFac * drawLayout.width
          const sh = scaleFac * drawLayout.height
          const r = Math.min(sw, sh) / 2

          if (shape === 'circle') ctx.arc(sx, sy, r, 0, Math.PI * 2)
          else if (shape === 'star') {
            const spikes = 5, outerR = r, innerR = r/2.5; let rot = Math.PI/2*3, step = Math.PI/spikes
            ctx.moveTo(sx, sy - outerR)
            for(let i=0; i<spikes; i++) {
              ctx.lineTo(sx + Math.cos(rot) * outerR, sy + Math.sin(rot) * outerR); rot += step
              ctx.lineTo(sx + Math.cos(rot) * innerR, sy + Math.sin(rot) * innerR); rot += step
            }
            ctx.lineTo(sx, sy - outerR)
          } else if (shape === 'heart') {
            const d = r * 2.2, hx = sx, hy = sy - d/4; ctx.moveTo(hx, hy + d/4)
            ctx.bezierCurveTo(hx, hy + d/4, hx - d/2, hy, hx - d/2, hy - d/4)
            ctx.bezierCurveTo(hx - d/2, hy - d/2, hx, hy - d/2, hx, hy - d/4)
            ctx.bezierCurveTo(hx, hy - d/2, hx + d/2, hy - d/2, hx + d/2, hy - d/4)
            ctx.bezierCurveTo(hx + d/2, hy, hx, hy + d/4, hx, hy + d/4)
          } else if (shape === 'diamond') { ctx.moveTo(sx, sy - r); ctx.lineTo(sx + r, sy); ctx.lineTo(sx, sy + r); ctx.lineTo(sx - r, sy) }
          else if (shape === 'hexagon') { for(let i=0; i<6; i++) ctx.lineTo(sx + r * Math.cos(i * Math.PI/3), sy + r * Math.sin(i * Math.PI/3)) }
          else {
            const cr = (e.cornerRadius || 0) * (Math.min(sw, sh) / 200)
            const rx = sx - sw / 2, ry = sy - sh / 2
            if ((ctx as any).roundRect) (ctx as any).roundRect(rx, ry, sw, sh, cr)
            else ctx.rect(rx, ry, sw, sh)
          }

          if (typeof e.shape === 'object' && e.shape.shadow?.enabled) {
            ctx.save()
            const s = e.shape.shadow
            ctx.shadowColor = s.color || '#000000'
            ctx.shadowBlur = s.blur ?? 15
            ctx.shadowOffsetX = s.offsetX ?? 0
            ctx.shadowOffsetY = s.offsetY ?? 10
            ctx.fillStyle = 'black'
            ctx.fill()
            ctx.restore()
          }

          ctx.clip()
        }

        if (raw.type === 'camera' || raw.type === 'display') {
          const video = videoRefs.current[raw.id]
          if (video && video.readyState >= 2) {
            const coversProgram = drawLayout.width >= canvas.width * 0.85 && drawLayout.height >= canvas.height * 0.85
            const drawSource = (withBlur = false) => {
              const oldFilter = ctx.filter
              if (withBlur && e.focusCircle?.enabled) ctx.filter = `${oldFilter === 'none' ? '' : oldFilter} blur(${(e.focusCircle.blur / 100) * 40}px)`
              const sx_orig = drawLayout.x, sy_orig = drawLayout.y
              drawLayout.x -= cx; drawLayout.y -= cy
              drawAndCacheMediaFrame(ctx, mediaFrameCache.current, raw.id, video, drawLayout, renderFrameCount, drawLayout.crop, coversProgram ? 1 : 2, fitMode)
              drawLayout.x = sx_orig; drawLayout.y = sy_orig; ctx.filter = oldFilter
            }
            drawSource(true)
            if (e.focusCircle?.enabled) {
              ctx.save(); ctx.beginPath()
              const fx = drawLayout.x + (e.focusCircle.x / 100) * drawLayout.width, fy = drawLayout.y + (e.focusCircle.y / 100) * drawLayout.height
              const fr = (e.focusCircle.radius / 100) * (Math.max(drawLayout.width, drawLayout.height) / 2)
              ctx.arc(fx, fy, fr, 0, Math.PI * 2); ctx.clip(); drawSource(false); ctx.restore()
            }
          } else drawMediaFallback(ctx, mediaFrameCache.current, raw.id, drawLayout, 'WAITING', raw.name, { showBadge: false })
        } else if (raw.type === 'text') {
          ctx.fillStyle = raw.config.color || '#fff'; ctx.font = `bold ${raw.config.fontSize || 48}px Inter`
          ctx.fillText(raw.config.text || '', drawLayout.x, drawLayout.y + (raw.config.fontSize || 48))
        } else if (raw.type === 'image') {
          const img = imageCache.current[raw.id]
          if (img && img.complete && img.naturalWidth > 0) {
            drawFittedSource(
              ctx,
              img,
              croppedSourceRect(img.naturalWidth || img.width, img.naturalHeight || img.height, drawLayout.crop),
              { x: drawLayout.x - cx, y: drawLayout.y - cy, width: drawLayout.width, height: drawLayout.height },
              fitMode
            )
          }
        } else if (raw.type === 'browser' || raw.type === 'widget') {
          const bitmap = activeBrowserBitmapsRef.current[raw.id]
          if (bitmap) {
            drawFittedSource(
              ctx,
              bitmap,
              croppedSourceRect(bitmap.width, bitmap.height, drawLayout.crop),
              { x: drawLayout.x - cx, y: drawLayout.y - cy, width: drawLayout.width, height: drawLayout.height },
              raw.type === 'widget' ? 'stretch' : fitMode
            )
          }
        }
        ctx.restore()

        // --- DRAW SHAPE BORDER ---
        if (shouldClip && typeof e.shape === 'object' && e.shape.border?.enabled) {
          const b = e.shape.border
          ctx.save()

          const offX = (e.shape.x - 50) / 100 * drawLayout.width
          const offY = (e.shape.y - 50) / 100 * drawLayout.height
          const scaleFac = e.shape.scale / 100
          const sx = drawLayout.x + drawLayout.width / 2 + offX
          const sy = drawLayout.y + drawLayout.height / 2 + offY
          const sw = scaleFac * drawLayout.width
          const sh = scaleFac * drawLayout.height
          const r = Math.min(sw, sh) / 2

          ctx.beginPath()
          if (shape === 'circle') ctx.arc(sx, sy, r, 0, Math.PI * 2)
          else if (shape === 'star') {
            const spikes = 5, outerR = r, innerR = r/2.5; let rot = Math.PI/2*3, step = Math.PI/spikes
            ctx.moveTo(sx, sy - outerR)
            for(let i=0; i<spikes; i++) {
              ctx.lineTo(sx + Math.cos(rot) * outerR, sy + Math.sin(rot) * outerR); rot += step
              ctx.lineTo(sx + Math.cos(rot) * innerR, sy + Math.sin(rot) * innerR); rot += step
            }
            ctx.lineTo(sx, sy - outerR)
          } else if (shape === 'heart') {
            const d = r * 2.2, hx = sx, hy = sy - d/4; ctx.moveTo(hx, hy + d/4)
            ctx.bezierCurveTo(hx, hy + d/4, hx - d/2, hy, hx - d/2, hy - d/4)
            ctx.bezierCurveTo(hx - d/2, hy - d/2, hx, hy - d/2, hx, hy - d/4)
            ctx.bezierCurveTo(hx, hy - d/2, hx + d/2, hy - d/2, hx + d/2, hy - d/4)
            ctx.bezierCurveTo(hx + d/2, hy, hx, hy + d/4, hx, hy + d/4)
          } else if (shape === 'diamond') { ctx.moveTo(sx, sy - r); ctx.lineTo(sx + r, sy); ctx.lineTo(sx, sy + r); ctx.lineTo(sx - r, sy) }
          else if (shape === 'hexagon') { for(let i=0; i<6; i++) ctx.lineTo(sx + r * Math.cos(i * Math.PI/3), sy + r * Math.sin(i * Math.PI/3)) }
          else {
            const cr = (e.cornerRadius || 0) * (Math.min(sw, sh) / 200)
            const rx = sx - sw / 2, ry = sy - sh / 2
            if ((ctx as any).roundRect) (ctx as any).roundRect(rx, ry, sw, sh, cr)
            else ctx.rect(rx, ry, sw, sh)
          }

          const vol = (window as any).__masterVolume || 0
          const reactiveScale = b.audioReactive ? 1 + (vol * 1.5) : 1

          ctx.lineWidth = (b.thickness || 4) * reactiveScale
          ctx.lineJoin = 'round'
          ctx.lineCap = 'round'
          ctx.globalAlpha = Math.min(1, ((b.opacity ?? 100) / 100) * (b.audioReactive ? 0.8 + vol * 0.4 : 1))

          if (b.type === 'chroma') {
            const grad = ctx.createLinearGradient(sx - r, sy - r, sx + r, sy + r)
            const time = performance.now() / 2000
            grad.addColorStop(0, `hsl(${(time * 360) % 360}, 100%, 50%)`)
            grad.addColorStop(0.5, `hsl(${(time * 360 + 180) % 360}, 100%, 50%)`)
            grad.addColorStop(1, `hsl(${(time * 360 + 360) % 360}, 100%, 50%)`)
            ctx.strokeStyle = grad
            ctx.shadowBlur = 15 * reactiveScale
            ctx.shadowColor = `hsl(${(time * 360) % 360}, 100%, 50%)`
          } else if (b.type === 'cyber') {
            const grad = ctx.createLinearGradient(sx - r, sy, sx + r, sy)
            grad.addColorStop(0, '#00f2ff') // Cyan
            grad.addColorStop(1, '#d035f1') // Purple
            ctx.strokeStyle = grad
            ctx.shadowBlur = 20 * reactiveScale
            ctx.shadowColor = '#d035f1'
          } else {
            ctx.strokeStyle = b.color || '#ffffff'
          }

          ctx.stroke()
          ctx.restore()
        }
      }
      perfFrameCount++; perfRenderTime += performance.now() - renderStartedAt
      if (performance.now() - perfWindowStart >= 1500) {
        const avgRenderMs = perfRenderTime / perfFrameCount; const budgetMs = 1000 / targetRenderFps
        if (avgRenderMs > budgetMs * 0.75 && targetRenderFps > minRenderFps) { targetRenderFps -= 10; targetFrameMs = 1000 / targetRenderFps }
        else if (avgRenderMs < budgetMs * 0.45 && targetRenderFps < maxRenderFps) { targetRenderFps += 5; targetFrameMs = 1000 / targetRenderFps }
        perfWindowStart = performance.now(); perfFrameCount = 0; perfRenderTime = 0
      }
      frameId = requestAnimationFrame(render)
    }
    frameId = requestAnimationFrame(render); return () => cancelAnimationFrame(frameId)
  }, [canvasWidth, canvasHeight, aspectRatio, layerId])

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black text-white" style={{ colorScheme: 'dark' }}>
      <canvas ref={canvasRef} width={canvasWidth} height={canvasHeight} className="w-full h-full object-contain bg-black" />
    </div>
  )
}

function isLikelyScreenBorderLayer(layer?: { name?: string; config?: Record<string, any> }): boolean {
  if (!layer) return false
  const haystack = `${layer.name || ''} ${layer.config?.widgetType || ''} ${layer.config?.type || ''}`.toLowerCase()
  return haystack.includes('screen border') || haystack.includes('screen-border')
}

function postWorkerFrame(worker: Worker, message: unknown, source: unknown): void {
  const transfer = getFrameTransferList(source)
  try { worker.postMessage(message, transfer) } catch { worker.postMessage(message) }
}

function getFrameTransferList(source: unknown): Transferable[] {
  if (source instanceof ArrayBuffer) return [source]
  if (ArrayBuffer.isView(source) && source.buffer instanceof ArrayBuffer) return [source.buffer]
  return []
}

function resolveImageSource(assetPath?: string): string {
  if (!assetPath) return ''
  if (assetPath.startsWith('asset://')) {
    const assetId = assetPath.replace(/^asset:\/+/, '').replace(/^app\//, '')
    return `asset:///app/${encodeURIComponent(assetId)}`
  }
  if (/^[a-z]+:\/\//i.test(assetPath)) return assetPath
  return `file:///${assetPath.replace(/\\/g, '/')}`
}
