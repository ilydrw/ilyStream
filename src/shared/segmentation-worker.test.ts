import { describe, expect, it } from 'vitest'
import {
  SEGMENTATION_INPUT_HEIGHT,
  SEGMENTATION_INPUT_WIDTH,
  floatMaskToAlpha,
  isSegmentationMask,
  normalizeSegmentationFrame
} from './segmentation-worker'

describe('normalizeSegmentationFrame', () => {
  it('accepts a well-formed RGBA frame', () => {
    const width = 2
    const height = 2
    const data = new Uint8Array(width * height * 4)
    const frame = normalizeSegmentationFrame({ width, height, data })
    expect(frame).toEqual({ width, height, data })
  })

  it('rejects non-integer or non-positive dimensions', () => {
    expect(() =>
      normalizeSegmentationFrame({ width: 0, height: 4, data: new Uint8Array(0) })
    ).toThrow('positive integer')
    expect(() =>
      normalizeSegmentationFrame({ width: 2.5, height: 4, data: new Uint8Array(40) })
    ).toThrow('positive integer')
  })

  it('rejects a data buffer that does not match the dimensions', () => {
    expect(() =>
      normalizeSegmentationFrame({ width: 4, height: 4, data: new Uint8Array(10) })
    ).toThrow('does not match')
  })

  it('rejects a non-Uint8Array payload', () => {
    expect(() =>
      normalizeSegmentationFrame({ width: 1, height: 1, data: [0, 0, 0, 0] as unknown })
    ).toThrow('Uint8Array')
  })

  it('validates the standard input size round-trips', () => {
    const data = new Uint8Array(SEGMENTATION_INPUT_WIDTH * SEGMENTATION_INPUT_HEIGHT * 4)
    const frame = normalizeSegmentationFrame({
      width: SEGMENTATION_INPUT_WIDTH,
      height: SEGMENTATION_INPUT_HEIGHT,
      data
    })
    expect(frame.width).toBe(SEGMENTATION_INPUT_WIDTH)
    expect(frame.height).toBe(SEGMENTATION_INPUT_HEIGHT)
  })
})

describe('isSegmentationMask', () => {
  it('accepts a matching alpha map', () => {
    expect(
      isSegmentationMask({ width: 2, height: 2, alpha: new Uint8Array(4) })
    ).toBe(true)
  })

  it('rejects a mismatched alpha length', () => {
    expect(
      isSegmentationMask({ width: 2, height: 2, alpha: new Uint8Array(3) })
    ).toBe(false)
  })

  it('rejects non-objects', () => {
    expect(isSegmentationMask(null)).toBe(false)
    expect(isSegmentationMask('mask')).toBe(false)
  })
})

describe('floatMaskToAlpha', () => {
  it('maps a [0,1] probability straight to 0..255', () => {
    const alpha = floatMaskToAlpha([0, 0.5, 1])
    expect(Array.from(alpha)).toEqual([0, 128, 255])
  })

  it('clamps out-of-range values', () => {
    const alpha = floatMaskToAlpha([-0.4, 1.9])
    expect(Array.from(alpha)).toEqual([0, 255])
  })

  it('applies a sigmoid when the output is a logit', () => {
    const alpha = floatMaskToAlpha([0], { applySigmoid: true })
    // sigmoid(0) = 0.5 -> 128
    expect(alpha[0]).toBe(128)
  })

  it('ramps the soft threshold band and clamps outside it', () => {
    const alpha = floatMaskToAlpha([0.1, 0.5, 0.9], { lower: 0.3, upper: 0.7 })
    // 0.1 below band -> 0, 0.5 mid -> 0.5 -> 128, 0.9 above band -> 255
    expect(alpha[0]).toBe(0)
    expect(alpha[1]).toBe(128)
    expect(alpha[2]).toBe(255)
  })
})
