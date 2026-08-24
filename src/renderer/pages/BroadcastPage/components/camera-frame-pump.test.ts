import { describe, expect, it, vi } from 'vitest'
import { CameraFramePump, packTightRgba, type CameraFrameSourceSpec } from './camera-frame-pump'
import type { NativeLiveSourceFrame } from '../../../../shared/native-scene'

/** Drain all pending microtasks/macrotasks so the pump's async loop settles. */
async function settle(times = 4): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

interface FakeFrameOptions {
  width: number
  height: number
  /** copyTo row stride; defaults to tightly packed (width*4). */
  stride?: number
  /** Leading byte value written to the destination (row y, col x -> seed+y+x). */
  seed?: number
  /** Make copyTo reject. */
  throwOnCopy?: boolean
}

class FakeVideoFrame {
  readonly visibleRect: { width: number; height: number }
  closed = false
  private readonly stride: number
  private readonly seed: number
  private readonly throwOnCopy: boolean

  constructor(private readonly opts: FakeFrameOptions) {
    this.visibleRect = { width: opts.width, height: opts.height }
    this.stride = opts.stride ?? opts.width * 4
    this.seed = opts.seed ?? 0
    this.throwOnCopy = Boolean(opts.throwOnCopy)
  }

  allocationSize(): number {
    return this.stride * this.opts.height
  }

  async copyTo(destination: ArrayBufferView): Promise<Array<{ offset: number; stride: number }>> {
    if (this.throwOnCopy) throw new Error('copyTo unsupported')
    const bytes = new Uint8Array(destination.buffer, destination.byteOffset, destination.byteLength)
    const rowBytes = this.opts.width * 4
    for (let y = 0; y < this.opts.height; y += 1) {
      for (let x = 0; x < rowBytes; x += 1) {
        bytes[y * this.stride + x] = (this.seed + y + x) & 0xff
      }
    }
    return [{ offset: 0, stride: this.stride }]
  }

  close(): void {
    this.closed = true
  }
}

function fakeStream(frames: FakeVideoFrame[]) {
  let index = 0
  let cancelled = false
  return {
    cancelled: () => cancelled,
    readable: {
      getReader() {
        return {
          async read() {
            if (cancelled) return { done: true, value: undefined }
            if (index < frames.length) return { done: false, value: frames[index++] }
            // Park like a live track that hasn't produced its next frame yet —
            // real camera tracks don't end, so the pump keeps its claim.
            return new Promise<{ done: boolean; value?: FakeVideoFrame }>(() => {})
          },
          async cancel() {
            cancelled = true
          },
          releaseLock() {}
        }
      }
    }
  }
}

function spec(overrides: Partial<CameraFrameSourceSpec> = {}): CameraFrameSourceSpec {
  return {
    key: 'live:cam:640x360',
    track: {} as MediaStreamTrack,
    width: 640,
    height: 360,
    targetFps: 1000,
    ...overrides
  }
}

