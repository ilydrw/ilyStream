import process from 'node:process'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import * as ort from 'onnxruntime-node'
import {
  SEGMENTATION_INPUT_HEIGHT,
  SEGMENTATION_INPUT_WIDTH,
  SEGMENTATION_MODEL_FILE,
  SEGMENTATION_MODEL_URL,
  floatMaskToAlpha,
  normalizeSegmentationFrame,
  type SegmentationMask,
  type SegmentationWorkerRequest,
  type SegmentationWorkerResponse
} from '../../shared/segmentation-worker'

const parentPort = process.parentPort
if (!parentPort) {
  throw new Error('Segmentation worker must run as an Electron utility process')
}

/**
 * The default model (MediaPipe selfie) emits a post-sigmoid probability. Set
 * `ILY_SEGMENTATION_SIGMOID=1` for models that output raw logits.
 */
const APPLY_SIGMOID = process.env.ILY_SEGMENTATION_SIGMOID === '1'

type TensorLayout = 'nhwc' | 'nchw'
type InputDataType = 'float32' | 'uint8'

interface InputFormat {
  layout: TensorLayout
  dtype: InputDataType
}

// onnxruntime-node does not expose input dims/type metadata, and selfie
// segmentation ONNX exports differ (NHWC vs NCHW, float32 [0,1] vs raw uint8).
// Rather than hardcode one and silently fall back to MediaPipe when it is wrong,
// we probe these formats once with a dummy run and lock in whichever the model
// accepts (a mismatched shape/dtype makes `run` throw). `ILY_SEGMENTATION_LAYOUT`
// / `ILY_SEGMENTATION_INPUT_DTYPE` move the preferred candidate to the front.
const INPUT_FORMAT_CANDIDATES: InputFormat[] = orderCandidates([
  { layout: 'nhwc', dtype: 'float32' },
  { layout: 'nchw', dtype: 'float32' },
  { layout: 'nhwc', dtype: 'uint8' },
  { layout: 'nchw', dtype: 'uint8' }
])

interface LoadedModel {
  session: ort.InferenceSession
  inputName: string
  outputName: string
  provider: string
  format: InputFormat
}

function orderCandidates(candidates: InputFormat[]): InputFormat[] {
  const layout = process.env.ILY_SEGMENTATION_LAYOUT?.toLowerCase()
  const dtype = process.env.ILY_SEGMENTATION_INPUT_DTYPE?.toLowerCase()
  return [...candidates].sort((a, b) => score(b) - score(a))

  function score(format: InputFormat): number {
    let s = 0
    if (layout && format.layout === layout) s += 2
    if (dtype && format.dtype === dtype) s += 1
    return s
  }
}

let modelPromise: Promise<LoadedModel> | null = null
let workQueue: Promise<void> = Promise.resolve()

async function resolveModelPath(): Promise<string> {
  const explicit = process.env.ILY_SEGMENTATION_MODEL_PATH
  if (explicit && (await exists(explicit))) return explicit

  const cacheDir = process.env.ILY_SEGMENTATION_MODEL_DIR ?? join('.', 'models', 'segmentation')
  const target = join(cacheDir, SEGMENTATION_MODEL_FILE)
  if (await exists(target)) return target

  await downloadModel(SEGMENTATION_MODEL_URL, target)
  return target
}

async function exists(path: string): Promise<boolean> {
  try {
    const info = await stat(path)
    return info.isFile() && info.size > 0
  } catch {
    return false
  }
}

async function downloadModel(url: string, target: string): Promise<void> {
  console.info(`[segmentation-worker] downloading model: ${url}`)
  await mkdir(dirname(target), { recursive: true })

  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`Segmentation model download failed (${response.status} ${response.statusText})`)
  }

  // Write to a temp file then atomically rename so a partial download never
  // looks like a valid cached model on the next run.
  const tempPath = `${target}.download`
  await pipeline(
    Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
    createWriteStream(tempPath)
  )
  await rename(tempPath, target)
  console.info(`[segmentation-worker] model ready: ${target}`)
}

