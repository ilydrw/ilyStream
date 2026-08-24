import process from 'node:process'
import { KokoroTTS } from 'kokoro-js'
// kokoro-js's own `env` does NOT forward cacheDir to transformers.js — the
// model cache location lives on @huggingface/transformers' env, so set it
// there directly. (Direct dependency so the worker bundle externalizes it.)
import { env as transformersEnv } from '@huggingface/transformers'
import type { KokoroQuality } from '../../shared/settings/types'
import { KOKORO_MODEL_ID } from '../../shared/tts-providers'
import {
  isKokoroQuality,
  normalizeKokoroSynthesisRequest,
  type KokoroWorkerRequest,
  type KokoroWorkerResponse
} from '../../shared/kokoro-worker'

type KokoroInstance = Awaited<ReturnType<typeof KokoroTTS.from_pretrained>>

const parentPort = process.parentPort
if (!parentPort) {
  throw new Error('Kokoro worker must run as an Electron utility process')
}

// Cache the downloaded model under userData instead of transformers.js's
// default (node_modules/@huggingface/transformers/.cache) — that path is
// polluted in dev and read-only + excluded inside the packaged asar.
const cacheDir = process.env.ILY_KOKORO_CACHE_DIR
if (cacheDir) {
  transformersEnv.cacheDir = cacheDir
}

let modelPromise: Promise<KokoroInstance> | null = null
let modelQuality: KokoroQuality | null = null
let workQueue = Promise.resolve()

function loadModel(quality: KokoroQuality): Promise<KokoroInstance> {
  if (modelPromise && modelQuality === quality) return modelPromise
  if (modelPromise) {
    throw new Error('Kokoro quality changed without restarting the worker')
  }

  modelQuality = quality
  modelPromise = KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
    dtype: quality,
    device: 'cpu'
  }).catch((error) => {
    modelPromise = null
    modelQuality = null
    throw error
  })

  return modelPromise
}

async function handleRequest(request: KokoroWorkerRequest): Promise<void> {
  if (!request || typeof request.id !== 'string' || !isKokoroQuality(request.quality)) {
    throw new Error('Invalid Kokoro worker request')
  }

  const model = await loadModel(request.quality)
  if (request.type === 'preload') {
    send({ id: request.id, ok: true })
    return
  }

  if (request.type !== 'generate') {
    throw new Error('Unknown Kokoro worker request')
  }

  const payload = normalizeKokoroSynthesisRequest(request.payload)
  const rawAudio = await model.generate(payload.text, {
    voice: payload.voice as any,
    speed: payload.speed
  })
  const samples = new Float32Array(rawAudio.audio)

  send({
    id: request.id,
    ok: true,
    result: {
      samples,
      sampleRate: rawAudio.sampling_rate
    }
  })
}

function send(response: KokoroWorkerResponse): void {
  parentPort.postMessage(response)
}

parentPort.on('message', (event) => {
  const request = event.data as KokoroWorkerRequest
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
