import type { KokoroQuality } from './settings/types'
import { isKokoroVoiceId } from './tts-providers'

export const KOKORO_MAX_TEXT_LENGTH = 2_000
export const KOKORO_MIN_SPEED = 0.85
export const KOKORO_MAX_SPEED = 1.18

export interface KokoroSynthesisRequest {
  text: string
  voice: string
  speed: number
}

export interface KokoroSynthesisResult {
  samples: Float32Array
  sampleRate: number
}

export type KokoroWorkerRequest =
  | {
      id: string
      type: 'preload'
      quality: KokoroQuality
    }
  | {
      id: string
      type: 'generate'
      quality: KokoroQuality
      payload: KokoroSynthesisRequest
    }

export type KokoroWorkerResponse =
  | {
      id: string
      ok: true
      result?: KokoroSynthesisResult
    }
  | {
      id: string
      ok: false
      error: string
    }

export function normalizeKokoroSynthesisRequest(
  value: unknown
): KokoroSynthesisRequest {
  if (!value || typeof value !== 'object') {
    throw new Error('Kokoro synthesis request must be an object')
  }

  const request = value as Partial<KokoroSynthesisRequest>
  const text = typeof request.text === 'string' ? request.text.trim() : ''
  if (!text) {
    throw new Error('Kokoro synthesis text is required')
  }
  if (text.length > KOKORO_MAX_TEXT_LENGTH) {
    throw new Error(`Kokoro synthesis text exceeds ${KOKORO_MAX_TEXT_LENGTH} characters`)
  }

  const voice = typeof request.voice === 'string' ? request.voice : ''
  if (!isKokoroVoiceId(voice)) {
    throw new Error('Unknown Kokoro voice')
  }

  const speed = request.speed
  if (
    typeof speed !== 'number'
    || !Number.isFinite(speed)
    || speed < KOKORO_MIN_SPEED
    || speed > KOKORO_MAX_SPEED
  ) {
    throw new Error(
      `Kokoro speed must be between ${KOKORO_MIN_SPEED} and ${KOKORO_MAX_SPEED}`
    )
  }

  return { text, voice, speed }
}

export function isKokoroQuality(value: unknown): value is KokoroQuality {
  return value === 'fp32' || value === 'q8'
}
