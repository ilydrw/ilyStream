import { useEffect, useMemo, useRef, useState } from 'react'
import { resolveLayerLayout, type StudioLayer, type StudioScene } from '../../../../shared/studio'
import type {
  NativeBroadcastScene,
  NativeLiveSourceFrame,
  NativeSceneBlendMode,
  NativeSceneChromaKey,
  NativeSceneLayer,
  NativeSceneSource
} from '../../../../shared/native-scene'
import {
  resolveBrowserCaptureSettings,
  wrapCanvasText
} from './CanvasEditor.utils'
import type { BrowserFrameSurface, CachedMediaFrame } from './CanvasEditor.types'

interface NativeDisplayOutputOptions {
  enabled: boolean
  presentCanvasId?: string
  encodeFrames: boolean
  scene: StudioScene
  canvasWidth: number
  canvasHeight: number
  outputWidth: number
  outputHeight: number
  fps: number
  transitionActive: boolean
  sourceRevision: number
  videoRefs: React.MutableRefObject<Record<string, HTMLVideoElement>>
  browserFrameCache: React.MutableRefObject<Record<string, BrowserFrameSurface>>
  mediaFrameCache: React.MutableRefObject<Record<string, CachedMediaFrame>>
  encoderWorkerRef: React.RefObject<Worker | null>
}

interface NativeDisplayOutputState {
  active: boolean
  previewActive: boolean
}

const supportedBlendModes = new Set<NativeSceneBlendMode>([
  'normal',
  'additive',
  'multiply',
  'screen'
])
const MAX_LIVE_SOURCE_PIXELS = 3840 * 2160
const MAX_LIVE_SOURCE_EDGE = 4096

let nativeBroadcastLifecycleTail: Promise<void> = Promise.resolve()

function queueNativeBroadcastLifecycle<T>(operation: () => Promise<T>): Promise<T> {
  const result = nativeBroadcastLifecycleTail.then(operation, operation)
  nativeBroadcastLifecycleTail = result.then(() => undefined, () => undefined)
  return result
}

function hasCrop(layer: StudioLayer): boolean {
  const crop = layer.crop
  return Boolean(crop && (crop.top || crop.bottom || crop.left || crop.right))
}

function hasEnhancements(layer: StudioLayer): boolean {
  const enhancements = layer.enhancements
  if (!enhancements) return false

  return Boolean(
    (enhancements.brightness ?? 100) !== 100 ||
    (enhancements.contrast ?? 100) !== 100 ||
    (enhancements.saturation ?? 100) !== 100 ||
    (enhancements.sharpen ?? 0) !== 0 ||
    (enhancements.beauty ?? 0) !== 0 ||
    (enhancements.temperature ?? 0) !== 0 ||
    (enhancements.vignette ?? 0) !== 0 ||
    (enhancements.blur ?? 0) !== 0 ||
    (enhancements.cornerRadius ?? 0) !== 0 ||
    (enhancements.filterPreset && enhancements.filterPreset !== 'none') ||
    enhancements.chromaKey?.enabled ||
    enhancements.virtualBackground?.enabled ||
    enhancements.shape ||
    enhancements.focusCircle?.enabled ||
    enhancements.imageMask?.enabled
  )
}

/**
 * Like hasEnhancements, but chroma key no longer disqualifies a layer — the
 * engine composites it natively (fs_sprite chroma stage). Everything else on
 * the list still needs the canvas compositor.
 */
