let offscreenCanvas: OffscreenCanvas | null = null
let ctx: OffscreenCanvasRenderingContext2D | null = null
let videoEncoder: VideoEncoder | null = null
let layers: any[] = []
let cw = 1920
let ch = 1080
let captureFormat: 'h264' | 'mjpeg' = 'h264'
let streamFps = 30
let encodeInterval = 1000 / streamFps
let jpegEncodeInFlight = false
let startedAtMs = 0
let lastEncodeAtMs = 0
let compositedFrameMode = false

const videoFrames = new Map<string, VideoFrame>()
const imageBitmaps = new Map<string, ImageBitmap>()
const imageLoadingIds = new Set<string>()

let frameCountTotal = 0;

self.onmessage = async (e) => {
  const { type, payload } = e.data

  if (type === 'init') {
    offscreenCanvas = payload.canvas
    ctx = offscreenCanvas!.getContext('2d', {
      alpha: true,
      desynchronized: true,
      willReadFrequently: false
    })!
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    cw = payload.width
    ch = payload.height
    captureFormat = payload.format === 'mjpeg' ? 'mjpeg' : 'h264'
    streamFps = Math.max(1, Math.min(60, Math.round(payload.fps || 30)))
    encodeInterval = 1000 / streamFps
    frameCountTotal = 0
    jpegEncodeInFlight = false
    startedAtMs = performance.now()
    lastEncodeAtMs = 0
    compositedFrameMode = false

    if (captureFormat === 'h264') {
      videoEncoder = new VideoEncoder({
        output: (chunk) => {
          const buffer = new ArrayBuffer(chunk.byteLength)
          chunk.copyTo(buffer)
          self.postMessage({ 
            type: 'chunk', 
            buffer, 
            isKey: chunk.type === 'key',
            timestamp: chunk.timestamp 
          }, [buffer] as any)
        },
        error: (err) => self.postMessage({ type: 'error', message: String(err) })
      })

      videoEncoder.configure({
        codec: payload.codec || 'avc1.640028', // High profile, Level 4.0 (Twitch optimized)
        width: cw,
        height: ch,
        bitrate: payload.bitrate || 6000000,
        bitrateMode: 'constant',
        framerate: streamFps,
        latencyMode: 'realtime',
        avc: { format: 'annexb' }
      })
    } else {
      videoEncoder = null
    }

    renderLoop()
    return
  }

  if (type === 'update_layers') {
    const prevIds = new Set(layers.map(l => l.id))
    layers = payload.layers

    for (const layer of layers) {
      if (layer.type === 'image' && layer.config?.assetPath && !imageBitmaps.has(layer.id) && !imageLoadingIds.has(layer.id)) {
        loadImage(layer.id, layer.config.assetPath)
      }
    }

    const currentIds = new Set(layers.map(l => l.id))
    for (const id of prevIds) {
      if (!currentIds.has(id)) cleanupSource(id)
    }
  }

  if (type === 'video_frame' || type === 'frame') {
    const finalId = e.data.layerId || payload?.id
    const finalFrame = e.data.frame || payload?.frame
    if (!finalId || !finalFrame) return

    const old = videoFrames.get(finalId)
    if (old) old.close()
    videoFrames.set(finalId, finalFrame)
  }

  if (type === 'composited_frame') {
    const frame = payload?.frame as VideoFrame | undefined
    if (!frame) return
    compositedFrameMode = true
    encodeVideoFrame(frame)
    return
  }

  if (type === 'remove_source') {
    cleanupSource(payload.id)
  }

  if (type === 'shutdown') {
    if (videoEncoder && videoEncoder.state !== 'closed') {
      await videoEncoder.flush().catch(() => { })
      videoEncoder.close()
    }
    videoEncoder = null
    for (const frame of videoFrames.values()) frame.close()
    videoFrames.clear()
    for (const bmp of imageBitmaps.values()) bmp.close()
    imageBitmaps.clear()
  }
}

function cleanupSource(id: string) {
  const frame = videoFrames.get(id)
  if (frame) { frame.close(); videoFrames.delete(id) }
  const bmp = imageBitmaps.get(id)
  if (bmp) { bmp.close(); imageBitmaps.delete(id) }
  imageLoadingIds.delete(id)
}

