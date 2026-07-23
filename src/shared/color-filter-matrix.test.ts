import { describe, expect, it } from 'vitest'
import { buildEnhancementColorMatrix } from './color-filter-matrix'

/** Apply a 3x4 matrix the way the sprite shader does (straight alpha). */
function apply(matrix: number[], rgb: [number, number, number]): [number, number, number] {
  const out = [0, 1, 2].map((row) =>
    matrix[row * 4] * rgb[0] +
    matrix[row * 4 + 1] * rgb[1] +
    matrix[row * 4 + 2] * rgb[2] +
    matrix[row * 4 + 3]
  )
  return out.map((v) => Math.max(0, Math.min(1, v))) as [number, number, number]
}

describe('buildEnhancementColorMatrix', () => {
  it('returns null for missing, empty, and all-default enhancement chains', () => {
    expect(buildEnhancementColorMatrix(undefined)).toBeNull()
    expect(buildEnhancementColorMatrix({})).toBeNull()
    expect(buildEnhancementColorMatrix({
      brightness: 100,
      contrast: 100,
      saturation: 100,
      temperature: 0,
      filterPreset: 'none'
    })).toBeNull()
  })

  it('scales channels for brightness (CSS brightness())', () => {
    const result = buildEnhancementColorMatrix({ brightness: 50 })
    expect(result).not.toBeNull()
    expect(apply(result!.matrix, [1, 0.5, 0])).toEqual([0.5, 0.25, 0])
    expect(result!.alpha).toBe(1)
  })

  it('pivots around mid gray for contrast (CSS contrast())', () => {
    const result = buildEnhancementColorMatrix({ contrast: 200 })
    const [r, g, b] = apply(result!.matrix, [0.75, 0.5, 0.25])
    expect(r).toBeCloseTo(1, 5)
    expect(g).toBeCloseTo(0.5, 5)
    expect(b).toBeCloseTo(0, 5)
  })

  it('desaturates to the spec luma weights (CSS saturate(0))', () => {
    const result = buildEnhancementColorMatrix({ saturation: 0 })
    const [r, g, b] = apply(result!.matrix, [1, 0, 0])
    expect(r).toBeCloseTo(0.213, 5)
    expect(g).toBeCloseTo(0.213, 5)
    expect(b).toBeCloseTo(0.213, 5)
  })

  it('maps temperature to hue-rotate at 0.2 degrees per unit', () => {
    // hue-rotate(360deg) is identity, so temperature 1800 * 0.2 = 360.
    const spun = buildEnhancementColorMatrix({ temperature: 1800 })
    expect(spun).toBeNull()

    const nudged = buildEnhancementColorMatrix({ temperature: 25 })
    expect(nudged).not.toBeNull()
    const [r, g, b] = apply(nudged!.matrix, [0.2, 0.4, 0.8])
    // Hue rotation preserves luma (only approximately — the spec's matrix
    // constants are rounded to three decimals).
    const luma = (rgb: [number, number, number]) =>
      0.213 * rgb[0] + 0.715 * rgb[1] + 0.072 * rgb[2]
    expect(luma([r, g, b])).toBeCloseTo(luma([0.2, 0.4, 0.8]), 4)
  })

  it('decomposes presets to their canvas filter chains', () => {
    // bw = grayscale(100%): pure red becomes the 0.2126 spec luma everywhere.
    const bw = buildEnhancementColorMatrix({ filterPreset: 'bw' })
    const [r, g, b] = apply(bw!.matrix, [1, 0, 0])
    expect(r).toBeCloseTo(0.2126, 5)
    expect(g).toBeCloseTo(0.2126, 5)
    expect(b).toBeCloseTo(0.2126, 5)

    // faded starts with opacity(80%), the only alpha-affecting step in use.
    expect(buildEnhancementColorMatrix({ filterPreset: 'faded' })!.alpha).toBeCloseTo(0.8, 5)
    expect(buildEnhancementColorMatrix({ filterPreset: 'vivid' })!.alpha).toBe(1)

    // Unknown presets are ignored, matching the canvas getFilters() switch.
    expect(buildEnhancementColorMatrix({ filterPreset: 'not-a-preset' })).toBeNull()
  })

  it("folds beauty's contrast half into the matrix (blur half runs in the engine)", () => {
    // beauty 40 -> contrast(120%): slope 1.2, pivot at mid gray.
    const result = buildEnhancementColorMatrix({ beauty: 40 })
    expect(result).not.toBeNull()
    const [r, g] = apply(result!.matrix, [0.75, 0.5, 0.25])
    expect(r).toBeCloseTo(0.5 + 0.25 * 1.2, 5)
    expect(g).toBeCloseTo(0.5, 5)
    // beauty 0 contributes nothing.
    expect(buildEnhancementColorMatrix({ beauty: 0 })).toBeNull()
  })

  it('composes steps left to right like a CSS filter list', () => {
    // brightness(50%) then contrast(200%): 1.0 -> 0.5 -> 0.5 (the pivot),
    // whereas the reverse order would give 1.0 -> 1.0 -> 0.5... -> distinct.
    const result = buildEnhancementColorMatrix({ brightness: 50, contrast: 200 })
    const [r] = apply(result!.matrix, [1, 1, 1])
    expect(r).toBeCloseTo(0.5, 5)

    // Composition must match applying the steps one at a time.
    const separate = apply(
      buildEnhancementColorMatrix({ contrast: 130 })!.matrix,
      apply(buildEnhancementColorMatrix({ brightness: 80 })!.matrix, [0.6, 0.3, 0.9])
    )
    const composed = apply(
      buildEnhancementColorMatrix({ brightness: 80, contrast: 130 })!.matrix,
      [0.6, 0.3, 0.9]
    )
    composed.forEach((channel, index) => expect(channel).toBeCloseTo(separate[index], 5))
  })
})