function hasNonNativeEnhancements(layer: StudioLayer): boolean {
  const enhancements = layer.enhancements
  if (!enhancements) return false

  return Boolean(
    (enhancements.brightness ?? 100) !== 100 ||
    (enhancements.contrast ?? 100) !== 100 ||
    (enhancements.saturation ?? 100) !== 100 ||
    (enhancements.sharpen ?? 0) !== 0 ||
    (enhancements.beauty ?? 0) !== 0 ||
    (enhancements.temperature ?? 0) !== 0 ||
    (enhancements.vignette ?? 0) !== 0 ||
    (enhancements.blur ?? 0) !== 0 ||
    (enhancements.cornerRadius ?? 0) !== 0 ||
    (enhancements.filterPreset && enhancements.filterPreset !== 'none') ||
    enhancements.virtualBackground?.enabled ||
    enhancements.shape ||
    enhancements.focusCircle?.enabled ||
    enhancements.imageMask?.enabled
  )
}

/** Build the native chroma key from a layer's enhancement settings (canvas parity). */
function toNativeChromaKey(layer: StudioLayer): NativeSceneChromaKey | undefined {
  const chromaKey = layer.enhancements?.chromaKey
  if (!chromaKey?.enabled || !chromaKey.color) return undefined
  const hex = chromaKey.color.replace('#', '')
  if (hex.length < 6) return undefined
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return undefined
  // Same defaults/normalization as the canvas compositor (useRenderLoop).
  return {
    keyR: r / 255,
    keyG: g / 255,
    keyB: b / 255,
    similarity: (chromaKey.similarity || 40) / 100,
    smoothness: (chromaKey.smoothness || 10) / 100,
    spill: (chromaKey.spill || 10) / 100
  }
}

function isNativeImagePath(assetPath: string): boolean {
  return assetPath.startsWith('asset://') ||
    assetPath.startsWith('file://') ||
    /^[a-z]:[\\/]/i.test(assetPath)
}

