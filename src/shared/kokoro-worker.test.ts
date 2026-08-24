import { describe, expect, it } from 'vitest'
import {
  KOKORO_MAX_TEXT_LENGTH,
  normalizeKokoroSynthesisRequest
} from './kokoro-worker'

describe('normalizeKokoroSynthesisRequest', () => {
  it('accepts a bounded request with a known voice', () => {
    expect(normalizeKokoroSynthesisRequest({
      text: ' hello ',
      voice: 'af_heart',
      speed: 1
    })).toEqual({
      text: 'hello',
      voice: 'af_heart',
      speed: 1
    })
  })

  it('rejects unknown voices and oversized text', () => {
    expect(() => normalizeKokoroSynthesisRequest({
      text: 'hello',
      voice: 'not-a-voice',
      speed: 1
    })).toThrow('Unknown Kokoro voice')

    expect(() => normalizeKokoroSynthesisRequest({
      text: 'x'.repeat(KOKORO_MAX_TEXT_LENGTH + 1),
      voice: 'af_heart',
      speed: 1
    })).toThrow('exceeds')
  })
})
