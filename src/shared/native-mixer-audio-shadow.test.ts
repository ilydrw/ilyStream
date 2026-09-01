import { describe, expect, it } from 'vitest'
import {
  NATIVE_MIXER_BLOCK_BYTES,
  parseNativeMixerAudioReferenceFrame,
  parseNativeMixerAudioShadowConfig,
  parseNativeMixerAudioShadowFrame
} from './native-mixer-audio-shadow'

describe('native mixer audio shadow boundary', () => {
  const data = new Uint8Array(NATIVE_MIXER_BLOCK_BYTES)

  it('accepts bounded unique source configuration and exact PCM blocks', () => {
    expect(parseNativeMixerAudioShadowConfig({ sourceIds: ['mic', 'desktop'] })).toEqual({
      sourceIds: ['mic', 'desktop']
    })
    expect(parseNativeMixerAudioShadowFrame({
      sourceId: 'mic', data, sampleRate: 48000, channels: 2
    })).not.toBeNull()
    expect(parseNativeMixerAudioReferenceFrame({ data, sampleRate: 48000, channels: 2 })).not.toBeNull()
  })

  it('rejects duplicate identities and partial or oversized blocks', () => {
    expect(parseNativeMixerAudioShadowConfig({ sourceIds: ['mic', 'mic'] })).toBeNull()
    expect(parseNativeMixerAudioShadowFrame({
      sourceId: 'mic', data: data.subarray(8), sampleRate: 48000, channels: 2
    })).toBeNull()
    expect(parseNativeMixerAudioReferenceFrame({ data, sampleRate: 44100, channels: 2 })).toBeNull()
    const nonFinite = new Float32Array(NATIVE_MIXER_BLOCK_BYTES / 4)
    nonFinite[0] = Number.NaN
    expect(parseNativeMixerAudioReferenceFrame({
      data: new Uint8Array(nonFinite.buffer), sampleRate: 48000, channels: 2
    })).toBeNull()
  })
})