export function getNativeSceneUnsupportedReason(scene: StudioScene): string | null {
  const visibleLayers = scene.layers
    .map((layer) => resolveLayerLayout(layer, '16:9'))
    .filter((layer) => layer.visible && layer.opacity > 0 && layer.type !== 'audio')

  for (const layer of visibleLayers) {
    const blendMode = (layer.blendMode ?? 'normal') as NativeSceneBlendMode
    if (!supportedBlendModes.has(blendMode)) return `blend mode ${layer.blendMode} is not native yet`
    if (hasNonNativeEnhancements(layer)) return `${layer.name} uses canvas-only enhancements`
    if (layer.width <= 0 || layer.height <= 0) return `${layer.name} has an invalid layout`

    if (layer.type === 'display') {
      if (!/^(?:screen|window):\d+:\d+$/.test(String(layer.config.desktopSourceId ?? ''))) {
        return `${layer.name} does not have a valid screen or window source`
      }
      continue
    }

    if (layer.type === 'image') {
      const assetPath = String(layer.config.assetPath ?? '')
      if (!isNativeImagePath(assetPath)) return `${layer.name} does not use a local image asset`
      if (/\.gif(?:$|[?#])/i.test(assetPath)) return `${layer.name} is animated`
      continue
    }

    if (layer.type === 'text') continue
    if (layer.type === 'camera' || layer.type === 'widget' || layer.type === 'browser') continue
    return `${layer.name} (${layer.type}) still requires the canvas compositor`
  }

  return null
}

export function resolveNativeMonitorIndex(
  scene: StudioScene,
  canvasWidth: number,
  canvasHeight: number
): number | null {
  const visibleLayers = scene.layers
    .map(layer => resolveLayerLayout(layer, '16:9'))
    .filter(layer => layer.visible)

  if (visibleLayers.length !== 1) return null
  const layer = visibleLayers[0]
  if (
    layer.type !== 'display' ||
    (layer.opacity ?? 1) !== 1 ||
    (layer.blendMode && layer.blendMode !== 'normal') ||
    (layer.config.fitMode && layer.config.fitMode !== 'contain') ||
    layer.x !== 0 ||
    layer.y !== 0 ||
    layer.width !== canvasWidth ||
    layer.height !== canvasHeight ||
    (layer.rotation ?? 0) !== 0 ||
    layer.flipH ||
    layer.flipV ||
    hasCrop(layer) ||
    hasEnhancements(layer)
  ) {
    return null
  }

  const match = /^screen:(\d+):/.exec(String(layer.config.desktopSourceId ?? ''))
  if (!match) return null
  const monitorIndex = Number(match[1])
  return Number.isSafeInteger(monitorIndex) && monitorIndex >= 0 ? monitorIndex : null
}

export function shouldPresentNativeProgramPreview(
  isPreview: boolean,
  isVisible: boolean,
  aspectRatio: '16:9' | '9:16'
): boolean {
  return !isPreview && isVisible && aspectRatio === '16:9'
}

function hashTextSource(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

function createTextSource(
  layer: StudioLayer,
  cache: Map<string, Extract<NativeSceneSource, { kind: 'pixels' }>>
): Extract<NativeSceneSource, { kind: 'pixels' }> {
  const width = Math.max(1, Math.min(8192, Math.ceil(layer.width)))
  const height = Math.max(1, Math.min(8192, Math.ceil(layer.height)))
  const fontSize = Math.max(1, Number(layer.config.fontSize) || 48)
  const text = String(layer.config.text ?? '')
  const color = String(layer.config.color ?? '#fff')
  const key = `text:${layer.id}:${hashTextSource(`${width}|${height}|${fontSize}|${color}|${text}`)}`
  const cached = cache.get(key)
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true })
  if (!context) throw new Error(`Could not rasterize native text layer ${layer.name}`)
  context.clearRect(0, 0, width, height)
  context.fillStyle = color
  context.font = `700 ${fontSize}px Inter, sans-serif`
  context.textBaseline = 'top'
  wrapCanvasText(context, text, 0, 0, width, fontSize * 1.2, height)

  const source: Extract<NativeSceneSource, { kind: 'pixels' }> = {
    kind: 'pixels',
    key,
    width,
    height,
    pixels: new Uint8Array(context.getImageData(0, 0, width, height).data)
  }
  cache.set(key, source)
  return source
}

function constrainLiveSourceDimensions(width: number, height: number): { width: number; height: number } {
  const sourceWidth = Math.max(1, Math.round(width))
  const sourceHeight = Math.max(1, Math.round(height))
  const edgeScale = Math.min(1, MAX_LIVE_SOURCE_EDGE / Math.max(sourceWidth, sourceHeight))
  const pixelScale = Math.min(1, Math.sqrt(MAX_LIVE_SOURCE_PIXELS / (sourceWidth * sourceHeight)))
  const scale = Math.min(edgeScale, pixelScale)
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale))
  }
}

function resolveLiveSourceDimensions(
  layer: StudioLayer,
  canvasWidth: number,
  canvasHeight: number,
  videoRefs: React.MutableRefObject<Record<string, HTMLVideoElement>>,
  browserFrameCache: React.MutableRefObject<Record<string, BrowserFrameSurface>>
): { width: number; height: number } {
  if (layer.type === 'camera' || layer.type === 'display') {
    const video = videoRefs.current[layer.id]
    const fallbackWidth = layer.type === 'camera'
      ? Number(layer.config.captureWidth) || canvasWidth
      : canvasWidth
    const fallbackHeight = layer.type === 'camera'
      ? Number(layer.config.captureHeight) || canvasHeight
      : canvasHeight
    return constrainLiveSourceDimensions(
      video?.videoWidth || fallbackWidth,
      video?.videoHeight || fallbackHeight
    )
  }

  const browserSurface = browserFrameCache.current[layer.id]
  if (browserSurface?.width && browserSurface?.height) {
    return constrainLiveSourceDimensions(browserSurface.width, browserSurface.height)
  }

  const layout = resolveLayerLayout(layer, '16:9')
  const capture = resolveBrowserCaptureSettings(layer, layout.width, layout.height)
  return constrainLiveSourceDimensions(capture.width, capture.height)
}

