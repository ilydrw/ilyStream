import { KOKORO_MODEL_ID } from '../../shared/tts-providers'
import { resolveAppSettings } from '../../shared/app-settings'
import type { KokoroSynthesisResult } from '../../shared/kokoro-worker'
import ortWasmMjsUrl from '../../../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.mjs?url'
import ortWasmBinaryUrl from '../../../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.wasm?url'

type KokoroModule = typeof import('kokoro-js')
type KokoroInstance = Awaited<ReturnType<KokoroModule['KokoroTTS']['from_pretrained']>>

const KOKORO_WASM_PATHS = {
  mjs: new URL(ortWasmMjsUrl, import.meta.url).href,
  wasm: new URL(ortWasmBinaryUrl, import.meta.url).href
}

let modelPromise: Promise<KokoroInstance> | null = null

async function resolveConfiguredKokoroDtype(): Promise<'fp32' | 'q8'> {
  try {
    const settingsRaw = await window.api.settings.getAll()
    const settings = resolveAppSettings(settingsRaw || {})
    return settings.tts.kokoroQuality === 'fp32' ? 'fp32' : 'q8'
  } catch {
    return 'q8'
  }
}

function loadKokoroModel(): Promise<KokoroInstance> {
  if (modelPromise) return modelPromise

  modelPromise = (async () => {
    try {
      const { KokoroTTS, env: kokoroEnv } = await import('kokoro-js')
      kokoroEnv.wasmPaths = KOKORO_WASM_PATHS
      const dtype = await resolveConfiguredKokoroDtype()

      if (dtype === 'fp32') {
        try {
          const model = await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
            dtype: 'fp32',
            device: 'wasm'
          })
          return model
        } catch (error) {
          console.warn('[kokoro] WASM fp32 fallback failed; trying q8:', error)
        }
      }

      return await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
        dtype: 'q8',
        device: 'wasm'
      })
    } catch (error) {
      modelPromise = null
      throw error
    }
  })()

  return modelPromise
}

export async function generateKokoroWasm(
  text: string,
  voice: string,
  speed: number
): Promise<KokoroSynthesisResult> {
  const model = await loadKokoroModel()
  const rawAudio = await (model as any).generate(text, { voice, speed })
  return {
    samples: new Float32Array(rawAudio.audio),
    sampleRate: rawAudio.sampling_rate
  }
}
