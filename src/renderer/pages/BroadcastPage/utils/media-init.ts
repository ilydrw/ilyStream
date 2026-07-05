import { resolveLayerLayout, type StudioLayer } from '../../../../shared/studio'
import {
  MAX_CAMERA_CAPTURE_FPS,
  MAX_CAMERA_CAPTURE_HEIGHT,
  MAX_CAMERA_CAPTURE_WIDTH
} from './camera-capture'

export interface ManagedMediaElement extends HTMLMediaElement {
  __ilyCleanup?: () => void
  __ilySignature?: string
  __ilyRawStream?: MediaStream
  __ilyDeviceKey?: string
}

export type MediaAspectRatio = '16:9' | '9:16'

export function shouldInitializeLayerMedia(
  layer: StudioLayer,
  activeAspectRatios: readonly MediaAspectRatio[]
): boolean {
  if (layer.type === 'audio') return true
  if (layer.type !== 'camera' && layer.type !== 'display') return false

  const ratios: readonly MediaAspectRatio[] = activeAspectRatios.length > 0 ? activeAspectRatios : ['16:9']
  return ratios.some(ratio => resolveLayerLayout(layer, ratio).visible)
}

export function buildCameraConstraints(layer: StudioLayer, devices: MediaDeviceInfo[], degradeLevel = 0): MediaStreamConstraints {
  const deviceId = String(layer.config.deviceId || '')
  const label = layer.name || ''

  // Degrade level rules:
  // degradeLevel >= 1: Disable audio entirely
  // degradeLevel >= 2: Limit FPS to max 30
  // degradeLevel >= 3: Limit resolution to max 1280x720 (and FPS to max 30)
  // degradeLevel >= 4: Use a low-bandwidth 640x360@15 fallback
  // degradeLevel >= 5: Request the device only and let Chromium pick any mode
  let captureWidth = clampNumber(layer.config.captureWidth, 1920, 320, MAX_CAMERA_CAPTURE_WIDTH)
  let captureHeight = clampNumber(layer.config.captureHeight, 1080, 180, MAX_CAMERA_CAPTURE_HEIGHT)
  let captureFps = clampNumber(layer.config.captureFps, 30, 15, MAX_CAMERA_CAPTURE_FPS)

  const videoDevices = devices.filter(d => d.kind === 'videoinput')
  const exists = videoDevices.find(d => d.deviceId === deviceId)

  if (degradeLevel >= 2) {
    captureFps = Math.min(captureFps, 30)
  }
  if (degradeLevel >= 3) {
    captureWidth = Math.min(captureWidth, 1280)
    captureHeight = Math.min(captureHeight, 720)
  }
  if (degradeLevel >= 4) {
    captureWidth = Math.min(captureWidth, 640)
    captureHeight = Math.min(captureHeight, 360)
    captureFps = Math.min(captureFps, 15)
  }

  const audioId = (degradeLevel >= 1 || layer.config.audioDeviceId === 'none') ? undefined : resolveCameraAudioDeviceId(layer, devices)
  const audioConstraints = audioId ? buildLowLatencyAudioConstraints(audioId) : false
  const videoQualityConstraints = degradeLevel >= 5
    ? {}
    : {
        width: { ideal: captureWidth },
        height: { ideal: captureHeight },
        frameRate: { ideal: captureFps }
      }

  if (degradeLevel > 0) {
    console.warn(`[media-init] Degrading camera "${label || deviceId}" constraints (level ${degradeLevel}): audio=${!!audioConstraints}, fps=${captureFps}, res=${captureWidth}x${captureHeight}`)
  }

  
  
  // Device IDs can change on Windows, but a configured capture-card layer
  // must never silently fall back to the default webcam.
  if (!exists || deviceId === 'match') {
    const match = findVideoDeviceByLabel(videoDevices, label)
    if (match) {
      console.log(`[media-init] Found device by name match: "${label}" -> "${match.label}"`)
      return {
        video: {
          deviceId: { exact: match.deviceId },
          ...videoQualityConstraints
        },
        audio: audioConstraints
      }
    }
  }

  if (exists) {
    return {
      video: {
        deviceId: { exact: exists.deviceId },
        ...videoQualityConstraints
      },
      audio: audioConstraints
    }
  }

  if (deviceId || label) {
    throw createTransientMediaError(`Video source not found: ${label || deviceId}`)
  }

  return {
    video: {
      ...videoQualityConstraints
    },
    audio: audioConstraints
  }
}