function isLiveSourceLayer(layer: StudioLayer): boolean {
  if (layer.type === 'camera' || layer.type === 'widget' || layer.type === 'browser') return true
  return layer.type === 'display' && !/^screen:\d+:\d+$/.test(String(layer.config.desktopSourceId ?? ''))
}

function buildNativeBroadcastScene(
  scene: StudioScene,
  canvasWidth: number,
  canvasHeight: number,
  textCache: Map<string, Extract<NativeSceneSource, { kind: 'pixels' }>>,
  videoRefs: React.MutableRefObject<Record<string, HTMLVideoElement>>,
  browserFrameCache: React.MutableRefObject<Record<string, BrowserFrameSurface>>
): NativeBroadcastScene {
  const usedTextKeys = new Set<string>()
  const layers = scene.layers
    .map((layer) => resolveLayerLayout(layer, '16:9'))
    .filter((layer) => layer.visible && layer.opacity > 0 && layer.type !== 'audio')
    .sort((left, right) => left.zIndex - right.zIndex)
    .map<NativeSceneLayer>((layer) => {
      let source: NativeSceneSource
      if (layer.type === 'display' && !isLiveSourceLayer(layer)) {
        const sourceId = String(layer.config.desktopSourceId)
        source = { kind: 'display', key: `display:${sourceId}`, sourceId }
      } else if (layer.type === 'image') {
        const assetPath = String(layer.config.assetPath)
        source = { kind: 'image', key: `image:${assetPath}`, assetPath }
      } else if (isLiveSourceLayer(layer)) {
        const dimensions = resolveLiveSourceDimensions(
          layer,
          canvasWidth,
          canvasHeight,
          videoRefs,
          browserFrameCache
        )
        // Widgets/browser overlays are fed by the MAIN process straight from
        // the offscreen browser-source capture (BGRA, no renderer round trip).
        // Cameras/window-capture stay renderer-fed.
        const mainFed = layer.type === 'widget' || layer.type === 'browser'
        source = {
          kind: 'live',
          key: `live:${layer.id}:${dimensions.width}x${dimensions.height}`,
          ...dimensions,
          ...(mainFed ? { feed: 'browser-source' as const, browserSourceId: layer.id } : {})
        }
      } else {
        source = createTextSource(layer, textCache)
        usedTextKeys.add(source.key)
      }

      return {
        id: layer.id,
        source,
        layout: {
          x: layer.x,
          y: layer.y,
          width: layer.width,
          height: layer.height,
          rotation: Number(layer.rotation ?? 0),
          flipH: Boolean(layer.flipH),
          flipV: Boolean(layer.flipV),
          crop: layer.type === 'text' ? undefined : layer.crop,
          fitMode: layer.type === 'text'
            ? 'stretch'
            : layer.config.fitMode === 'cover' || layer.config.fitMode === 'stretch'
              ? layer.config.fitMode
              : 'contain'
        },
        opacity: Math.max(0, Math.min(1, layer.opacity ?? 1)),
        blendMode: (layer.blendMode ?? 'normal') as NativeSceneBlendMode,
        chromaKey: toNativeChromaKey(layer)
      }
    })

  for (const key of textCache.keys()) {
    if (!usedTextKeys.has(key)) textCache.delete(key)
  }

  return { canvasWidth, canvasHeight, layers }
}

interface LiveSourceUploadSurface {
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
  lastUploadedAt: number
  lastVersion: number
}

function resolveLiveSourceTargetFps(layer: StudioLayer, outputFps: number): number {
  const configuredFps = layer.type === 'camera'
    ? Number(layer.config.captureFps)
    : layer.type === 'widget' || layer.type === 'browser'
      ? Number(layer.config.fps)
      : 60
  return Math.max(1, Math.min(60, outputFps, Number.isFinite(configuredFps) ? configuredFps : 30))
}

