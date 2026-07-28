import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getAppPath: () => 'C:/app' } }))

import { isNativeAudioEnabled, resolveNativeAudioOptions } from './native-audio-source'

/**
 * Native capture replaces the renderer's worklet as the encoder's audio source,
 * which silently drops TTS and soundboard out of the mix. Everything about the
 * gate therefore has to fail closed: anything short of an explicit opt-in must
 * leave the renderer path in charge.
 */
describe('isNativeAudioEnabled', () => {
  it('is off when unset', () => {
    expect(isNativeAudioEnabled({})).toBe(false)
  })

  it('is on only for an exact "1"', () => {
    expect(isNativeAudioEnabled({ ILY_NATIVE_AUDIO: '1' })).toBe(true)
  })

  it('does not treat other truthy-looking values as opt-in', () => {
    for (const value of ['true', 'yes', 'on', '0', '', 'TRUE']) {
      expect(isNativeAudioEnabled({ ILY_NATIVE_AUDIO: value })).toBe(false)
    }
  })
})

describe('resolveNativeAudioOptions', () => {
  it('defaults to 48kHz stereo shared mode', () => {
    expect(resolveNativeAudioOptions({})).toEqual({
      deviceId: undefined,
      sampleRate: 48000,
      channels: 2,
      exclusive: false
    })
  })

  it('reads overrides from the environment', () => {
    expect(
      resolveNativeAudioOptions({
        ILY_NATIVE_AUDIO_DEVICE: 'Focusrite',
        ILY_NATIVE_AUDIO_RATE: '44100',
        ILY_NATIVE_AUDIO_CHANNELS: '1',
        ILY_NATIVE_AUDIO_EXCLUSIVE: '1'
      })
    ).toEqual({ deviceId: 'Focusrite', sampleRate: 44100, channels: 1, exclusive: true })
  })

  it('falls back to defaults for unparseable numbers rather than passing NaN down', () => {
    const options = resolveNativeAudioOptions({
      ILY_NATIVE_AUDIO_RATE: 'fast',
      ILY_NATIVE_AUDIO_CHANNELS: '-2'
    })
    expect(options.sampleRate).toBe(48000)
    expect(options.channels).toBe(2)
  })

  it('leaves exclusive off unless explicitly requested', () => {
    expect(resolveNativeAudioOptions({ ILY_NATIVE_AUDIO_EXCLUSIVE: 'true' }).exclusive).toBe(false)
  })
})
