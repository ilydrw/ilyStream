import { Duplex } from 'stream'
import { describe, expect, it, vi } from 'vitest'
import {
  JsonLineRpcClient,
  parseNativeMixerTransportStatus,
  parseNativeMixerProgramTransport,
  parseSharedCaptureTransport
} from './native-core-host-client'

vi.mock('electron', () => ({ app: { getAppPath: () => process.cwd() } }))

class FakeSocket extends Duplex {
  writes: string[] = []

  _read(): void {}

  _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.writes.push(chunk.toString())
    callback()
  }

  respond(payload: unknown, splitAt?: number): void {
    const line = `${JSON.stringify(payload)}\n`
    if (splitAt) {
      this.push(line.slice(0, splitAt))
      this.push(line.slice(splitAt))
    } else {
      this.push(line)
    }
  }
}

describe('JsonLineRpcClient', () => {
  it('expires diagnostic reads, ignores late responses, and clears completed timers', async () => {
    vi.useFakeTimers()
    const socket = new FakeSocket()
    const client = new JsonLineRpcClient(socket as any)
    try {
      const pending = client.request('health', {}, {}, 2_000)
      const rejected = expect(pending).rejects.toThrow('timed out')
      await vi.advanceTimersByTimeAsync(2_000)
      await rejected
      socket.respond({ id: 1, ok: true, result: 'late' })
      const fresh = client.request('health', {}, {}, 2_000)
      socket.respond({ id: 2, ok: true, result: 'fresh' })
      await expect(fresh).resolves.toBe('fresh')
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      client.destroy()
      vi.useRealTimers()
    }
  })

  it('correlates split responses with their requests', async () => {
    const socket = new FakeSocket()
    const client = new JsonLineRpcClient(socket as any)
    const pending = client.request('health')
    const request = JSON.parse(socket.writes[0])
    socket.respond({ id: request.id, ok: true, result: { healthy: true } }, 8)
    await expect(pending).resolves.toEqual({ healthy: true })
  })

  it('rejects host errors and oversized requests', async () => {
    const socket = new FakeSocket()
    const client = new JsonLineRpcClient(socket as any)
    const pending = client.request('engine.initialize')
    const request = JSON.parse(socket.writes[0])
    socket.respond({ id: request.id, ok: false, error: 'denied' })
    await expect(pending).rejects.toThrow('denied')
    await expect(client.request('large', { value: 'x'.repeat(70_000) })).rejects.toThrow('too large')
  })
})

describe('parseNativeMixerTransportStatus', () => {
  const valid = { running: true, blocksMixed: 2, framesMixed: 2048, sourceUnderruns: 0, sourceFramesSkipped: 0 }
  it('keeps only transport counters and rejects invalid telemetry', () => {
    expect(parseNativeMixerTransportStatus({ ...valid, ringName: 'private' })).toEqual(valid)
    for (const value of [-1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '2']) {
      expect(() => parseNativeMixerTransportStatus({ ...valid, sourceUnderruns: value })).toThrow('Invalid')
    }
    expect(() => parseNativeMixerTransportStatus({ ...valid, running: 'true' })).toThrow('Invalid')
  })

  it('accepts bounded optional master DSP telemetry', () => {
    const masterDsp = {
      enabled: true, processedFrames: 2048, clippedFrames: 0,
      maxInputPeak: 0.8, maxOutputPeak: 0.7, maxGainReductionDb: 2.5
    }
    expect(parseNativeMixerTransportStatus({ ...valid, masterDsp }).masterDsp).toEqual(masterDsp)
    expect(() => parseNativeMixerTransportStatus({ ...valid, masterDsp: {
      ...masterDsp, maxOutputPeak: -1
    } })).toThrow('Invalid')
    expect(() => parseNativeMixerTransportStatus({ ...valid, masterDsp: {
      ...masterDsp, processedFrames: 2, clippedFrames: 3
    } })).toThrow('Invalid')
    expect(() => parseNativeMixerTransportStatus({ ...valid, masterDsp: {
      ...masterDsp, maxGainReductionDb: 121
    } })).toThrow('Invalid')
  })
})

describe('parseSharedCaptureTransport', () => {
  const valid = {
    transport: 'shared-memory-v1',
    format: 'f32-interleaved',
    ringName: 'Local\\ilyStream.Capture.Audio.00112233445566778899aabbccddeeff',
    generation: '42',
    sampleRate: 48000,
    channels: 2,
    exclusive: false,
    chunkFrames: 1024,
    blockFrames: 1024,
    capacityFrames: 96256
  }

  it('validates and converts a host descriptor', () => {
    expect(parseSharedCaptureTransport(valid)).toEqual({ ...valid, generation: 42n })
  })

  it('rejects untrusted mapping names and oversized layouts', () => {
    expect(() => parseSharedCaptureTransport({ ...valid, ringName: 'Global\\attacker' })).toThrow('invalid')
    expect(() => parseSharedCaptureTransport({ ...valid, capacityFrames: 999999 })).toThrow('invalid')
    expect(() => parseSharedCaptureTransport({ ...valid, generation: '18446744073709551616' })).toThrow('invalid')
  })
})

describe('parseNativeMixerProgramTransport', () => {
  const valid = {
    transport: 'shared-memory-v1',
    format: 'f32-interleaved',
    ringName: 'Local\\ilyStream.Program.Audio.NativeMixer.00112233445566778899aabbccddeeff',
    generation: '42',
    sampleRate: 48000,
    channels: 2,
    capacityFrames: 96256,
    blockFrames: 1024,
    sourceCount: 2
  }

  it('accepts only the host-owned native mixer output layout', () => {
    expect(parseNativeMixerProgramTransport(valid)).toEqual({ ...valid, generation: 42n })
    expect(() => parseNativeMixerProgramTransport({ ...valid, ringName: 'Local\\ilyStream.Capture.Audio.bad' })).toThrow('invalid')
    expect(() => parseNativeMixerProgramTransport({ ...valid, sourceCount: 65 })).toThrow('invalid')
  })
})