function resolveLiveFrameSource(
  layer: StudioLayer,
  videoRefs: React.MutableRefObject<Record<string, HTMLVideoElement>>,
  browserFrameCache: React.MutableRefObject<Record<string, BrowserFrameSurface>>,
  mediaFrameCache: React.MutableRefObject<Record<string, CachedMediaFrame>>
): { source: CanvasImageSource; version: number } | null {
  if (layer.type === 'camera' || layer.type === 'display') {
    const video = videoRefs.current[layer.id]
    if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
      const quality = video.getVideoPlaybackQuality?.()
      const version = quality?.totalVideoFrames || Number((video as HTMLVideoElement & { webkitDecodedFrameCount?: number }).webkitDecodedFrameCount) || video.currentTime
      return { source: video, version }
    }

    const cached = mediaFrameCache.current[layer.id]
    return cached ? { source: cached.canvas, version: cached.lastUpdateAt } : null
  }

  const browserSurface = browserFrameCache.current[layer.id]
  if (!browserSurface?.bitmap) return null
  return { source: browserSurface.bitmap, version: browserSurface.lastUpdateAt ?? 0 }
}

async function uploadNativeLiveSources(
  nativeScene: NativeBroadcastScene,
  studioScene: StudioScene,
  outputFps: number,
  videoRefs: React.MutableRefObject<Record<string, HTMLVideoElement>>,
  browserFrameCache: React.MutableRefObject<Record<string, BrowserFrameSurface>>,
  mediaFrameCache: React.MutableRefObject<Record<string, CachedMediaFrame>>,
  surfaces: Map<string, LiveSourceUploadSurface>,
  warnedSourceKeys: Set<string>
): Promise<void> {
  const studioLayers = new Map(studioScene.layers.map(layer => [layer.id, layer]))
  const usedSourceKeys = new Set<string>()
  const now = performance.now()
  const uploads: Promise<void>[] = []

  for (const nativeLayer of nativeScene.layers) {
    const source = nativeLayer.source
    if (source.kind !== 'live') continue
    // Main-fed sources (widgets/overlays) get their pixels directly from the
    // main-process browser-source capture — nothing to upload from here.
    if (source.feed === 'browser-source') continue
    usedSourceKeys.add(source.key)

    const studioLayer = studioLayers.get(nativeLayer.id)
    if (!studioLayer) continue
    const liveFrame = resolveLiveFrameSource(studioLayer, videoRefs, browserFrameCache, mediaFrameCache)
    if (!liveFrame) continue

    let surface = surfaces.get(source.key)
    if (!surface) {
      const canvas = document.createElement('canvas')
      canvas.width = source.width
      canvas.height = source.height
      const context = canvas.getContext('2d', {
        alpha: true,
        colorSpace: 'srgb',
        willReadFrequently: true
      })
      if (!context) continue
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      surface = { canvas, context, lastUploadedAt: 0, lastVersion: -1 }
      surfaces.set(source.key, surface)
    }

    const targetFps = resolveLiveSourceTargetFps(studioLayer, outputFps)
    if (now - surface.lastUploadedAt < 1000 / targetFps) continue
    if (liveFrame.version === surface.lastVersion) continue

    // The canvas draw + getImageData stay synchronous (per source), but the
    // IPC uploads run concurrently so one slow source can't serialize the rest.
    const boundSurface = surface
    try {
      boundSurface.context.clearRect(0, 0, source.width, source.height)
      boundSurface.context.drawImage(liveFrame.source, 0, 0, source.width, source.height)
      const imageData = boundSurface.context.getImageData(0, 0, source.width, source.height)
      const frame: NativeLiveSourceFrame = {
        key: source.key,
        width: source.width,
        height: source.height,
        pixels: new Uint8Array(imageData.data.buffer, imageData.data.byteOffset, imageData.data.byteLength)
      }
      uploads.push(
        window.api.engine.updateBroadcastSourceFrame(frame).then((result) => {
          if (!result.ok) {
            if (result.error !== 'Native live source is not ready' && !warnedSourceKeys.has(source.key)) {
              warnedSourceKeys.add(source.key)
              console.warn(`[NativeSceneOutput] Live source ${studioLayer.name}: ${result.error ?? 'frame upload failed'}`)
            }
            return
          }
          warnedSourceKeys.delete(source.key)
          boundSurface.lastUploadedAt = now
          boundSurface.lastVersion = liveFrame.version
        }, (error) => {
          if (!warnedSourceKeys.has(source.key)) {
            warnedSourceKeys.add(source.key)
            console.warn(`[NativeSceneOutput] Could not upload ${studioLayer.name}:`, error)
          }
        })
      )
    } catch (error) {
      if (!warnedSourceKeys.has(source.key)) {
        warnedSourceKeys.add(source.key)
        console.warn(`[NativeSceneOutput] Could not upload ${studioLayer.name}:`, error)
      }
    }
  }

  await Promise.all(uploads)

  for (const key of surfaces.keys()) {
    if (!usedSourceKeys.has(key)) surfaces.delete(key)
  }
}

