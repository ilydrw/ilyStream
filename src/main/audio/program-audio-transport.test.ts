import { beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  start: vi.fn((options: any) => options),
  push: vi.fn<(pcm: Uint8Array, timestampNs: bigint) => boolean>(() => true),
  stop: vi.fn()
}))

vi.mock('./native-audio-capture', () => ({
  startProgramAudioTransport: native.start,
  pushProgramAudio: native.push,
  stopProgramAudioTransport: native.stop
}))

import { ProgramAudioTransport } from './program-audio-transport'

describe('ProgramAudioTransport', () => {
  beforeEach(() => {
    native.start.mockClear()
    native.push.mockClear()
    native.stop.mockClear()
  })

  it('creates a bounded, versioned 48 kHz stereo ring', () => {
    const transport = new ProgramAudioTransport(() => 10_000_000_000n)
    const descriptor = transport.start('7')

    expect(descriptor).toMatchObject({
      sampleRate: 48_000,
      channels: 2,
      format: 'f32-interleaved',
      capacityFrames: 96_000,
      blockFrames: 1_024,
      timestampTimebase: 'ns'
    })
    expect(descriptor.ringName).toMatch(/^Local\\ilyStream\.Program\.Audio\.[0-9a-f-]{36}$/)
    expect(native.start).toHaveBeenCalledWith(expect.objectContaining({ generation: 7n }))
  })

  it('maps the renderer sample clock onto the cross-process monotonic clock', () => {
    const times = [10_000_000_000n, 10_021_333_333n]
    const transport = new ProgramAudioTransport(() => times.shift()!)
    transport.start('1')
    const pcm = new Uint8Array(1_024 * 2 * 4)

    expect(transport.push({ data: pcm, timestamp: 0, sampleRate: 48_000, channels: 2 })).toBe(true)
    expect(transport.push({ data: pcm, timestamp: 21_333, sampleRate: 48_000, channels: 2 })).toBe(true)

    const firstTimestamp = native.push.mock.calls[0][1] as bigint
    const secondTimestamp = native.push.mock.calls[1][1] as bigint
    expect(firstTimestamp).toBe(9_978_666_667n)
    expect(secondTimestamp - firstTimestamp).toBe(21_333_000n)
  })

  it('rejects malformed blocks and stops the mapping on retirement', () => {
    const transport = new ProgramAudioTransport(() => 10_000_000_000n)
    expect(transport.push({ data: new Uint8Array(8), timestamp: 0 })).toBe(false)
    transport.start('2')
    expect(transport.push({ data: new Uint8Array(7), timestamp: 0 })).toBe(false)
    expect(native.push).not.toHaveBeenCalled()

    transport.stop()
    expect(native.stop).toHaveBeenCalledTimes(1)
    expect(transport.active).toBe(false)
  })

  it('rejects zero and out-of-range generations before touching native state', () => {
    const transport = new ProgramAudioTransport()
    expect(() => transport.start('0')).toThrow(/generation/i)
    expect(() => transport.start('18446744073709551616')).toThrow(/range/i)
    expect(native.start).not.toHaveBeenCalled()
  })
})
