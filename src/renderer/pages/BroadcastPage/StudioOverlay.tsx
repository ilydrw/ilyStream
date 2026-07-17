import { useEffect, useRef, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useStudioStore } from '../../stores/studio-store'
import { blendModeToCompositeOp, resolveLayerLayout, type StudioShapeMask } from '../../../shared/studio'
import {
  croppedSourceRect,
  drawAndCacheMediaFrame,
  drawFittedSource,
  drawMediaFallback,
  applyShapeBorderStroke,
  clampShapeMaskTransform,
  resolveSourceFitMode,
  resolveBrowserCaptureSettings,
  resolveBrowserSourceUrl,
  traceShapePath
} from './components/CanvasEditor.utils'
import {
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
  // Most recently received ImageBitmap mirroring the broadcast window's
  // composed canvas (legacy mirror transport). When set, the render loop
  // blits this instead of running its own layer composition (which would
  // draw camera placeholders because the projector renderer can't open the
  // cameras itself).
  const latestMirrorBitmapRef = useRef<ImageBitmap | null>(null)
  // Primary mirror transport: the broadcast window sends its composed canvas
  // as a WebRTC video track. While connected, the fullscreen <video> element
  // shows it directly (media-pipeline paced — no JS per frame) and the canvas
  // render loop idles.
  const mirrorVideoRef = useRef<HTMLVideoElement>(null)
  const mirrorLiveRef = useRef(false)
  const [mirrorLive, setMirrorLiveState] = useState(false)
  const setMirrorLive = (value: boolean) => {
    mirrorLiveRef.current = value
    setMirrorLiveState(value)
  }

  const activeScene = useMemo(() => {
    const scene = scenes.find(s => s.id === sceneId) || scenes[0]
    console.log('[StudioOverlay] Initializing. sceneId:', sceneId, 'aspectRatio:', aspectRatio, 'resolvedScene:', scene?.name)
    return scene
  }, [scenes, sceneId, aspectRatio])
  const activeSceneRef = useRef(activeScene)
  useEffect(() => { activeSceneRef.current = activeScene }, [activeScene])

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])

  useEffect(() => {
    // Do NOT call getUserMedia here just to populate labels — it briefly
    // grabs the default camera and races the main window's capture pipeline,
    // causing AbortError/NotReadableError there. enumerateDevices alone is
    // enough for matching by deviceId; labels are not required.
    const updateDevices = async () => {
      try {
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
      // Camera layers are not opened here: USB cameras are exclusive to one
      // process and the main BroadcastPage window already holds them. The
      // projector receives MediaStreamTrack readables from the broadcast
      // window via Insertable Streams (see the request-streams effect below).
      if (layer.type === 'display' && !videoRefs.current[layer.id] && !pendingMedia.current.has(layer.id)) {
        pendingMedia.current.add(layer.id)
        const sig = getMediaSignature(layer, devices)
        const startStream = async () => {
          try {
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
            const stream = await navigator.mediaDevices.getDisplayMedia({
              video: { width: canvasWidth, height: canvasHeight, frameRate: 30 },
              audio: false
            } as MediaStreamConstraints)
            const video = document.createElement('video')
            video.srcObject = stream; video.muted = true; video.setAttribute('playsinline', ''); await video.play()
            const managed = video as ManagedMediaElement
            managed.__ilySignature = sig
            managed.__ilyCleanup = () => { stream.getTracks().forEach(t => t.stop()) }
            videoRefs.current[layer.id] = video
          } catch (err) {
            console.error('[Projector] Failed to start display capture for layer', layer.id, err)
            pendingMedia.current.delete(layer.id)
          }
        }
        void startStream()
      }
    }
  }, [activeScene, canvasWidth, canvasHeight, devices])

  // Mirror-mode: the broadcast window streams its composed canvas to us (USB
  // cameras are exclusive to that process, so we can't open them ourselves).
  // Preferred transport is a WebRTC video track negotiated over the brokered
  // MessagePort; the legacy transport is ImageBitmap frames on that same port,
  // which the render loop blits via `latestMirrorBitmapRef`.
  useEffect(() => {
    let receivedPort: MessagePort | null = null
    let pc: RTCPeerConnection | null = null
    let remoteDescribed = false
    const pendingIce: RTCIceCandidateInit[] = []

    const teardownPeer = () => {
      try { pc?.close() } catch {}
      pc = null
      remoteDescribed = false
      pendingIce.length = 0
      setMirrorLive(false)
      const video = mirrorVideoRef.current
      if (video) video.srcObject = null
    }

    const handleOffer = async (port: MessagePort, sdp: string) => {
      teardownPeer()
      const peer = new RTCPeerConnection()
      pc = peer
      peer.ontrack = (event) => {
        const video = mirrorVideoRef.current
        if (!video) return
        video.srcObject = event.streams[0] || new MediaStream([event.track])
        void video.play().catch(() => {})
        // This is a program monitor — render frames as soon as they arrive.
        try { (event.receiver as any).jitterBufferTarget = 0 } catch {}
        try { (event.receiver as any).playoutDelayHint = 0 } catch {}
      }
      peer.onconnectionstatechange = () => {
        if (pc !== peer) return
        if (peer.connectionState === 'connected') setMirrorLive(true)
        else if (peer.connectionState === 'failed' || peer.connectionState === 'closed' || peer.connectionState === 'disconnected') {
          setMirrorLive(false)
        }
      }
      peer.onicecandidate = (event) => {
        if (event.candidate) port.postMessage({ type: 'mirror-webrtc-ice', candidate: event.candidate.toJSON() })
      }
      try {
        await peer.setRemoteDescription({ type: 'offer', sdp })
        remoteDescribed = true
        for (const candidate of pendingIce.splice(0)) {
          try { await peer.addIceCandidate(candidate) } catch {}
        }
        const answer = await peer.createAnswer()
        await peer.setLocalDescription(answer)
        port.postMessage({ type: 'mirror-webrtc-answer', sdp: answer.sdp })
      } catch (err) {
        // The sender times out and falls back to ImageBitmap frames.
        console.error('[Projector] WebRTC mirror negotiation failed:', err)
        teardownPeer()
      }
    }

    const handler = (event: MessageEvent) => {
      if (event.source !== window) return
      if ((event.data as any)?.__ilyProjectorChannel !== 'mirror-sink') return
      const port = event.ports[0]
      if (!port) return
      receivedPort = port
      port.onmessage = (msg) => {
        const data = msg.data as any
        if (data?.bitmap) {
          const previous = latestMirrorBitmapRef.current
          latestMirrorBitmapRef.current = data.bitmap
          if (previous) {
            try { previous.close() } catch {}
          }
          return
        }
        if (data?.type === 'mirror-webrtc-offer') {
          void handleOffer(port, data.sdp)
        } else if (data?.type === 'mirror-webrtc-ice' && data.candidate) {
          if (pc && remoteDescribed) void pc.addIceCandidate(data.candidate).catch(() => {})
          else pendingIce.push(data.candidate)
        }
      }
      port.start()
    }
    window.addEventListener('message', handler)

    const api = (window as any).api?.studio
    if (api?.requestProjectorMirror) {
      api.requestProjectorMirror(aspectRatio)
    } else {
      console.warn('[Projector] api.studio.requestProjectorMirror unavailable; falling back to local composition')
    }

    return () => {
      window.removeEventListener('message', handler)
      teardownPeer()
      try { receivedPort?.postMessage('__close') } catch {}
      try { receivedPort?.close() } catch {}
      const last = latestMirrorBitmapRef.current
      latestMirrorBitmapRef.current = null
      if (last) {
        try { last.close() } catch {}
      }
    }
  }, [])

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

      // While the WebRTC mirror is live the fullscreen <video> element is
      // showing the program — skip all canvas work but keep the loop alive
      // so we resume instantly if the connection drops.
      if (mirrorLiveRef.current) {
        frameId = requestAnimationFrame(render); return
      }

      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Short-circuit: if the broadcast window is mirroring its composed
      // canvas to us, just draw that and skip our local layer composition.
      const mirror = latestMirrorBitmapRef.current
      if (mirror) {
        const canvasRatio = canvas.width / canvas.height
        const bitmapRatio = mirror.width / mirror.height
        let dw = canvas.width, dh = canvas.height, dx = 0, dy = 0
        if (bitmapRatio > canvasRatio) {
          dh = canvas.width / bitmapRatio
          dy = (canvas.height - dh) / 2
        } else {
          dw = canvas.height * bitmapRatio
          dx = (canvas.width - dw) / 2
        }
        ctx.drawImage(mirror, dx, dy, dw, dh)
        frameId = requestAnimationFrame(render); return
      }

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
        ctx.filter = filters.length > 0 ? filters.join(' ') : 'none'

        ctx.globalAlpha = raw.opacity ?? 1
        ctx.globalCompositeOperation = blendModeToCompositeOp(raw.blendMode)
        const rotation = Number(layout.rotation || 0)
        const flipH = Boolean(layout.flipH)
        const flipV = Boolean(layout.flipV)
        const fitMode = resolveSourceFitMode(raw)
        if (rotation || flipH || flipV) {
          ctx.translate(drawLayout.x + drawLayout.width / 2, drawLayout.y + drawLayout.height / 2)
          if (rotation) ctx.rotate(rotation * Math.PI / 180)
          if (flipH || flipV) ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1)
          drawLayout.x = -drawLayout.width / 2; drawLayout.y = -drawLayout.height / 2
        }

        const rawShapeObj: StudioShapeMask = typeof e.shape === 'object' ? e.shape : { type: e.shape || 'none', x: 50, y: 50, scale: 100, scope: 'both', captureX: 50, captureY: 50 }
        const shapeObj = clampShapeMaskTransform(rawShapeObj, drawLayout.width, drawLayout.height)
        const shape = shapeObj.type || 'none'
        const scope = shapeObj.scope || 'both'
        const captureX = shapeObj.captureX ?? 50
        const captureY = shapeObj.captureY ?? 50

        const shouldClip = shape !== 'none' && (scope === 'both' || scope === aspectRatio)
        const cx = shouldClip ? ((captureX - 50) / 100) * drawLayout.width : 0
        const cy = shouldClip ? ((captureY - 50) / 100) * drawLayout.height : 0
        if (shouldClip) {
          const offX = (shapeObj.x - 50) / 100 * drawLayout.width
          const offY = (shapeObj.y - 50) / 100 * drawLayout.height
          const scaleFac = shapeObj.scale / 100
          const sx = drawLayout.x + drawLayout.width / 2 + offX
          const sy = drawLayout.y + drawLayout.height / 2 + offY
          const sw = scaleFac * drawLayout.width
          const sh = scaleFac * drawLayout.height
          const r = Math.min(sw, sh) / 2
          const cr = (e.cornerRadius || 0) * (Math.min(sw, sh) / 200)

          traceShapePath(ctx, shape, sx, sy, r, sw, sh, cr, shapeObj.cutDepth)

          if (shapeObj.shadow?.enabled) {
            ctx.save()
            const s = shapeObj.shadow
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
              if (withBlur && e.focusCircle?.enabled) {
                ctx.filter = `${oldFilter === 'none' ? '' : oldFilter} blur(${(e.focusCircle.blur / 100) * 40}px)`.trim()
              }
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
        if (shouldClip && shapeObj.border?.enabled) {
          const b = shapeObj.border
          ctx.save()

          const offX = (shapeObj.x - 50) / 100 * drawLayout.width
          const offY = (shapeObj.y - 50) / 100 * drawLayout.height
          const scaleFac = shapeObj.scale / 100
          const sx = drawLayout.x + drawLayout.width / 2 + offX
          const sy = drawLayout.y + drawLayout.height / 2 + offY
          const sw = scaleFac * drawLayout.width
          const sh = scaleFac * drawLayout.height
          const r = Math.min(sw, sh) / 2

          const cr = (e.cornerRadius || 0) * (Math.min(sw, sh) / 200)
          traceShapePath(ctx, shape, sx, sy, r, sw, sh, cr, shapeObj.cutDepth)
          applyShapeBorderStroke(ctx, b, { x: sx, y: sy, r })

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
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        className={`w-full h-full object-contain bg-black ${mirrorLive ? 'hidden' : ''}`}
      />
      <video
        ref={mirrorVideoRef}
        muted
        autoPlay
        playsInline
        className={`absolute inset-0 h-full w-full object-contain bg-black ${mirrorLive ? '' : 'hidden'}`}
      />
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
