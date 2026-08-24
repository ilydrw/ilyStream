import {
  SEGMENTATION_INPUT_HEIGHT,
  SEGMENTATION_INPUT_WIDTH,
  type SegmentationMask
} from '../../shared/segmentation-worker'
import type { SegmentationBackend, SegmentationResult } from './SegmentationService.types'

export type { SegmentationResult } from './SegmentationService.types'

// Cap how often each layer's frame is sent to the worker. Segmentation does not
// need full output fps — the silhouette moves slowly relative to 60fps — and
// this bounds the per-frame RGBA IPC to the worker.
const SEGMENTATION_THROTTLE_MS = 40 // ~25 inferences/sec per layer
const IDLE_ENTRY_TTL_MS = 30_000
const IDLE_SWEEP_INTERVAL_MS = 15_000
// Consecutive native failures before we give up and fall back to MediaPipe.
const NATIVE_FAILURE_LIMIT = 4

// The aspect-preserved region the camera frame occupies inside the square model
// input; the rest of the square is black padding.
interface LetterboxRect {
  ox: number
  oy: number
  cw: number
  ch: number
}

/**
 * Native segmentation backend. Downsamples each virtual-background layer's
 * camera frame to the model input size and hands it to the onnxruntime-node
 * utility process (DirectML). The returned foreground map is painted into a
 * reusable per-layer mask canvas's alpha channel — the exact shape the render
 * loop and native compositor already consume.
 *
 * Inference runs out-of-process, so unlike the MediaPipe backend it keeps no
 * WASM/model heap in the renderer's GPU process.
 */
class NativeSegmentationBackend implements SegmentationBackend {
  private readonly resultsCache = new Map<string, SegmentationResult>()
  private readonly maskCanvases = new Map<string, HTMLCanvasElement>()
  private readonly inFlight = new Set<string>()
  private readonly lastSentAt = new Map<string, number>()
  private readonly lastUsedAt = new Map<string, number>()
  private downscaleCanvas: HTMLCanvasElement | null = null
  private downscaleCtx: CanvasRenderingContext2D | null = null
  private readonly contentRects = new Map<string, LetterboxRect>()
  private idleSweepTimer: ReturnType<typeof setInterval> | null = null
  private consecutiveFailures = 0
  private preloadStarted = false

  constructor(private readonly onUnavailable: (reason: string) => void) {}

  processVideo(id: string, video: HTMLVideoElement): void {
    const api = getSegmentationApi()
    if (!api) {
      this.onUnavailable('segmentation IPC bridge unavailable')
      return
    }

    this.lastUsedAt.set(id, performance.now())
    this.startIdleSweep()

    if (!this.preloadStarted) {
      this.preloadStarted = true
      // Warm the worker + surface a missing model quickly so the fallback kicks
      // in before many frames have been dropped.
      api.preload().catch((error: unknown) => {
        this.onUnavailable(errorMessage(error))
      })
    }

    if (this.inFlight.has(id)) return
    const now = performance.now()
    if ((this.lastSentAt.get(id) ?? 0) + SEGMENTATION_THROTTLE_MS > now) return
    if (video.readyState < 2 || video.videoWidth === 0) return

    const frameData = this.snapshotFrame(id, video)
    if (!frameData) return

    this.lastSentAt.set(id, now)
    this.inFlight.add(id)
    api
      .segment({ width: SEGMENTATION_INPUT_WIDTH, height: SEGMENTATION_INPUT_HEIGHT, data: frameData })
      .then((mask: SegmentationMask) => {
        this.inFlight.delete(id)
        this.consecutiveFailures = 0
        this.applyMask(id, mask)
      })
      .catch((error: unknown) => {
        this.inFlight.delete(id)
        this.consecutiveFailures += 1
        if (this.consecutiveFailures >= NATIVE_FAILURE_LIMIT) {
          this.onUnavailable(errorMessage(error))
        }
      })
  }

  getMask(id: string): SegmentationResult | null {
    this.lastUsedAt.set(id, performance.now())
    return this.resultsCache.get(id) ?? null
  }

  dispose(): void {
    if (this.idleSweepTimer) {
      clearInterval(this.idleSweepTimer)
      this.idleSweepTimer = null
    }
    for (const canvas of this.maskCanvases.values()) {
      canvas.width = 0
      canvas.height = 0
    }
    this.maskCanvases.clear()
    this.resultsCache.clear()
    this.inFlight.clear()
    this.lastSentAt.clear()
    this.lastUsedAt.clear()
    this.contentRects.clear()
    if (this.downscaleCanvas) {
      this.downscaleCanvas.width = 0
      this.downscaleCanvas.height = 0
      this.downscaleCanvas = null
      this.downscaleCtx = null
    }
  }

