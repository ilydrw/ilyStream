import { describe, expect, it } from 'vitest'
import { GeneratedAudioBuffer } from './generated-audio-buffer'

/**
 * This sits between two unrelated clocks in the live audio path, so its failure
 * modes are all audible: silence where TTS should be, a permanent latency
 * drift, or samples read back out of order as clicks.
 */
describe('GeneratedAudioBuffer', () => {
  const drain = (buffer: GeneratedAudioBuffer, count: number): number[] => {
    const out = new Float32Array(count)
    buffer.mixInto(out)
    return [...out]
  }

  it('returns pushed samples in order', () => {
    const buffer = new GeneratedAudioBuffer(16)
    buffer.push(new Float32Array([1, 2, 3, 4]))
    expect(drain(buffer, 4)).toEqual([1, 2, 3, 4])
  })

  it('adds into the destination rather than overwriting it', () => {
    // The destination holds captured mic audio; overwriting would mute the mic
    // for the length of every alert sound.
    const buffer = new GeneratedAudioBuffer(16)
    buffer.push(new Float32Array([0.5, 0.5]))
    const out = new Float32Array([0.25, -0.25])
    buffer.mixInto(out)
    expect([...out]).toEqual([0.75, 0.25])
  })

  it('substitutes silence when starved instead of stalling', () => {
    const buffer = new GeneratedAudioBuffer(16)
    buffer.push(new Float32Array([1, 1]))
    expect(drain(buffer, 4)).toEqual([1, 1, 0, 0])
    expect(buffer.starved).toBe(2)
  })

  it('leaves the destination untouched when empty', () => {
    const buffer = new GeneratedAudioBuffer(16)
    // Powers of two so the comparison is not fighting float32 rounding.
    const out = new Float32Array([0.25, -0.75])
    buffer.mixInto(out)
    expect([...out]).toEqual([0.25, -0.75])
  })

  it('consumes what it mixes', () => {
    const buffer = new GeneratedAudioBuffer(16)
    buffer.push(new Float32Array([1, 2, 3, 4]))
    drain(buffer, 2)
    expect(buffer.available).toBe(2)
    expect(drain(buffer, 2)).toEqual([3, 4])
  })

  it('wraps around the ring without reordering', () => {
    const buffer = new GeneratedAudioBuffer(4)
    buffer.push(new Float32Array([1, 2, 3]))
    drain(buffer, 3)
    buffer.push(new Float32Array([4, 5, 6]))
    expect(drain(buffer, 3)).toEqual([4, 5, 6])
  })

  it('drops the oldest on overflow so playback stays near-live', () => {
    const buffer = new GeneratedAudioBuffer(4)
    buffer.push(new Float32Array([1, 2, 3, 4]))
    buffer.push(new Float32Array([5, 6]))
    expect(buffer.dropped).toBe(2)
    expect(drain(buffer, 4)).toEqual([3, 4, 5, 6])
  })

  it('keeps only the tail when one push exceeds the whole ring', () => {
    const buffer = new GeneratedAudioBuffer(4)
    buffer.push(new Float32Array([1, 2, 3, 4, 5, 6]))
    expect(buffer.available).toBe(4)
    expect(drain(buffer, 4)).toEqual([3, 4, 5, 6])
  })

  it('counts samples already buffered as dropped when an oversized push clears them', () => {
    const buffer = new GeneratedAudioBuffer(4)
    buffer.push(new Float32Array([9, 9]))
    buffer.push(new Float32Array([1, 2, 3, 4, 5, 6]))
    // Two pre-existing plus the two trimmed from the head of the new block.
    expect(buffer.dropped).toBe(4)
  })

  it('discards buffered audio on clear', () => {
    const buffer = new GeneratedAudioBuffer(8)
    buffer.push(new Float32Array([1, 2, 3]))
    buffer.clear()
    expect(buffer.available).toBe(0)
    expect(drain(buffer, 2)).toEqual([0, 0])
  })
})
