export interface SegmentationResult {
  mask: HTMLCanvasElement | null
  width: number
  height: number
  timestamp: number
}

/**
 * A source of virtual-background silhouettes. The broadcast render loop and the
 * native compositor upload path both drive segmentation through this shape, so
 * the MediaPipe (WASM) and native onnxruntime-node backends are interchangeable.
 *
 * Mask semantics: `mask` is a canvas whose ALPHA channel is the foreground
 * (person = opaque, background = transparent). The canvas path composites it
 * with `destination-in`; the native engine samples `s_maskTex.a`.
 */
export interface SegmentationBackend {
  processVideo(id: string, video: HTMLVideoElement): void
  getMask(id: string): SegmentationResult | null
  dispose(): void
}