async function loadImage(id: string, assetPath: string) {
  imageLoadingIds.add(id)
  try {
    let url = assetPath
    if (assetPath.startsWith('asset://')) {
      const assetId = assetPath.replace(/^asset:\/+/, '').replace(/^app\//, '')
      url = `asset:///app/${encodeURIComponent(assetId)}`
    }
    const response = await fetch(url)
    if (!response.ok) return
    const blob = await response.blob()
    const bitmap = await createImageBitmap(blob)
    const old = imageBitmaps.get(id)
    if (old) old.close()
    imageBitmaps.set(id, bitmap)
  } catch {
    // Handle error
  }
  imageLoadingIds.delete(id)
}

function renderLoop() {
  requestAnimationFrame(renderLoop)
  if (!ctx || !offscreenCanvas) return
  if (compositedFrameMode) return

  ctx.clearRect(0, 0, cw, ch)

  for (const l of layers) {
    if (l.visible === false) continue
    ctx.globalAlpha = l.opacity ?? 1

    if (l.type === 'camera' || l.type === 'widget' || l.type === 'browser' || l.type === 'display') {
      const frame = videoFrames.get(l.id)
      if (frame) {
        const crop = l.crop
        if (crop) {
          const sw = frame.displayWidth
          const sh = frame.displayHeight
          ctx.drawImage(
            frame,
            crop.left, crop.top, sw - crop.left - crop.right, sh - crop.top - crop.bottom,
            l.x, l.y, l.width, l.height
          )
        } else {
          ctx.drawImage(frame, l.x, l.y, l.width, l.height)
        }
      } else if (l.type === 'camera' || l.type === 'display') {
        ctx.fillStyle = '#111'
        ctx.fillRect(l.x, l.y, l.width, l.height)
        ctx.strokeStyle = '#f0f'
        ctx.lineWidth = 4
        ctx.strokeRect(l.x + 2, l.y + 2, l.width - 4, l.height - 4)
      }
    } else if (l.type === 'text') {
      ctx.fillStyle = l.config?.color || '#fff'
      ctx.font = `bold ${l.config?.fontSize || 48}px Inter`
      ctx.fillText(l.config?.text || '', l.x, l.y + (l.config?.fontSize || 48))
    } else if (l.type === 'image') {
      const bmp = imageBitmaps.get(l.id)
      if (bmp) {
        ctx.drawImage(bmp, l.x, l.y, l.width, l.height)
      }
    }
  }

  const now = performance.now()
  if (now - lastEncodeAtMs < encodeInterval) return

  const elapsedMs = Math.max(0, now - startedAtMs)
  const targetFrame = Math.max(frameCountTotal + 1, Math.floor(elapsedMs / encodeInterval))
  lastEncodeAtMs = now

  if (targetFrame > frameCountTotal && captureFormat === 'mjpeg') {
    frameCountTotal = targetFrame
    void emitJpegFrame()
    return
  }

  if (targetFrame > frameCountTotal && videoEncoder && videoEncoder.state === 'configured') {
    const framesToEncode = Math.min(targetFrame - frameCountTotal, 5)

    for (let i = 0; i < framesToEncode; i++) {
      frameCountTotal++
      
      // Force a keyframe every 2 seconds.
      const forceKeyFrame = frameCountTotal % (streamFps * 2) === 0
      
      // Calculate exact timestamp in microseconds based on frame count
      const timestampMicrosec = Math.round((frameCountTotal / streamFps) * 1_000_000);
      const frame = new VideoFrame(offscreenCanvas, { timestamp: timestampMicrosec })

      videoEncoder.encode(frame, { keyFrame: forceKeyFrame })
      frame.close()
    }
  }
}

function encodeVideoFrame(frame: VideoFrame) {
  if (!videoEncoder || videoEncoder.state !== 'configured') {
    frame.close()
    return
  }

  if (videoEncoder.encodeQueueSize > 8) {
    frame.close()
    return
  }

  frameCountTotal++
  const forceKeyFrame = frameCountTotal % (streamFps * 2) === 1

  try {
    videoEncoder.encode(frame, { keyFrame: forceKeyFrame })
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) })
  } finally {
    frame.close()
  }
}

async function emitJpegFrame() {
  if (!offscreenCanvas || jpegEncodeInFlight) return
  jpegEncodeInFlight = true
  try {
    const timestamp = Math.round((frameCountTotal / streamFps) * 1_000_000)
    const blob = await offscreenCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.86 })
    const buffer = await blob.arrayBuffer()
    self.postMessage({ type: 'chunk', buffer, isKey: true, timestamp }, [buffer] as any)
  } catch (err) {
    console.error(' MJPEG encode error:', err)
  } finally {
    jpegEncodeInFlight = false
  }
}

export {}
