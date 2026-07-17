import { SelfieSegmentation, Results } from '@mediapipe/selfie_segmentation'
import selfieSegmentationBinarypbUrl from '@mediapipe/selfie_segmentation/selfie_segmentation.binarypb?url'
import selfieSegmentationJsUrl from '@mediapipe/selfie_segmentation/selfie_segmentation.js?url'
import selfieSegmentationLandscapeModelUrl from '@mediapipe/selfie_segmentation/selfie_segmentation_landscape.tflite?url'
import selfieSegmentationModelUrl from '@mediapipe/selfie_segmentation/selfie_segmentation.tflite?url'
import selfieSegmentationSimdDataUrl from '@mediapipe/selfie_segmentation/selfie_segmentation_solution_simd_wasm_bin.data?url'
import selfieSegmentationSimdJsUrl from '@mediapipe/selfie_segmentation/selfie_segmentation_solution_simd_wasm_bin.js?url'
import selfieSegmentationSimdWasmUrl from '@mediapipe/selfie_segmentation/selfie_segmentation_solution_simd_wasm_bin.wasm?url'
import selfieSegmentationWasmJsUrl from '@mediapipe/selfie_segmentation/selfie_segmentation_solution_wasm_bin.js?url'
import selfieSegmentationWasmUrl from '@mediapipe/selfie_segmentation/selfie_segmentation_solution_wasm_bin.wasm?url'

export interface SegmentationResult {
  mask: HTMLCanvasElement | null
  width: number
  height: number
  timestamp: number
}

const MEDIAPIPE_ASSETS: Record<string, string> = {
  'selfie_segmentation.binarypb': selfieSegmentationBinarypbUrl,
  'selfie_segmentation.js': selfieSegmentationJsUrl,
  'selfie_segmentation.tflite': selfieSegmentationModelUrl,
  'selfie_segmentation_landscape.tflite': selfieSegmentationLandscapeModelUrl,
  'selfie_segmentation_solution_simd_wasm_bin.data': selfieSegmentationSimdDataUrl,
  'selfie_segmentation_solution_simd_wasm_bin.js': selfieSegmentationSimdJsUrl,
  'selfie_segmentation_solution_simd_wasm_bin.wasm': selfieSegmentationSimdWasmUrl,
  'selfie_segmentation_solution_wasm_bin.js': selfieSegmentationWasmJsUrl,
  'selfie_segmentation_solution_wasm_bin.wasm': selfieSegmentationWasmUrl
}

// A layer that hasn't asked for a mask in this long is treated as inactive:
// its cached mask canvas is dropped, and once no layers remain the mediapipe
// engine itself (WASM heap + model) is closed so the memory comes back.
const IDLE_ENTRY_TTL_MS = 30_000
const IDLE_SWEEP_INTERVAL_MS = 15_000

class SegmentationService {
  private static instance: SegmentationService
  private engine: SelfieSegmentation | null = null
  private resultsCache: Map<string, SegmentationResult> = new Map()
  private processing: Set<string> = new Set()
  private initialized = false
  // Mask canvases are reused per layer — allocating a fresh canvas for every
  // frame (30+/sec) floods the GPU process with backing stores that reclaim
  // slowly.
  private maskCanvases: Map<string, HTMLCanvasElement> = new Map()
  private lastUsedAt: Map<string, number> = new Map()
  private idleSweepTimer: ReturnType<typeof setInterval> | null = null

  private constructor() {}

  static getInstance(): SegmentationService {
    if (!SegmentationService.instance) {
      SegmentationService.instance = new SegmentationService()
    }
    return SegmentationService.instance
  }

  async initialize() {
    if (this.initialized) return

    this.engine = new SelfieSegmentation({
      locateFile: (file) => {
        return MEDIAPIPE_ASSETS[file] || file
      }
    })

    this.engine.setOptions({
      modelSelection: 1, // 1 for landscape (better for streaming)
    })

    this.engine.onResults((results: Results) => {
      const id = (results.image as any).id || 'default'
      const canvas = this.getMaskCanvas(id, results.segmentationMask.width, results.segmentationMask.height)
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(results.segmentationMask, 0, 0)
      }

      this.resultsCache.set(id, {
        mask: canvas,
        width: canvas.width,
        height: canvas.height,
        timestamp: Date.now()
      })
      this.processing.delete(id)
    })

    this.initialized = true
    this.startIdleSweep()
  }

  async processVideo(id: string, video: HTMLVideoElement) {
    if (!this.initialized) await this.initialize()
    if (!this.engine) return

    this.lastUsedAt.set(id, Date.now())
    if (this.processing.has(id)) return

    // Assign ID to image for tracking in onResults
    ;(video as any).id = id

    this.processing.add(id)
    try {
      await this.engine.send({ image: video })
    } catch (err) {
      console.error('[SegmentationService] Error sending to engine:', err)
      this.processing.delete(id)
    }
  }

  getMask(id: string): SegmentationResult | null {
    this.lastUsedAt.set(id, Date.now())
    return this.resultsCache.get(id) || null
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
    const now = Date.now()
    for (const [id, usedAt] of this.lastUsedAt) {
      if (now - usedAt < IDLE_ENTRY_TTL_MS) continue
      this.lastUsedAt.delete(id)
      this.resultsCache.delete(id)
      this.processing.delete(id)
      const canvas = this.maskCanvases.get(id)
      if (canvas) {
        canvas.width = 0
        canvas.height = 0
        this.maskCanvases.delete(id)
      }
    }

    // Nothing left using segmentation — release the engine entirely. It
    // re-initializes lazily on the next processVideo call.
    if (this.lastUsedAt.size === 0 && this.processing.size === 0 && this.engine) {
      console.log('[SegmentationService] No active virtual backgrounds — releasing segmentation engine.')
      const engine = this.engine
      this.engine = null
      this.initialized = false
      if (this.idleSweepTimer) {
        clearInterval(this.idleSweepTimer)
        this.idleSweepTimer = null
      }
      void Promise.resolve(engine.close()).catch((err) => {
        console.warn('[SegmentationService] Engine close failed:', err)
      })
    }
  }
}

export const segmentationService = SegmentationService.getInstance()
