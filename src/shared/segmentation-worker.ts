/**
 * Shared protocol between the renderer segmentation facade and the native
 * onnxruntime-node segmentation worker (an Electron utility process).
 *
 * The worker replaces the MediaPipe Selfie Segmentation WASM model that used to
 * run inside the renderer's GPU process. Moving inference to a native, GPU
 * (DirectML) accelerated utility process removes the @mediapipe dependency and
 * lets Windows reclaim the model/heap memory when no virtual background is
 * active. The renderer keeps the same `processVideo` / `getMask` facade, so the
 * broadcast render loop and the native compositor upload path are unchanged.
 *
 * Mask contract: the native compositor samples the mask texture's ALPHA channel
 * (`fs_sprite.sc`: `texture2D(s_maskTex, ...).a`) and the canvas render loop
 * composites with `destination-in` (also source alpha). So the worker returns a
 * single-channel foreground map (0 = background, 255 = person) that the renderer
 * paints into a mask canvas's alpha channel — identical semantics to the old
 * MediaPipe mask.
 */

/**
 * Square input the renderer downsamples the fitted camera frame to before
 * handing it to the worker. 256x256 matches the MediaPipe Selfie Segmentation
 * "general" model and keeps the per-frame IPC payload small (256*256*4 = 256 KB
 * one way, a 64 KB alpha map back).
 */
export const SEGMENTATION_INPUT_WIDTH = 256
export const SEGMENTATION_INPUT_HEIGHT = 256

/**
 * Model resolution order inside the worker:
 *   1. `ILY_SEGMENTATION_MODEL_PATH` env var (an explicit local .onnx file).
 *   2. `<cacheDir>/<SEGMENTATION_MODEL_FILE>` if already downloaded.
 *   3. Download `SEGMENTATION_MODEL_URL` into the cache dir (first run only).
 * If none resolve, the worker reports it is unavailable and the renderer falls
 * back to the MediaPipe path so virtual backgrounds keep working.
 *
 * NOTE: `SEGMENTATION_MODEL_URL` must point at a portrait/selfie segmentation
 * ONNX export whose I/O matches the assumptions in the worker (RGB input in
 * [0,1], single-channel foreground output). Confirm the exact model before
 * shipping — see the worker's `resolveModel`.
 */
export const SEGMENTATION_MODEL_FILE = 'selfie_segmentation.onnx'
export const SEGMENTATION_MODEL_URL =
  'https://huggingface.co/onnx-community/mediapipe_selfie_segmentation/resolve/main/onnx/model.onnx'

export interface SegmentationFrame {
  /** Frame width in pixels (expected: SEGMENTATION_INPUT_WIDTH). */
  width: number
  /** Frame height in pixels (expected: SEGMENTATION_INPUT_HEIGHT). */
  height: number
  /** Tightly packed RGBA8 pixels, length === width * height * 4. */
  data: Uint8Array
}

export interface SegmentationMask {
  width: number
  height: number
  /** Foreground map, length === width * height. 0 = background, 255 = person. */
  alpha: Uint8Array
}

export type SegmentationWorkerRequest =
  | {
      id: string
      type: 'preload'
    }
  | {
      id: string
      type: 'segment'
      payload: SegmentationFrame
    }

export type SegmentationWorkerResponse =
  | {
      id: string
      ok: true
      result?: SegmentationMask
    }
  | {
      id: string
      ok: false
      error: string
    }

export function normalizeSegmentationFrame(value: unknown): SegmentationFrame {
  if (!value || typeof value !== 'object') {
    throw new Error('Segmentation frame must be an object')
  }

  const frame = value as Partial<SegmentationFrame>
  const width = frame.width
  const height = frame.height
  if (
    typeof width !== 'number'
    || typeof height !== 'number'
    || !Number.isInteger(width)
    || !Number.isInteger(height)
    || width <= 0
    || height <= 0
  ) {
    throw new Error('Segmentation frame requires positive integer width and height')
  }

  const data = frame.data
  if (!(data instanceof Uint8Array)) {
    throw new Error('Segmentation frame data must be a Uint8Array')
  }
  if (data.length !== width * height * 4) {
    throw new Error(
      `Segmentation frame data length ${data.length} does not match ${width}x${height} RGBA (${width * height * 4})`
    )
  }

  return { width, height, data }
}

export function isSegmentationMask(value: unknown): value is SegmentationMask {
  if (!value || typeof value !== 'object') return false
  const mask = value as Record<string, unknown>
  return (
    typeof mask.width === 'number'
    && typeof mask.height === 'number'
    && mask.alpha instanceof Uint8Array
    && mask.alpha.length === (mask.width as number) * (mask.height as number)
  )
}

export interface FloatMaskOptions {
  /**
   * True when the model output is a raw logit that still needs a sigmoid to
   * become a [0,1] probability. MediaPipe-style exports already emit a
   * post-sigmoid probability, so this defaults to false.
   */
  applySigmoid?: boolean
  /**
   * Optional soft threshold. Values below `lower` clamp to 0, values above
   * `upper` clamp to 1, and the band between is linearly ramped — a cheap way to
   * firm up edges without hard aliasing. When omitted the probability maps
   * straight to alpha.
   */
  lower?: number
  upper?: number
}

/**
 * Convert a model's floating point foreground output into a 0..255 alpha map.
 * Pure and side-effect free so the worker's post-processing is unit testable
 * without loading onnxruntime.
 */
export function floatMaskToAlpha(
  values: ArrayLike<number>,
  options: FloatMaskOptions = {}
): Uint8Array {
  const { applySigmoid = false, lower, upper } = options
  const hasBand =
    typeof lower === 'number'
    && typeof upper === 'number'
    && upper > lower
  const out = new Uint8Array(values.length)

  for (let i = 0; i < values.length; i++) {
    let p = values[i]
    if (applySigmoid) p = 1 / (1 + Math.exp(-p))
    if (hasBand) {
      p = (p - (lower as number)) / ((upper as number) - (lower as number))
    }
    if (p <= 0) {
      out[i] = 0
    } else if (p >= 1) {
      out[i] = 255
    } else {
      out[i] = Math.round(p * 255)
    }
  }

  return out
}