describe('packTightRgba', () => {
  it('passes through an already tightly-packed buffer without allocating', () => {
    const width = 3
    const height = 2
    const source = new Uint8Array(width * height * 4).map((_, i) => i & 0xff)
    const { pixels, packBuffer } = packTightRgba(source, [{ offset: 0, stride: width * 4 }], width, height, null)
    expect(pixels.byteLength).toBe(width * height * 4)
    expect(Array.from(pixels)).toEqual(Array.from(source))
    // No repack buffer allocated for the fast path.
    expect(packBuffer).toBeNull()
  })

  it('repacks a padded buffer to tightly-packed rows', () => {
    const width = 2
    const height = 2
    const rowBytes = width * 4 // 8
    const stride = 12 // 4 bytes of padding per row
    const source = new Uint8Array(stride * height)
    // Row 0 real bytes 1..8, row 1 real bytes 9..16; padding left as 0.
    for (let x = 0; x < rowBytes; x += 1) source[x] = x + 1
    for (let x = 0; x < rowBytes; x += 1) source[stride + x] = rowBytes + x + 1
    const { pixels } = packTightRgba(source, [{ offset: 0, stride }], width, height, null)
    expect(pixels.byteLength).toBe(rowBytes * height)
    expect(Array.from(pixels)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
  })

  it('honors a nonzero plane offset', () => {
    const width = 1
    const height = 1
    const source = new Uint8Array([99, 99, 1, 2, 3, 4])
    const { pixels } = packTightRgba(source, [{ offset: 2, stride: 4 }], width, height, null)
    expect(Array.from(pixels)).toEqual([1, 2, 3, 4])
  })
})

describe('CameraFramePump', () => {
  it('uploads matching frames as tightly-packed RGBA and marks the source handled', async () => {
    const uploads: NativeLiveSourceFrame[] = []
    let clock = 0
    const pump = new CameraFramePump({
      createProcessor: () => fakeStream([
        new FakeVideoFrame({ width: 640, height: 360, seed: 1 }),
        new FakeVideoFrame({ width: 640, height: 360, seed: 2 })
      ]),
      uploadFrame: async (frame) => {
        uploads.push({ ...frame, pixels: Uint8Array.from(frame.pixels) })
        return { ok: true }
      },
      now: () => (clock += 1000) // always past the throttle interval
    })

    pump.sync([spec()])
    await settle()

    expect(uploads).toHaveLength(2)
    expect(uploads[0].key).toBe('live:cam:640x360')
    expect(uploads[0].width).toBe(640)
    expect(uploads[0].height).toBe(360)
    expect(uploads[0].pixels.byteLength).toBe(640 * 360 * 4)
    // First pixel of the first frame follows the seed pattern (seed+y+x).
    expect(uploads[0].pixels[0]).toBe(1)
    expect(uploads[1].pixels[0]).toBe(2)
    expect(pump.isHandling('live:cam:640x360')).toBe(true)
  })

  it('throttles uploads to the target fps', async () => {
    const uploads: NativeLiveSourceFrame[] = []
    // Production now() is performance.now() — always large, so the first frame
    // clears the interval against lastUploadAt=0. Start high, advance 10ms/frame.
    let clock = 1_000_000
    const pump = new CameraFramePump({
      createProcessor: () => fakeStream([
        new FakeVideoFrame({ width: 640, height: 360 }),
        new FakeVideoFrame({ width: 640, height: 360 }),
        new FakeVideoFrame({ width: 640, height: 360 })
      ]),
      uploadFrame: async (frame) => {
        uploads.push(frame)
        return { ok: true }
      },
      // 30fps => 33.3ms interval. Only the first frame clears; +10ms/frame
      // keeps the next two inside the interval.
      now: () => (clock += 10)
    })

    pump.sync([spec({ targetFps: 30 })])
    await settle()

    expect(uploads).toHaveLength(1)
  })

  it('permanently falls back to the canvas path on a size mismatch', async () => {
    const uploads: NativeLiveSourceFrame[] = []
    const onWarn = vi.fn()
    const pump = new CameraFramePump({
      createProcessor: () => fakeStream([
        new FakeVideoFrame({ width: 1920, height: 1080 }) // != 640x360 texture
      ]),
      uploadFrame: async (frame) => {
        uploads.push(frame)
        return { ok: true }
      },
      now: () => 1_000_000,
      onWarn
    })

    pump.sync([spec()])
    await settle()

    expect(uploads).toHaveLength(0)
    expect(pump.isHandling('live:cam:640x360')).toBe(false)
    expect(onWarn).toHaveBeenCalledWith('live:cam:640x360', expect.stringContaining('canvas upload'))
  })

  it('falls back when copyTo throws', async () => {
    const onWarn = vi.fn()
    const pump = new CameraFramePump({
      createProcessor: () => fakeStream([
        new FakeVideoFrame({ width: 640, height: 360, throwOnCopy: true })
      ]),
      uploadFrame: async () => ({ ok: true }),
      now: () => 1_000_000,
      onWarn
    })

    pump.sync([spec()])
    await settle()

    expect(pump.isHandling('live:cam:640x360')).toBe(false)
    expect(onWarn).toHaveBeenCalled()
  })

  it('does not claim a source when the processor is unavailable', async () => {
    const pump = new CameraFramePump({
      createProcessor: () => null,
      uploadFrame: async () => ({ ok: true }),
      now: () => 1_000_000
    })

    pump.sync([spec()])
    await settle()

    expect(pump.isHandling('live:cam:640x360')).toBe(false)
  })

  it('cancels the reader when a source is removed', async () => {
    const stream = fakeStream([new FakeVideoFrame({ width: 640, height: 360 })])
    const pump = new CameraFramePump({
      createProcessor: () => stream,
      uploadFrame: async () => ({ ok: true }),
      now: () => 1_000_000
    })

    pump.sync([spec()])
    await settle()
    pump.sync([]) // source gone
    await settle()

    expect(stream.cancelled()).toBe(true)
    expect(pump.isHandling('live:cam:640x360')).toBe(false)
  })

  it('rebuilds the pump when the track is swapped (device change)', async () => {
    const created: MediaStreamTrack[] = []
    const trackA = { id: 'a' } as unknown as MediaStreamTrack
    const trackB = { id: 'b' } as unknown as MediaStreamTrack
    const pump = new CameraFramePump({
      createProcessor: (track) => {
        created.push(track)
        return fakeStream([new FakeVideoFrame({ width: 640, height: 360 })])
      },
      uploadFrame: async () => ({ ok: true }),
      now: () => 1_000_000
    })

    pump.sync([spec({ track: trackA })])
    await settle()
    pump.sync([spec({ track: trackB })])
    await settle()

    expect(created).toEqual([trackA, trackB])
  })

  it('stops all read loops on dispose', async () => {
    const stream = fakeStream([new FakeVideoFrame({ width: 640, height: 360 })])
    const pump = new CameraFramePump({
      createProcessor: () => stream,
      uploadFrame: async () => ({ ok: true }),
      now: () => 1_000_000
    })

    pump.sync([spec()])
    await settle()
    pump.dispose()
    await settle()

    expect(stream.cancelled()).toBe(true)
    expect(pump.isHandling('live:cam:640x360')).toBe(false)
  })
})