async function createSession(modelPath: string): Promise<LoadedModel> {
  // Prefer the DirectML (GPU) execution provider — onnxruntime-node ships
  // DirectML.dll — and fall back to CPU if the device can't create a DML
  // session (e.g. no compatible GPU in a headless/VM context).
  const attempts: Array<{ providers: ort.InferenceSession.SessionOptions['executionProviders']; name: string }> = [
    { providers: ['dml', 'cpu'], name: 'dml' },
    { providers: ['cpu'], name: 'cpu' }
  ]

  let lastError: unknown
  for (const attempt of attempts) {
    try {
      const session = await ort.InferenceSession.create(modelPath, {
        executionProviders: attempt.providers,
        graphOptimizationLevel: 'all'
      })
      const inputName = session.inputNames[0]
      const outputName = session.outputNames[0]
      if (!inputName || !outputName) {
        throw new Error('Segmentation model has no input/output tensors')
      }
      const format = await calibrateInputFormat(session, inputName, outputName)
      console.info(
        `[segmentation-worker] session ready via ${attempt.name} `
        + `(in=${inputName}, out=${outputName}, ${format.layout}/${format.dtype})`
      )
      return { session, inputName, outputName, provider: attempt.name, format }
    } catch (error) {
      lastError = error
      console.warn(`[segmentation-worker] ${attempt.name} provider failed: ${String(error)}`)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

/**
 * Probe input formats with a dummy frame and keep the first the model accepts
 * (and whose output is a per-pixel map). Runs once per session load.
 */
async function calibrateInputFormat(
  session: ort.InferenceSession,
  inputName: string,
  outputName: string
): Promise<InputFormat> {
  const pixels = SEGMENTATION_INPUT_WIDTH * SEGMENTATION_INPUT_HEIGHT
  const dummy = new Uint8Array(pixels * 4)
  let lastError: unknown

  for (const format of INPUT_FORMAT_CANDIDATES) {
    try {
      const tensor = buildInputTensor(dummy, format)
      const results = await session.run({ [inputName]: tensor })
      const output = results[outputName]
      if (output && output.data.length % pixels === 0) {
        return format
      }
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(
    `Segmentation model rejected all input formats: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  )
}

function loadModel(): Promise<LoadedModel> {
  if (modelPromise) return modelPromise
  modelPromise = (async () => {
    const modelPath = await resolveModelPath()
    return createSession(modelPath)
  })().catch((error) => {
    modelPromise = null
    throw error
  })
  return modelPromise
}

/**
 * RGBA8 (0..255) -> the RGB input tensor the model expects, in the given layout
 * and dtype. float32 is rescaled to [0,1] (the selfie preprocessor's do_rescale
 * with no mean/std normalization); uint8 keeps the raw 0..255 bytes (the model
 * rescales internally). The renderer already downsampled the fitted camera frame
 * to the model input size, so no resampling happens here.
 */
function buildInputTensor(data: Uint8Array, format: InputFormat): ort.Tensor {
  const w = SEGMENTATION_INPUT_WIDTH
  const h = SEGMENTATION_INPUT_HEIGHT
  const pixels = w * h
  const nhwc = format.layout === 'nhwc'
  const plane = pixels

  if (format.dtype === 'uint8') {
    const bytes = new Uint8Array(pixels * 3)
    for (let i = 0; i < pixels; i++) {
      const r = data[i * 4]
      const g = data[i * 4 + 1]
      const b = data[i * 4 + 2]
      if (nhwc) {
        bytes[i * 3] = r
        bytes[i * 3 + 1] = g
        bytes[i * 3 + 2] = b
      } else {
        bytes[i] = r
        bytes[plane + i] = g
        bytes[plane * 2 + i] = b
      }
    }
    return new ort.Tensor('uint8', bytes, nhwc ? [1, h, w, 3] : [1, 3, h, w])
  }

  const floats = new Float32Array(pixels * 3)
  for (let i = 0; i < pixels; i++) {
    const r = data[i * 4] / 255
    const g = data[i * 4 + 1] / 255
    const b = data[i * 4 + 2] / 255
    if (nhwc) {
      floats[i * 3] = r
      floats[i * 3 + 1] = g
      floats[i * 3 + 2] = b
    } else {
      floats[i] = r
      floats[plane + i] = g
      floats[plane * 2 + i] = b
    }
  }
  return new ort.Tensor('float32', floats, nhwc ? [1, h, w, 3] : [1, 3, h, w])
}

function decodeMask(output: ort.Tensor): SegmentationMask {
  const w = SEGMENTATION_INPUT_WIDTH
  const h = SEGMENTATION_INPUT_HEIGHT
  const pixels = w * h
  const raw = output.data as Float32Array | Uint8Array
  const channels = raw.length / pixels

  let foreground: Float32Array
  if (channels >= 2) {
    // Two-class output (background, person). Interpret adjacent pairs as a
    // per-pixel softmax and keep the person channel. Works for both NHWC
    // ([.,.,2]) trailing-channel and simple 2-plane layouts.
    foreground = new Float32Array(pixels)
    const twoClass = Math.round(channels) === 2
    for (let i = 0; i < pixels; i++) {
      const bg = twoClass ? raw[i * 2] : raw[i]
      const fg = twoClass ? raw[i * 2 + 1] : raw[pixels + i]
      const m = Math.max(bg, fg)
      const eBg = Math.exp(bg - m)
      const eFg = Math.exp(fg - m)
      foreground[i] = eFg / (eBg + eFg)
    }
    return {
      width: w,
      height: h,
      alpha: floatMaskToAlpha(foreground)
    }
  }

  // Single-channel foreground probability (MediaPipe selfie).
  return {
    width: w,
    height: h,
    alpha: floatMaskToAlpha(raw, { applySigmoid: APPLY_SIGMOID })
  }
}

async function handleRequest(request: SegmentationWorkerRequest): Promise<void> {
  if (!request || typeof request.id !== 'string') {
    throw new Error('Invalid segmentation worker request')
  }

  const model = await loadModel()

  if (request.type === 'preload') {
    send({ id: request.id, ok: true })
    return
  }

  if (request.type !== 'segment') {
    throw new Error('Unknown segmentation worker request')
  }

  const frame = normalizeSegmentationFrame(request.payload)
  if (frame.width !== SEGMENTATION_INPUT_WIDTH || frame.height !== SEGMENTATION_INPUT_HEIGHT) {
    throw new Error(
      `Segmentation frame ${frame.width}x${frame.height} does not match the model input `
      + `${SEGMENTATION_INPUT_WIDTH}x${SEGMENTATION_INPUT_HEIGHT}`
    )
  }

  const input = buildInputTensor(frame.data, model.format)
  const results = await model.session.run({ [model.inputName]: input })
  const output = results[model.outputName]
  if (!output) {
    throw new Error('Segmentation model produced no output tensor')
  }

  send({ id: request.id, ok: true, result: decodeMask(output) })
}

function send(response: SegmentationWorkerResponse): void {
  parentPort!.postMessage(response)
}

parentPort.on('message', (event) => {
  const request = event.data as SegmentationWorkerRequest
  workQueue = workQueue
    .then(() => handleRequest(request))
    .catch((error) => {
      send({
        id: typeof request?.id === 'string' ? request.id : '',
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      })
    })
})