export function resolveCameraAudioDeviceId(layer: StudioLayer, devices: MediaDeviceInfo[]): string | undefined {
  const configuredAudioId = String(layer.config.audioDeviceId || '')
  if (configuredAudioId === 'none') return undefined
  if (configuredAudioId && configuredAudioId !== 'match') {
    const exists = devices.some(d => d.kind === 'audioinput' && d.deviceId === configuredAudioId)
    if (exists) return configuredAudioId
  }

  const videoDeviceId = layer.config.deviceId
  const videoLabel = devices.find(d => d.deviceId === videoDeviceId)?.label || layer.name || ''
  
  const clean = (s: string) => s.toLowerCase()
    .replace(/\b(video|audio|digital|interface|capture|device|input|output)\b/g, ' ')
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2)

  const videoTokens = clean(videoLabel)
  if (videoTokens.length === 0) return undefined

  // 1. Try to find a device that shares any unique tokens
  const audioDevices = devices.filter(d => d.kind === 'audioinput')
  
  // Scoring system
  let bestMatch: MediaDeviceInfo | null = null
  let bestScore = 0

  for (const d of audioDevices) {
    const audioTokens = clean(d.label)
    const intersection = videoTokens.filter(t => audioTokens.includes(t))
    let score = intersection.length

    // Bonus for exact brand/model match (usually first token)
    if (videoTokens[0] && audioTokens[0] === videoTokens[0]) score += 2

    if (score > bestScore) {
      bestScore = score
      bestMatch = d
    }
  }

  if (bestMatch && bestScore >= 1) {
    return bestMatch.deviceId
  }

  // 2. Fallback: If it's a capture card, look for any audio device with "Capture" in it
  if (videoLabel.toLowerCase().includes('capture') || videoLabel.toLowerCase().includes('usb3')) {
    const fallback = audioDevices.find(d => 
      d.label.toLowerCase().includes('capture') || 
      d.label.toLowerCase().includes('digital audio') ||
      d.label.toLowerCase().includes('usb')
    )
    if (fallback) {
      return fallback.deviceId
    }
  }
  
  return undefined
}

function createTransientMediaError(message: string): Error {
  const err = new Error(message)
  ;(err as any).name = 'TransientNotFoundError'
  return err
}

function findVideoDeviceByLabel(devices: MediaDeviceInfo[], label: string): MediaDeviceInfo | undefined {
  const normalizedLabel = normalizeDeviceLabel(label)
  if (!normalizedLabel) return undefined

  return devices.find(device => {
    const normalizedDevice = normalizeDeviceLabel(device.label)
    return normalizedDevice === normalizedLabel ||
      normalizedDevice.includes(normalizedLabel) ||
      normalizedLabel.includes(normalizedDevice)
  })
}

function normalizeDeviceLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function getMediaSignature(layer: StudioLayer, devices: MediaDeviceInfo[]): string {
  const isAuto = !layer.config.deviceId || layer.config.deviceId === 'match'
  const hasLabels = devices.some(d => !!d.label)
    
  // Audio resolution can be volatile (devices appearing/disappearing)
  // We only include it if we are in AUTO mode or if we don't have a stable video device yet.
  const resolvedAudioId = resolveCameraAudioDeviceId(layer, devices)
    
  const parts = [
    layer.type,
    layer.config.deviceId || 'auto',
    layer.config.desktopSourceId || '',
    layer.config.desktopSourceName || ''
  ]

  if (layer.type === 'camera') {
    parts.push(
      `camera-audio:${layer.config.audioDeviceId || resolvedAudioId || 'none'}`,
      `capture:${layer.config.captureWidth || 1920}x${layer.config.captureHeight || 1080}@${layer.config.captureFps || 30}`,
      `stabilize:${layer.config.stabilize !== false}:source-native`
    )
  }

  if (layer.type === 'audio') {
    parts.push(`audio:${layer.config.deviceId || 'auto'}`)
  }

  // If we have a hardcoded deviceId, we shouldn't care about the labels oscillation
  if (isAuto) {
    parts.push(`audio:${resolvedAudioId || 'none'}`)
  }

  return parts.join(':')
}

