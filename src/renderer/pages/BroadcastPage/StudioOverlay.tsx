import { useEffect, useRef, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useStudioStore } from '../../stores/studio-store'
import { resolveLayerLayout } from '../../../shared/studio'
import {
  drawAndCacheMediaFrame,
  drawMediaFallback,
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
}

export default function StudioOverlayPage({ sceneId: explicitSceneId }: Props) {
  const params = useParams()
  const searchParams = new URLSearchParams(window.location.search)
  const sceneId = explicitSceneId || params.sceneId || searchParams.get('projectorSceneId')
  const scenes = useStudioStore(s => s.scenes)
  const canvasWidth = useStudioStore(s => s.canvasWidth)
  const canvasHeight = useStudioStore(s => s.canvasHeight)
  const aspectRatio = useStudioStore(s => s.aspectRatio)
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

  const activeScene = useMemo(() =>
    scenes.find(s => s.id === sceneId) || scenes[0]
  , [scenes, sceneId])
  const activeSceneRef = useRef(activeScene)
  useEffect(() => { activeSceneRef.current = activeScene }, [activeScene])

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])

  useEffect(() => {
    const updateDevices = async () => {
      try {
        // Ensure labels
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

  // Get initial port from window object if injected, or default to 8899
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
      worker.postMessage({
        id,
        source: bitmap,
        width,
        height,
        transparentBackground: layer?.config?.transparentBackground !== false,
        transparentChromaTolerance: isLikelyScreenBorderLayer(layer) ? 48 : 8
      })
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
        if (!layout.visible) continue

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
        worker.postMessage({
          id,
          source: bitmap,
          width,
          height,
          transparentBackground: layer?.config?.transparentBackground !== false,
          transparentChromaTolerance: isLikelyScreenBorderLayer(layer) ? 48 : 8
        })
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
    
    // Cleanup stale video refs
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
                 const prepared = await window.api.studio.prepareDisplayCapture({
                   sourceId,
                   withAudio: false,
                   audioOnly: false
                 })
                 if (!prepared?.success) {
                   throw new Error(prepared?.error || 'Could not prepare desktop capture')
                 }
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
            video.srcObject = stream
            video.muted = true
            video.setAttribute('playsinline', '')
            await video.play()
            
            const managed = video as ManagedMediaElement
            managed.__ilySignature = sig
            managed.__ilyCleanup = () => {
              stream.getTracks().forEach(t => t.stop())
            }
            
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
        frameId = requestAnimationFrame(render)
        return
      }

      lastRenderAt = lastRenderAt === 0
        ? now
        : now - ((now - lastRenderAt) % targetFrameMs)
      renderFrameCount++

      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const currentScene = activeSceneRef.current
      if (!currentScene) { frameId = requestAnimationFrame(render); return }

      const sorted = [...currentScene.layers].sort((a, b) => a.zIndex - b.zIndex)

      for (const raw of sorted) {
        const l = resolveLayerLayout(raw, aspectRatio)
        if (!l.visible) continue
        ctx.save()
        ctx.globalAlpha = l.opacity ?? 1
        const rotation = Number(l.rotation || 0)
        const drawLayout = rotation
          ? { ...l, x: -l.width / 2, y: -l.height / 2 }
          : l
        if (rotation) {
          ctx.translate(l.x + l.width / 2, l.y + l.height / 2)
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

          if (isReady) {
            try {
              const coversProgram = l.width >= canvas.width * 0.85 && l.height >= canvas.height * 0.85
              drawAndCacheMediaFrame(ctx, mediaFrameCache.current, l.id, video, drawLayout, renderFrameCount, l.crop, coversProgram ? 1 : 2)
            } catch {
              drawMediaFallback(ctx, mediaFrameCache.current, l.id, drawLayout, 'STALLED', l.name, { showBadge: false })
            }
          } else {
            drawMediaFallback(ctx, mediaFrameCache.current, l.id, drawLayout, track?.muted ? 'HIDDEN' : 'WAITING', l.name, { showBadge: false })
          }
        } else if (l.type === 'text') {
          ctx.fillStyle = l.config.color || '#fff'
          ctx.font = `bold ${l.config.fontSize || 48}px Inter`
          ctx.fillText(l.config.text || '', drawLayout.x, drawLayout.y + (l.config.fontSize || 48))
        } else if (l.type === 'image') {
          const img = imageCache.current[l.id]
          if (img && img.complete && img.naturalWidth > 0) {
            if (l.crop) {
              ctx.drawImage(
                img,
                l.crop.left, l.crop.top, img.naturalWidth - l.crop.left - l.crop.right, img.naturalHeight - l.crop.top - l.crop.bottom,
                drawLayout.x, drawLayout.y, drawLayout.width, drawLayout.height
              )
            } else {
              ctx.drawImage(img, drawLayout.x, drawLayout.y, drawLayout.width, drawLayout.height)
            }
          }
        } else if (l.type === 'browser' || l.type === 'widget') {
          const bitmap = activeBrowserBitmapsRef.current[l.id]
          if (bitmap) {
            if (l.crop) {
              ctx.drawImage(
                bitmap,
                l.crop.left, l.crop.top, bitmap.width - l.crop.left - l.crop.right, bitmap.height - l.crop.top - l.crop.bottom,
                drawLayout.x, drawLayout.y, drawLayout.width, drawLayout.height
              )
            } else {
              ctx.drawImage(bitmap, drawLayout.x, drawLayout.y, drawLayout.width, drawLayout.height)
            }
          }
        }
        ctx.restore()
      }

      ctx.globalAlpha = 1

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

      browserBlankHoldFrames.current = Math.max(18, Math.round(targetRenderFps * 1.5))
      
      frameId = requestAnimationFrame(render)
    }

    frameId = requestAnimationFrame(render)
    return () => cancelAnimationFrame(frameId)
  }, [canvasWidth, canvasHeight, aspectRatio])

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black text-white" style={{ colorScheme: 'dark' }}>
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        className="w-full h-full object-contain bg-black"
      />
    </div>
  )
}

function isLikelyScreenBorderLayer(layer?: { name?: string; config?: Record<string, any> }): boolean {
  if (!layer) return false
  const haystack = `${layer.name || ''} ${layer.config?.widgetType || ''} ${layer.config?.type || ''}`.toLowerCase()
  return haystack.includes('screen border') || haystack.includes('screen-border')
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
