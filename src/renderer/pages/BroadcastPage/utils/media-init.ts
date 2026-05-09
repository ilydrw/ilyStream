import type { StudioLayer } from '../../../../shared/studio'

export interface ManagedMediaElement extends HTMLMediaElement {
  __ilyCleanup?: () => void
  __ilySignature?: string
  __ilyRawStream?: MediaStream
}

export function buildCameraConstraints(layer: StudioLayer, devices: MediaDeviceInfo[]): MediaStreamConstraints {
  const deviceId = String(layer.config.deviceId || '')
  const label = layer.name || ''
  
  const audioId = resolveCameraAudioDeviceId(layer, devices)
  const audioConstraints = audioId ? {
    deviceId: { exact: audioId },
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: { ideal: 2 }
  } : false

  const videoDevices = devices.filter(d => d.kind === 'videoinput')
  const exists = videoDevices.find(d => d.deviceId === deviceId)
  
  // Device IDs can change on Windows, but a configured capture-card layer
  // must never silently fall back to the default webcam.
  if (!exists || deviceId === 'match') {
    const match = findVideoDeviceByLabel(videoDevices, label)
    if (match) {
      console.log(`[media-init] Found device by name match: "${label}" -> "${match.label}"`)
      return {
        video: {
          deviceId: { exact: match.deviceId },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        },
        audio: audioConstraints
      }
    }
  }

  if (exists) {
    return {
      video: {
        deviceId: { exact: exists.deviceId },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 }
      },
      audio: audioConstraints
    }
  }

  if (deviceId || label) {
    throw createTransientMediaError(`Video source not found: ${label || deviceId}`)
  }

  return {
    video: {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30 }
    },
    audio: audioConstraints
  }
}

export function resolveCameraAudioDeviceId(layer: StudioLayer, devices: MediaDeviceInfo[]): string | undefined {
  const configuredAudioId = String(layer.config.audioDeviceId || '')
  if (configuredAudioId && configuredAudioId !== 'match' && configuredAudioId !== 'none') {
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

  // If we have a hardcoded deviceId, we shouldn't care about the labels oscillation
  if (isAuto) {
    parts.push(`audio:${resolvedAudioId || 'none'}`)
  }

  return parts.join(':')
}

export function buildRawAudioConstraints(deviceId?: string): MediaTrackConstraints {
  return {
    deviceId: deviceId ? { ideal: deviceId } : undefined,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: { ideal: 2 }
  }
}

export function formatMediaError(error: unknown): string {
  if (error instanceof DOMException) return `${error.name}: ${error.message || 'Media device error'}`
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return String(error)
}

export function isDisplayAudioCaptureFailure(error: unknown): boolean {
  const name = (error as any)?.name
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('No audio tracks') ||
    message.includes('Invalid capture constraints') ||
    ['AbortError', 'NotReadableError', 'TrackStartError'].includes(name)
}

export function isTransientMediaError(error: unknown): boolean {
  const name = (error as any)?.name
  return ['AbortError', 'NotReadableError', 'TrackStartError', 'TransientNotFoundError', 'NotFoundError'].includes(name)
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
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: '1px',
    height: '1px',
    opacity: '0',
    pointerEvents: 'none'
  })

  if (!ctx || typeof canvas.captureStream !== 'function') {
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