export function buildRawAudioConstraints(deviceId?: string): MediaTrackConstraints {
  return buildLowLatencyAudioConstraints(deviceId)
}

export function buildLowLatencyAudioConstraints(deviceId?: string, channelCount = 2): MediaTrackConstraints {
  // `latency` is a Chromium-only constraint missing from the standard lib types.
  const constraints: MediaTrackConstraints & { latency?: ConstrainDouble } = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: { ideal: channelCount },
    sampleRate: { ideal: 48000 },
    latency: { ideal: 0.005 }
  }

  if (deviceId) {
    // `exact` (not `ideal`) so a stale or mismatched deviceId fails loudly
    // instead of silently falling back to the system default mic.
    constraints.deviceId = { exact: deviceId }
  }

  return constraints
}

export function formatMediaError(error: unknown): string {
  if (error instanceof DOMException) return `${error.name}: ${error.message || 'Media device error'}`
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return String(error)
}

export function isTransientMediaError(error: unknown): boolean {
  const name = (error as any)?.name
  return ['AbortError', 'NotReadableError', 'TrackStartError', 'TransientNotFoundError', 'NotFoundError'].includes(name)
}

export function resolveStabilizedVideoTarget(
  layer: StudioLayer,
  stream: MediaStream,
  fallback: { width: number; height: number; fps: number }
): { width: number; height: number; fps: number } {
  const settings = stream.getVideoTracks()[0]?.getSettings?.() || {}
  const fallbackWidth = clampNumber(layer.config.captureWidth, fallback.width, 1, 7680)
  const fallbackHeight = clampNumber(layer.config.captureHeight, fallback.height, 1, 4320)
  const fallbackFps = clampNumber(layer.config.captureFps, fallback.fps, 1, MAX_CAMERA_CAPTURE_FPS)

  return {
    width: clampNumber(settings.width, fallbackWidth, 1, 7680),
    height: clampNumber(settings.height, fallbackHeight, 1, 4320),
    fps: clampNumber(settings.frameRate, fallbackFps, 1, MAX_CAMERA_CAPTURE_FPS)
  }
}

export function drawVideoCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number
): void {
  const sourceWidth = video.videoWidth || width
  const sourceHeight = video.videoHeight || height
  const sourceRatio = sourceWidth / sourceHeight
  const targetRatio = width / height
  let sx = 0
  let sy = 0
  let sw = sourceWidth
  let sh = sourceHeight

  if (sourceRatio > targetRatio) {
    sw = sourceHeight * targetRatio
    sx = (sourceWidth - sw) / 2
  } else {
    sh = sourceWidth / targetRatio
    sy = (sourceHeight - sh) / 2
  }

  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height)
}

export function disposeMediaElement(el?: ManagedMediaElement): void {
  if (!el) return
  el.__ilyCleanup?.()
  const stream = el.srcObject as MediaStream | null
  stream?.getTracks().forEach(track => track.stop())
  el.srcObject = null
  delete el.__ilyCleanup
  delete el.__ilySignature
  delete el.__ilyRawStream
}

export function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return fallback
  return Math.max(min, Math.min(max, Math.round(numberValue)))
}

export function isMostlyBlackVideoFrame(
  video: HTMLVideoElement,
  probeCanvas: HTMLCanvasElement,
  probeCtx: CanvasRenderingContext2D
): boolean {
  try {
    probeCtx.drawImage(video, 0, 0, probeCanvas.width, probeCanvas.height)
    const data = probeCtx.getImageData(0, 0, probeCanvas.width, probeCanvas.height).data
    let brightPixels = 0
    for (let i = 0; i < data.length; i += 4) {
      const red = data[i]
      const green = data[i + 1]
      const blue = data[i + 2]
      const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722
      if (luma > 14) brightPixels += 1
      if (brightPixels >= 6) return false
    }
    return true
  } catch {
    return false
  }
}