  /**
   * Draw the camera frame into the square model input while PRESERVING aspect
   * ratio (letterboxed, centered). Squishing a 16:9 frame into a square badly
   * degrades the selfie model — the person comes back with a soft, low-confidence
   * mask that lets the background treatment bleed onto them. Instead the frame is
   * aspect-fit into the square and the content rect recorded, so applyMask crops
   * the mask back to just that region — keeping it undistorted AND aligned.
   */
  private snapshotFrame(id: string, video: HTMLVideoElement): Uint8Array | null {
    const ctx = this.getDownscaleContext()
    if (!ctx) return null
    const vw = video.videoWidth || SEGMENTATION_INPUT_WIDTH
    const vh = video.videoHeight || SEGMENTATION_INPUT_HEIGHT
    const scale = Math.min(SEGMENTATION_INPUT_WIDTH / vw, SEGMENTATION_INPUT_HEIGHT / vh)
    const cw = Math.max(1, Math.min(SEGMENTATION_INPUT_WIDTH, Math.round(vw * scale)))
    const ch = Math.max(1, Math.min(SEGMENTATION_INPUT_HEIGHT, Math.round(vh * scale)))
    const ox = Math.floor((SEGMENTATION_INPUT_WIDTH - cw) / 2)
    const oy = Math.floor((SEGMENTATION_INPUT_HEIGHT - ch) / 2)
    this.contentRects.set(id, { ox, oy, cw, ch })

    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, SEGMENTATION_INPUT_WIDTH, SEGMENTATION_INPUT_HEIGHT)
    ctx.drawImage(video, ox, oy, cw, ch)
    const imageData = ctx.getImageData(0, 0, SEGMENTATION_INPUT_WIDTH, SEGMENTATION_INPUT_HEIGHT)
    // getImageData returns a fresh buffer each call, so a view is safe: IPC
    // clones the bytes synchronously when `segment` is invoked.
    return new Uint8Array(imageData.data.buffer, imageData.data.byteOffset, imageData.data.byteLength)
  }

  private applyMask(id: string, mask: SegmentationMask): void {
    // Crop the mask to the letterboxed content region so it represents the full
    // (undistorted) frame, matching how snapshotFrame fit the camera in. The
    // consumers then fit this content-sized mask over the full-frame video and
    // it lines up 1:1.
    const rect = this.contentRects.get(id) ?? { ox: 0, oy: 0, cw: mask.width, ch: mask.height }
    const canvas = this.getMaskCanvas(id, rect.cw, rect.ch)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const image = ctx.createImageData(rect.cw, rect.ch)
    const data = image.data
    const alpha = mask.alpha
    for (let y = 0; y < rect.ch; y++) {
      const srcRow = (rect.oy + y) * mask.width + rect.ox
      const dstRow = y * rect.cw
      for (let x = 0; x < rect.cw; x++) {
        const o = (dstRow + x) * 4
        data[o] = 255
        data[o + 1] = 255
        data[o + 2] = 255
        data[o + 3] = alpha[srcRow + x]
      }
    }
    ctx.putImageData(image, 0, 0)
    this.resultsCache.set(id, {
      mask: canvas,
      width: rect.cw,
      height: rect.ch,
      timestamp: Date.now()
    })
  }

  private getDownscaleContext(): CanvasRenderingContext2D | null {
    if (!this.downscaleCanvas) {
      this.downscaleCanvas = document.createElement('canvas')
      this.downscaleCanvas.width = SEGMENTATION_INPUT_WIDTH
      this.downscaleCanvas.height = SEGMENTATION_INPUT_HEIGHT
      this.downscaleCtx = this.downscaleCanvas.getContext('2d', { willReadFrequently: true })
    }
    return this.downscaleCtx
  }

  private getMaskCanvas(id: string, width: number, height: number): HTMLCanvasElement {
    let canvas = this.maskCanvases.get(id)
    if (!canvas) {
      canvas = document.createElement('canvas')
      this.maskCanvases.set(id, canvas)
    }
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height
    return canvas
  }

  private startIdleSweep(): void {
    if (this.idleSweepTimer) return
    this.idleSweepTimer = setInterval(() => this.sweepIdle(), IDLE_SWEEP_INTERVAL_MS)
  }

  private sweepIdle(): void {
    const now = performance.now()
    for (const [id, usedAt] of this.lastUsedAt) {
      if (now - usedAt < IDLE_ENTRY_TTL_MS) continue
      this.lastUsedAt.delete(id)
      this.resultsCache.delete(id)
      this.inFlight.delete(id)
      this.lastSentAt.delete(id)
      this.contentRects.delete(id)
      const canvas = this.maskCanvases.get(id)
      if (canvas) {
        canvas.width = 0
        canvas.height = 0
        this.maskCanvases.delete(id)
      }
    }

    if (this.lastUsedAt.size === 0 && this.idleSweepTimer) {
      // The worker idle-releases its own model memory server-side; here we just
      // stop sweeping until the next active frame.
      clearInterval(this.idleSweepTimer)
      this.idleSweepTimer = null
    }
  }
}

interface SegmentationApi {
  preload: () => Promise<void>
  segment: (frame: { width: number; height: number; data: Uint8Array }) => Promise<SegmentationMask>
  getStatus: () => Promise<{ running: boolean; pid?: number; pendingRequests: number }>
}

function getSegmentationApi(): SegmentationApi | null {
  const api = (window as unknown as { api?: { segmentation?: SegmentationApi } }).api
  return api?.segmentation ?? null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// Native segmentation only. The MediaPipe WASM fallback was removed once the
// onnxruntime-node/DirectML path was verified live, dropping the @mediapipe
// dependency and its in-renderer ML runtime. If the worker is unavailable (no
// model download / no compatible GPU + failed CPU init), virtual backgrounds
// degrade to unmasked — the person shows over the background, same as warmup —
// rather than cutting out; the reason is logged once.
let warnedUnavailable = false
export const segmentationService: SegmentationBackend = new NativeSegmentationBackend((reason) => {
  if (warnedUnavailable) return
  warnedUnavailable = true
  console.warn(`[SegmentationService] Native segmentation unavailable: ${reason}`)
})
