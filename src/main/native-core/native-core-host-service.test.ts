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

function fakeClient() {
  return {
    executablePath: 'private-host-path.exe',
    health: vi.fn(async () => ({ pid: 12, engineInitialized: false })),
    startMixerTransport: vi.fn(async (sources: unknown[]) => ({
      transport: 'shared-memory-v1', format: 'f32-interleaved',
      ringName: 'Local\\ilyStream.Program.Audio.NativeMixer.00112233445566778899aabbccddeeff',
      generation: 42n, sampleRate: 48000, channels: 2,
      capacityFrames: 96256, blockFrames: 1024, sourceCount: sources.length
    })),
    mixerTransportStatus: vi.fn(async () => ({
      running: true, blocksMixed: 3, framesMixed: 3072, sourceUnderruns: 1, sourceFramesSkipped: 1024
    })),
    stopMixerTransport: vi.fn(async () => ({ running: false })),
    stop: vi.fn(async () => undefined)
  }
}

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
    vi.useRealTimers()
    if (previousHostFlag === undefined) delete process.env.ILYSTREAM_NATIVE_CORE_HOST
    else process.env.ILYSTREAM_NATIVE_CORE_HOST = previousHostFlag
    if (previousShadowFlag === undefined) delete process.env.ILYSTREAM_NATIVE_MIXER_AUDIO_SHADOW
    else process.env.ILYSTREAM_NATIVE_MIXER_AUDIO_SHADOW = previousShadowFlag
    if (previousAudioFlag === undefined) delete process.env.ILY_NATIVE_AUDIO
    else process.env.ILY_NATIVE_AUDIO = previousAudioFlag
  })

  it('does not contact a disabled host', async () => {
    delete process.env.ILYSTREAM_NATIVE_CORE_HOST
    const service = new NativeCoreHostService()
    expect(await service.getDiagnostics()).toMatchObject({
      mixerOutput: 'shadow-only', disabledReason: 'host-disabled', transport: null,
      host: { enabled: false, running: false }
    })
    expect(mocks.startClient).not.toHaveBeenCalled()
  })

  it('coalesces diagnostic requests and caches only redacted snapshots', async () => {
    const client = fakeClient()
    mocks.startClient.mockResolvedValue(client)
    const service = new NativeCoreHostService()
    await service.initialize()
    await service.configureMixerAudioShadow({ sourceIds: ['mic'] })
    let release!: (health: { pid: number; engineInitialized: boolean }) => void
    client.health.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    const first = service.getDiagnostics()
    const second = service.getDiagnostics()
    release({ pid: 12, engineInitialized: false })
    const [a, b] = await Promise.all([first, second])
    expect(a).toEqual(b)
    expect(a.transport).toMatchObject({ sourceUnderruns: 1, sourceFramesSkipped: 1024 })
    expect(client.health).toHaveBeenCalledTimes(2) // initialization + one coalesced read
    expect(client.mixerTransportStatus).toHaveBeenCalledOnce()
    expect(JSON.stringify(a)).not.toMatch(/private-host|ringName|generation|executablePath/)
    a.audio.comparedBlocks = 99
    expect((await service.getDiagnostics()).audio.comparedBlocks).toBe(0)
    expect(client.health).toHaveBeenCalledTimes(2)
    await service.dispose()
  })

  it.each(['health', 'mixerTransportStatus'] as const)('reports %s failures without leaking host errors', async method => {
    const client = fakeClient()
    mocks.startClient.mockResolvedValue(client)
    const service = new NativeCoreHostService()
    await service.initialize()
    await service.configureMixerAudioShadow({ sourceIds: ['mic'] })
    client[method].mockRejectedValueOnce(new Error('private path and mapping name'))
    const result = await service.getDiagnostics()
    expect(result.collectionError).toBe(method === 'health' ? 'host-unavailable' : 'transport-unavailable')
    expect(result.transport).toBeNull()
    expect(JSON.stringify(result)).not.toContain('private path')
    await service.dispose()
  })

  it('discards transport reads from a stopped audio session', async () => {
    const client = fakeClient()
    mocks.startClient.mockResolvedValue(client)
    const service = new NativeCoreHostService()
    await service.initialize()
    await service.configureMixerAudioShadow({ sourceIds: ['mic'] })
    let release!: (health: { pid: number; engineInitialized: boolean }) => void
    client.health.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    const pending = service.getDiagnostics()
    await service.stopMixerAudioShadow()
    release({ pid: 12, engineInitialized: false })
    expect(await pending).toMatchObject({ collectionError: 'session-changed', transport: null, audio: { active: false } })
    await service.dispose()
  })

  it('keeps audio counters for identical configuration but resets them for a new session', async () => {
    const client = fakeClient()
    mocks.startClient.mockResolvedValue(client)
    const service = new NativeCoreHostService()
    await service.initialize()
    await service.configureMixerAudioShadow({ sourceIds: ['mic'] })
    const data = new Uint8Array(NATIVE_MIXER_BLOCK_BYTES)
    service.pushMixerAudioShadowReference({ data, sampleRate: 48000, channels: 2 })
    mocks.readerCallback?.({ pcm: new Float32Array(2048).fill(1) })
    await service.configureMixerAudioShadow({ sourceIds: ['mic'] })
    expect(service.getStatus().mixerAudioShadow.mismatches).toBe(1)
    await service.configureMixerAudioShadow({ sourceIds: ['desktop'] })
    expect(service.getStatus().mixerAudioShadow).toMatchObject({ comparedBlocks: 0, mismatches: 0, lastComparedAt: null })
    await service.dispose()
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
