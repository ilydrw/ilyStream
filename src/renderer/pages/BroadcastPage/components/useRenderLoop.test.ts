import { describe, expect, it } from 'vitest'
import type { CanvasStreamOutput } from './CanvasEditor.types'
import { shouldUseCanvasOutput } from './useRenderLoop'

function output(active = true): CanvasStreamOutput {
  return {
    id: 'vertical',
    active,
    width: 1080,
    height: 1920,
    fps: 60,
    bitrateKbps: 6_000,
    inputFormat: 'h264'
  }
}

describe('shouldUseCanvasOutput', () => {
  it('keeps canvas as the producer while the native output is unavailable', () => {
    expect(shouldUseCanvasOutput(output(), false)).toBe(true)
  })

  it('suppresses the canvas producer once the native output is active', () => {
    expect(shouldUseCanvasOutput(output(), true)).toBe(false)
  })

  it('does not produce frames for an inactive or missing output', () => {
    expect(shouldUseCanvasOutput(output(false), false)).toBe(false)
    expect(shouldUseCanvasOutput(undefined, false)).toBe(false)
  })
})
