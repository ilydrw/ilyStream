import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getAppPath: () => 'C:/app' } }))
const audioMocks = vi.hoisted(() => ({
  isNativeAudioAvailable: vi.fn(() => true),
  startCapture: vi.fn(),
  stopCapture: vi.fn(() => ({ framesCaptured: 0, framesDropped: 0 })),
  getCaptureStatus: vi.fn(() => ({
    running: false,
    framesCaptured: 0,
    framesDropped: 0,
    sampleRate: 0,
    channels: 0
  }))
}))
vi.mock('./native-audio-capture', () => audioMocks)

import {
  NativeAudioSource,
  isNativeAudioEnabled,
  isNativeAudioRequested,
  resolveNativeAudioOptions,
  type NativeAudioHost
} from './native-audio-source'

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

  it('requires a separate acknowledgement for the device-only policy bypass', () => {
    expect(isNativeAudioRequested({ ILY_NATIVE_AUDIO: '1' })).toBe(true)
    expect(isNativeAudioEnabled({ ILY_NATIVE_AUDIO: '1' })).toBe(false)
    expect(isNativeAudioEnabled({
      ILY_NATIVE_AUDIO: '1',
      ILY_NATIVE_AUDIO_DEVICE_ONLY_ACK: '1'
    })).toBe(true)
  })

  it('does not treat other truthy-looking values as opt-in', () => {
    for (const value of ['true', 'yes', 'on', '0', '', 'TRUE']) {
      expect(isNativeAudioEnabled({ ILY_NATIVE_AUDIO: value })).toBe(false)
      expect(isNativeAudioRequested({ ILY_NATIVE_AUDIO: value })).toBe(false)
    }
  })
})

describe('NativeAudioSource host routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    audioMocks.isNativeAudioAvailable.mockReturnValue(true)
    audioMocks.stopCapture.mockReturnValue({ framesCaptured: 0, framesDropped: 0 })
  })

  it('uses the native host and stops it without invoking direct device capture', async () => {
    let deliver: ((frame: { pcm: Float32Array; framesCaptured: number; framesDropped: number }) => void) | null = null
    const host: NativeAudioHost = {
      audioCaptureAvailable: true,
      startAudioCapture: vi.fn(async (_options, onFrame) => {
        deliver = onFrame
        return { sampleRate: 48000, channels: 2, exclusive: false, chunkFrames: 1024 }
      }),
      stopAudioCapture: vi.fn(async () => ({ framesCaptured: 2, framesDropped: 0 })),
      getAudioCaptureStatus: vi.fn(() => ({ running: true, framesCaptured: 2, framesDropped: 0 }))
    }
    const output = vi.fn()
    const source = new NativeAudioSource(host)

    await expect(source.start(output, {
      ILY_NATIVE_AUDIO: '1',
      ILY_NATIVE_AUDIO_DEVICE_ONLY_ACK: '1'
    })).resolves.toBe(true)
    expect(host.startAudioCapture).toHaveBeenCalledOnce()
    expect(audioMocks.startCapture).not.toHaveBeenCalled()

    deliver!({ pcm: new Float32Array([0.25, -0.25, 0.5, -0.5]), framesCaptured: 2, framesDropped: 0 })
    expect(output).toHaveBeenCalledOnce()

    await source.stop()
    expect(host.stopAudioCapture).toHaveBeenCalledOnce()
    expect(source.active).toBe(false)
  })

  it('falls back to the established addon when host capture cannot start', async () => {
    const host: NativeAudioHost = {
      audioCaptureAvailable: true,
      startAudioCapture: vi.fn(async () => { throw new Error('host failed') }),
      stopAudioCapture: vi.fn(async () => ({ framesCaptured: 0, framesDropped: 0 })),
      getAudioCaptureStatus: vi.fn(() => ({ running: false, framesCaptured: 0, framesDropped: 0 }))
    }
    audioMocks.startCapture.mockReturnValueOnce({
      sampleRate: 48000,
      channels: 2,
      exclusive: false,
      chunkFrames: 1024
    })
    const source = new NativeAudioSource(host)

    await expect(source.start(vi.fn(), {
      ILY_NATIVE_AUDIO: '1',
      ILY_NATIVE_AUDIO_DEVICE_ONLY_ACK: '1'
    })).resolves.toBe(true)
    expect(host.startAudioCapture).toHaveBeenCalledOnce()
    expect(audioMocks.startCapture).toHaveBeenCalledOnce()

    await source.stop()
    expect(audioMocks.stopCapture).toHaveBeenCalledOnce()
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
