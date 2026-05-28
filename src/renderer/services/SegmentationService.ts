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

class SegmentationService {
  private static instance: SegmentationService
  private engine: SelfieSegmentation | null = null
  private resultsCache: Map<string, SegmentationResult> = new Map()
  private processing: Set<string> = new Set()
  private initialized = false

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
      const canvas = document.createElement('canvas')
      canvas.width = results.segmentationMask.width
      canvas.height = results.segmentationMask.height
      const ctx = canvas.getContext('2d')
      if (ctx) {
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
  }

  async processVideo(id: string, video: HTMLVideoElement) {
    if (!this.initialized) await this.initialize()
    if (!this.engine) return

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
    return this.resultsCache.get(id) || null
  }
}

export const segmentationService = SegmentationService.getInstance()
