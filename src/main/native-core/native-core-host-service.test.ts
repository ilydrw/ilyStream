import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NATIVE_MIXER_BLOCK_BYTES } from '../../shared/native-mixer-audio-shadow'

const mocks = vi.hoisted(() => ({
  startClient: vi.fn(),
  createWriter: vi.fn(() => true),
  pushSource: vi.fn(() => true),
  closeWriter: vi.fn(() => true),
  startReader: vi.fn(),
  stopReader: vi.fn(() => ({ running: false, framesCaptured: 0, framesDropped: 0, sampleRate: 0, channels: 0 })),
  readerCallback: null as ((frame: { pcm: Float32Array }) => void) | null
}))

vi.mock('./native-core-host-client', () => ({
  NativeCoreHostClient: { start: mocks.startClient }
}))

vi.mock('../audio/native-audio-capture', () => ({
  createSharedMixerSourceWriter: mocks.createWriter,
  pushSharedMixerSource: mocks.pushSource,
  closeSharedMixerSourceWriter: mocks.closeWriter,
  startSharedCaptureReader: vi.fn((_transport, callback) => {
    mocks.readerCallback = callback
    return { sampleRate: 48000, channels: 2, exclusive: false, chunkFrames: 1024 }
  }),
  stopSharedCaptureReader: mocks.stopReader,
  getSharedCaptureReaderStatus: vi.fn(() => ({
    running: false, framesCaptured: 0, framesDropped: 0, sampleRate: 0, channels: 0
  }))
}))

import { NativeCoreHostService } from './native-core-host-service'

describe('NativeCoreHostService mixer audio shadow', () => {
  const previousHostFlag = process.env.ILYSTREAM_NATIVE_CORE_HOST
  const previousShadowFlag = process.env.ILYSTREAM_NATIVE_MIXER_AUDIO_SHADOW
  const previousAudioFlag = process.env.ILY_NATIVE_AUDIO

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.readerCallback = null
    process.env.ILYSTREAM_NATIVE_CORE_HOST = '1'
    process.env.ILYSTREAM_NATIVE_MIXER_AUDIO_SHADOW = '1'
    delete process.env.ILY_NATIVE_AUDIO
  })

  afterEach(() => {
    if (previousHostFlag === undefined) delete process.env.ILYSTREAM_NATIVE_CORE_HOST
    else process.env.ILYSTREAM_NATIVE_CORE_HOST = previousHostFlag
    if (previousShadowFlag === undefined) delete process.env.ILYSTREAM_NATIVE_MIXER_AUDIO_SHADOW
    else process.env.ILYSTREAM_NATIVE_MIXER_AUDIO_SHADOW = previousShadowFlag
    if (previousAudioFlag === undefined) delete process.env.ILY_NATIVE_AUDIO
    else process.env.ILY_NATIVE_AUDIO = previousAudioFlag
  })

  it('configures bounded source rings and compares native PCM with the renderer reference', async () => {
    const client = {
      executablePath: 'host.exe',
      health: vi.fn(async () => ({ pid: 12, engineInitialized: false })),
      startMixerTransport: vi.fn(async (sources) => ({
        transport: 'shared-memory-v1',
        format: 'f32-interleaved',
        ringName: 'Local\\ilyStream.Program.Audio.NativeMixer.00112233445566778899aabbccddeeff',
        generation: 42n,
        sampleRate: 48000,
        channels: 2,
        capacityFrames: 96256,
        blockFrames: 1024,
        sourceCount: sources.length
      })),
      stopMixerTransport: vi.fn(async () => ({ running: false })),
      stop: vi.fn(async () => undefined)
    }
    mocks.startClient.mockResolvedValue(client)
    const service = new NativeCoreHostService()
    await service.initialize()
    await expect(service.configureMixerAudioShadow({ sourceIds: ['mic', 'desktop'] }))
      .resolves.toEqual({ active: true })
    expect(mocks.createWriter).toHaveBeenCalledTimes(2)
    expect(client.startMixerTransport).toHaveBeenCalledOnce()

    const data = new Uint8Array(NATIVE_MIXER_BLOCK_BYTES)
    service.pushMixerAudioShadowSource({ sourceId: 'mic', data, sampleRate: 48000, channels: 2 })
    service.pushMixerAudioShadowReference({ data, sampleRate: 48000, channels: 2 })
    mocks.readerCallback?.({ pcm: new Float32Array(2048) })
    expect(mocks.pushSource).toHaveBeenCalledOnce()
    expect(service.getStatus().mixerAudioShadow).toMatchObject({
      active: true,
      sourceCount: 2,
      comparedBlocks: 1,
      mismatches: 0
    })
    await service.dispose()
    expect(mocks.closeWriter).toHaveBeenCalledTimes(2)
  })
})