export function createStabilizedCameraStream(
  sourceStream: MediaStream,
  target: { width: number; height: number; fps: number },
  label = 'Media source'
): { stream: MediaStream; cleanup: () => void } {
  const sourceVideo = document.createElement('video')
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', {
    alpha: false,
    desynchronized: true,
    willReadFrequently: true
  })

  canvas.width = target.width
  canvas.height = target.height
  sourceVideo.srcObject = sourceStream
  sourceVideo.autoplay = true
  sourceVideo.muted = true
  sourceVideo.playsInline = true
  sourceVideo.setAttribute('playsinline', '')
  Object.assign(sourceVideo.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    opacity: '1',
    zIndex: '-9999',
    pointerEvents: 'none'
  })

  if (!ctx || typeof canvas.captureStream !== 'function') {
    if (sourceVideo.parentNode) sourceVideo.parentNode.removeChild(sourceVideo)
    return {
      stream: sourceStream,
      cleanup: () => sourceStream.getTracks().forEach(track => track.stop())
    }
  }

  const canvasStream = canvas.captureStream(target.fps)
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...sourceStream.getAudioTracks()
  ])
  
  combinedStream.getAudioTracks().forEach(t => t.enabled = true)

  let disposed = false
  let frameId = 0
  let lastDrawAt = 0
  let hasDrawnFrame = false
  const frameInterval = 1000 / target.fps

  const draw = (now: number) => {
    if (disposed) return
    frameId = requestAnimationFrame(draw)

    const delta = now - lastDrawAt
    if (delta < frameInterval - 1) return 

    const hasFrame =
      sourceVideo.readyState >= 2 &&
      sourceVideo.videoWidth > 0 &&
      sourceVideo.videoHeight > 0

    if (hasFrame) {
      lastDrawAt = now - (delta % frameInterval)
      drawVideoCover(ctx, sourceVideo, canvas.width, canvas.height)
      hasDrawnFrame = true
    } else if (!hasDrawnFrame) {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
  }

  document.body.appendChild(sourceVideo)
  void sourceVideo.play().catch(err => console.warn('[media-init] Stabilizer source playback failed:', err))
  frameId = requestAnimationFrame(draw)

  return {
    stream: combinedStream,
    cleanup: () => {
      disposed = true
      cancelAnimationFrame(frameId)
      combinedStream.getTracks().forEach(track => track.stop())
      canvasStream.getTracks().forEach(track => track.stop())
      sourceStream.getTracks().forEach(track => track.stop())
      sourceVideo.srcObject = null
      sourceVideo.remove()
    }
  }
}

export function createNativeFFmpegStream(
  deviceName: string,
  target: { width: number; height: number; fps: number }
): { stream: MediaStream; cleanup: () => void } {
  const sourceImg = new Image()
  // Disable caching with a timestamp
  sourceImg.src = `http://127.0.0.1:44444/camera?device=${encodeURIComponent(deviceName)}&width=${target.width}&height=${target.height}&fps=${target.fps}&t=${Date.now()}`
  sourceImg.crossOrigin = 'anonymous'

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', {
    alpha: false,
    desynchronized: true,
    willReadFrequently: true
  })

  canvas.width = target.width
  canvas.height = target.height

  if (!ctx || typeof canvas.captureStream !== 'function') {
    // Fallback if canvas is completely broken (should never happen)
    return { stream: new MediaStream(), cleanup: () => {} }
  }

  const canvasStream = canvas.captureStream(target.fps)
  
  // Append to DOM to prevent Chrome from pausing the MJPEG stream
  sourceImg.style.position = 'absolute'
  sourceImg.style.width = '1px'
  sourceImg.style.height = '1px'
  sourceImg.style.opacity = '1'
  sourceImg.style.zIndex = '-9999'
  sourceImg.style.pointerEvents = 'none'
  document.body.appendChild(sourceImg)

  let disposed = false
  let frameId = 0

  const draw = () => {
    if (disposed) return
    frameId = requestAnimationFrame(draw)

    if (sourceImg.naturalWidth > 0) {
      // Scale to fit/cover
      const scale = Math.max(canvas.width / sourceImg.naturalWidth, canvas.height / sourceImg.naturalHeight)
      const w = sourceImg.naturalWidth * scale
      const h = sourceImg.naturalHeight * scale
      const x = (canvas.width - w) / 2
      const y = (canvas.height - h) / 2
      ctx.drawImage(sourceImg, x, y, w, h)
    } else {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
  }

  frameId = requestAnimationFrame(draw)

  return {
    stream: canvasStream,
    cleanup: () => {
      disposed = true
      cancelAnimationFrame(frameId)
      sourceImg.src = ''
      if (sourceImg.parentNode) sourceImg.parentNode.removeChild(sourceImg)
      canvasStream.getTracks().forEach(t => t.stop())
      sourceImg.src = ''
    }
  }
}
