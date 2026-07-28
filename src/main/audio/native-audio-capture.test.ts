import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getAppPath: () => 'C:/app' } }))

import { floatToPcm16 } from './native-audio-capture'

/**
 * The float->s16 conversion is the piece of the native capture path that fails
 * audibly rather than obviously: get the clamp or the scale wrong and it
 * distorts or clicks instead of going silent, which is far harder to notice
 * mid-stream than no audio at all.
 */
describe('floatToPcm16', () => {
  const decode = (buffer: Buffer): number[] => {
    const out: number[] = []
    for (let i = 0; i < buffer.length; i += 2) out.push(buffer.readInt16LE(i))
    return out
  }

  it('maps silence to zero', () => {
    expect(decode(floatToPcm16(new Float32Array([0, 0, 0])))).toEqual([0, 0, 0])
  })

  it('maps full scale to the int16 extremes', () => {
    expect(decode(floatToPcm16(new Float32Array([1, -1])))).toEqual([32767, -32768])
  })

  it('clamps beyond full scale instead of wrapping', () => {
    // Wrapping is the failure that matters: +1.5 becoming a large negative
    // number is a loud click, not a quiet clip.
    expect(decode(floatToPcm16(new Float32Array([1.5, -1.5, 99, -99])))).toEqual([
      32767, -32768, 32767, -32768
    ])
  })

  it('keeps mid-scale values proportional', () => {
    const [half, negHalf] = decode(floatToPcm16(new Float32Array([0.5, -0.5])))
    expect(half).toBeCloseTo(16384, -1)
    expect(negHalf).toBeCloseTo(-16384, -1)
  })

  it('emits two bytes per sample, preserving interleaved layout', () => {
    const stereo = new Float32Array([1, -1, 0, 0])
    const buffer = floatToPcm16(stereo)
    expect(buffer.length).toBe(stereo.length * 2)
    expect(decode(buffer)).toEqual([32767, -32768, 0, 0])
  })
})