export function useNativeDisplayOutput(options: NativeDisplayOutputOptions): NativeDisplayOutputState {
  const {
    enabled,
    presentCanvasId,
    encodeFrames,
    scene,
    canvasWidth,
    canvasHeight,
    outputWidth,
    outputHeight,
    fps,
    transitionActive,
    sourceRevision,
    videoRefs,
    browserFrameCache,
    mediaFrameCache,
    encoderWorkerRef
  } = options
  const [active, setActive] = useState(false)
  const sceneRef = useRef(scene)
  const textCacheRef = useRef(new Map<string, Extract<NativeSceneSource, { kind: 'pixels' }>>())
  const syncSceneRef = useRef<((nextScene: StudioScene) => void) | null>(null)
  sceneRef.current = scene

  const unsupportedReason = useMemo(
    () => getNativeSceneUnsupportedReason(scene),
    [scene]
  )
  const supported = unsupportedReason === null

  useEffect(() => {
    setActive(false)
    syncSceneRef.current = null
    if (!enabled || transitionActive || !supported) return

    let disposed = false
    let startTimer: number | null = null
    let startRequested = false
    let frameTimer: number | null = null
    let liveSourceTimer: number | null = null
    let liveSourceUploadBusy = false
    let pendingScene: StudioScene | null = null
    let syncing = false
    let appliedNativeScene: NativeBroadcastScene | null = null
    const liveSourceSurfaces = new Map<string, LiveSourceUploadSurface>()
    const warnedSourceKeys = new Set<string>()
    const frameIntervalMs = 1000 / Math.max(1, fps)
    const startedAt = performance.now()
    let frameIndex = 0

    const onNativeFrame = (event: MessageEvent) => {
      const data = event.data as {
        __ilyNativeBroadcastFrame?: boolean
        outputId?: string
        frame?: VideoFrame
      } | undefined
      if (!data?.__ilyNativeBroadcastFrame || data.outputId !== 'horizontal' || !data.frame) return

      const worker = encoderWorkerRef.current
      if (disposed || !worker) {
        data.frame.close()
        return
      }
      worker.postMessage({ type: 'composited_frame', payload: { frame: data.frame } }, [data.frame])
    }

    const buildRequest = (nextScene: StudioScene) => buildNativeBroadcastScene(
      nextScene,
      canvasWidth,
      canvasHeight,
      textCacheRef.current,
      videoRefs,
      browserFrameCache
    )

    const stopAfterFailure = async (error: unknown) => {
      if (disposed) return
      console.warn(`[NativeSceneOutput] Canvas fallback: ${error instanceof Error ? error.message : String(error)}`)
      syncSceneRef.current = null
      if (presentCanvasId) window.api.engine.detachBroadcastPreview()
      setActive(false)
      if (frameTimer !== null) {
        window.clearInterval(frameTimer)
        frameTimer = null
      }
      if (liveSourceTimer !== null) {
        window.clearInterval(liveSourceTimer)
        liveSourceTimer = null
      }
      await queueNativeBroadcastLifecycle(() => window.api.engine.stopBroadcast()).catch(() => {})
    }

    const drainSceneUpdates = async () => {
      if (syncing) return
      syncing = true
      try {
        while (pendingScene && !disposed) {
          const nextScene = pendingScene
          pendingScene = null
          const nextNativeScene = buildRequest(nextScene)
          const result = await window.api.engine.updateBroadcastScene(nextNativeScene)
          if (!result.ok) throw new Error(result.error ?? 'Native scene update failed')
          appliedNativeScene = nextNativeScene
        }
      } catch (error) {
        await stopAfterFailure(error)
      } finally {
        syncing = false
      }
    }

    const queueSceneUpdate = (nextScene: StudioScene) => {
      pendingScene = nextScene
      void drainSceneUpdates()
    }

    window.addEventListener('message', onNativeFrame)

    const start = async () => {
      startRequested = true
      const initialNativeScene = buildRequest(sceneRef.current)
      const result = await queueNativeBroadcastLifecycle(async () => {
        if (disposed) return null
        return window.api.engine.startBroadcast({
          width: outputWidth,
          height: outputHeight,
          fps,
          scene: initialNativeScene
        })
      })
      if (!result || disposed) return
      if (!result?.ok) throw new Error(result?.error ?? 'native output unavailable')

      if (presentCanvasId) window.api.engine.attachBroadcastPreview(presentCanvasId)
      appliedNativeScene = initialNativeScene
      syncSceneRef.current = queueSceneUpdate
      setActive(true)

      const uploadLiveSources = () => {
        if (disposed || liveSourceUploadBusy || !appliedNativeScene) return
        liveSourceUploadBusy = true
        void uploadNativeLiveSources(
          appliedNativeScene,
          sceneRef.current,
          fps,
          videoRefs,
          browserFrameCache,
          mediaFrameCache,
          liveSourceSurfaces,
          warnedSourceKeys
        ).finally(() => {
          liveSourceUploadBusy = false
        })
      }
      uploadLiveSources()
      liveSourceTimer = window.setInterval(uploadLiveSources, 1000 / Math.max(1, Math.min(60, fps)))
      if (!encodeFrames) return

      const requestFrame = () => {
        frameIndex += 1
        const timestamp = Math.round((startedAt + frameIndex * frameIntervalMs) * 1000)
        window.api.engine.requestBroadcastFrame(timestamp, 'horizontal')
      }
      requestFrame()
      frameTimer = window.setInterval(requestFrame, frameIntervalMs)
    }

    startTimer = window.setTimeout(() => {
      startTimer = null
      void start().catch(stopAfterFailure)
    }, 0)

    return () => {
      disposed = true
      if (startTimer !== null) window.clearTimeout(startTimer)
      pendingScene = null
      syncSceneRef.current = null
      if (presentCanvasId) window.api.engine.detachBroadcastPreview()
      setActive(false)
      if (frameTimer !== null) window.clearInterval(frameTimer)
      if (liveSourceTimer !== null) window.clearInterval(liveSourceTimer)
      liveSourceSurfaces.clear()
      window.removeEventListener('message', onNativeFrame)
      if (startRequested) {
        void queueNativeBroadcastLifecycle(() => window.api.engine.stopBroadcast()).catch(() => {})
      }
    }
  }, [enabled, presentCanvasId, encodeFrames, transitionActive, supported, outputWidth, outputHeight, fps, canvasWidth, canvasHeight, videoRefs, browserFrameCache, mediaFrameCache, encoderWorkerRef])

  useEffect(() => {
    syncSceneRef.current?.(scene)
  }, [scene, sourceRevision])

  return {
    active,
    previewActive: active && Boolean(presentCanvasId)
  }
}
