import type { StudioLayer } from './studio'

/**
 * CSS-filter color math shared with the native engine.
 *
 * Every color enhancement the canvas compositor applies via `ctx.filter`
 * (brightness/contrast/saturate/hue-rotate and the sepia/grayscale-based
 * filter presets) is a color-matrix primitive from the Filter Effects spec.
 * This module composes an enhancement chain into ONE 3x4 matrix plus an alpha
 * multiplier so the engine can apply the whole chain in a single shader step.
 * Skia concatenates adjacent color-matrix filters the same way (no clamping
 * between steps), so the composition matches what the canvas renders.
 */

/** Row-major 3x4 matrix (rows R,G,B; each row = mR,mG,mB,offset) + alpha. */
export interface ColorFilterMatrix {
  matrix: number[]
  alpha: number
}

interface FilterStep {
  /** Row-major 3x3 linear part. */
  m: number[]
  /** Per-row offset (from contrast's intercept). */
  o: [number, number, number]
  /** Alpha multiplier (from opacity() steps). */
  alpha: number
}

const step = (m: number[], o: [number, number, number] = [0, 0, 0], alpha = 1): FilterStep => ({ m, o, alpha })

function brightness(v: number): FilterStep {
  return step([v, 0, 0, 0, v, 0, 0, 0, v])
}

function contrast(v: number): FilterStep {
  const intercept = 0.5 - 0.5 * v
  return step([v, 0, 0, 0, v, 0, 0, 0, v], [intercept, intercept, intercept])
}

function saturate(s: number): FilterStep {
  return step([
    0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s
  ])
}

function grayscale(amount: number): FilterStep {
  const g = 1 - amount
  return step([
    0.2126 + 0.7874 * g, 0.7152 - 0.7152 * g, 0.0722 - 0.0722 * g,
    0.2126 - 0.2126 * g, 0.7152 + 0.2848 * g, 0.0722 - 0.0722 * g,
    0.2126 - 0.2126 * g, 0.7152 - 0.7152 * g, 0.0722 + 0.9278 * g
  ])
}

function sepia(amount: number): FilterStep {
  const s = 1 - amount
  return step([
    0.393 + 0.607 * s, 0.769 - 0.769 * s, 0.189 - 0.189 * s,
    0.349 - 0.349 * s, 0.686 + 0.314 * s, 0.168 - 0.168 * s,
    0.272 - 0.272 * s, 0.534 - 0.534 * s, 0.131 + 0.869 * s
  ])
}

function hueRotate(degrees: number): FilterStep {
  const radians = (degrees * Math.PI) / 180
  const c = Math.cos(radians)
  const s = Math.sin(radians)
  return step([
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072
  ])
}

function opacity(v: number): FilterStep {
  return step([1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, 0], v)
}

/**
 * Preset decompositions — must stay in sync with the canvas compositor's
 * getFilters() switch in useRenderLoop. Unknown presets are ignored, which is
 * also what the canvas switch does.
 */
const FILTER_PRESETS: Record<string, FilterStep[]> = {
  bw: [grayscale(1)],
  sepia: [sepia(1)],
  vintage: [sepia(0.5), hueRotate(-30), saturate(1.2), contrast(1.1)],
  vivid: [saturate(1.8), contrast(1.1)],
  kodachrome: [saturate(1.5), contrast(1.1), brightness(1.05)],
  polaroid: [sepia(0.2), saturate(1.4), contrast(1.2), brightness(1.1)],
  cold: [hueRotate(180), saturate(0.8)],
  warm: [sepia(0.3), saturate(1.2)],
  faded: [opacity(0.8), saturate(0.6), brightness(1.1)]
}

/** Apply `next` after `state` (CSS filter lists run left to right). */
function compose(state: FilterStep, next: FilterStep): FilterStep {
  const a = next.m
  const b = state.m
  const m = new Array<number>(9)
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      m[row * 3 + col] =
        a[row * 3] * b[col] +
        a[row * 3 + 1] * b[3 + col] +
        a[row * 3 + 2] * b[6 + col]
    }
  }
  const o: [number, number, number] = [0, 1, 2].map((row) =>
    a[row * 3] * state.o[0] +
    a[row * 3 + 1] * state.o[1] +
    a[row * 3 + 2] * state.o[2] +
    next.o[row]
  ) as [number, number, number]
  return { m, o, alpha: state.alpha * next.alpha }
}

const IDENTITY_EPSILON = 1e-6

function isIdentity(state: FilterStep): boolean {
  if (Math.abs(state.alpha - 1) > IDENTITY_EPSILON) return false
  for (let index = 0; index < 9; index += 1) {
    const expected = index % 4 === 0 ? 1 : 0
    if (Math.abs(state.m[index] - expected) > IDENTITY_EPSILON) return false
  }
  return state.o.every((offset) => Math.abs(offset) <= IDENTITY_EPSILON)
}

/**
 * Compose a layer's color enhancements into a single matrix, in the exact
 * order the canvas compositor builds its `ctx.filter` string: preset first,
 * then brightness, contrast, saturation, beauty's contrast half (its blur
 * half runs in the engine's blur pipeline), and temperature. Returns null
 * when the chain is a no-op (nothing set, or everything at its default).
 */
export function buildEnhancementColorMatrix(
  enhancements: StudioLayer['enhancements']
): ColorFilterMatrix | null {
  if (!enhancements) return null

  const steps: FilterStep[] = []
  if (enhancements.filterPreset && enhancements.filterPreset !== 'none') {
    steps.push(...(FILTER_PRESETS[enhancements.filterPreset] ?? []))
  }
  if (enhancements.brightness !== undefined) steps.push(brightness(enhancements.brightness / 100))
  if (enhancements.contrast !== undefined) steps.push(contrast(enhancements.contrast / 100))
  if (enhancements.saturation !== undefined) steps.push(saturate(enhancements.saturation / 100))
  if (enhancements.beauty && enhancements.beauty > 0) {
    // Canvas: contrast(100 + beauty/2 %) alongside the beauty blur.
    steps.push(contrast(1 + enhancements.beauty / 200))
  }
  if (enhancements.temperature !== undefined && enhancements.temperature !== 0) {
    steps.push(hueRotate(enhancements.temperature * 0.2))
  }
  if (steps.length === 0) return null

  const composed = steps.reduce(compose)
  if (isIdentity(composed)) return null
  if (![...composed.m, ...composed.o, composed.alpha].every(Number.isFinite)) return null

  return {
    matrix: [
      composed.m[0], composed.m[1], composed.m[2], composed.o[0],
      composed.m[3], composed.m[4], composed.m[5], composed.o[1],
      composed.m[6], composed.m[7], composed.m[8], composed.o[2]
    ],
    alpha: Math.max(0, Math.min(1, composed.alpha))
  }
}
