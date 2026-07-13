import { describe, expect, it, vi } from 'vitest'
import {
  applyDestinationOutputCaps,
  clampBroadcastBitrateKbps,
  clampBroadcastFps,
  fitRect,
  formatDuration,
  fullStageRect,
  getAspectRatioForLayoutMode,
  getLayoutModeForAspectRatio,
  normalizeVirtualCameraFeed,
  usesTwitchIngest
} from './broadcast-page-utils'

describe('broadcast page utilities', () => {
  it('formats bounded recording durations', () => {
    expect(formatDuration(-3)).toBe('0:00')
    expect(formatDuration(65.9)).toBe('1:05')
    expect(formatDuration(3_661)).toBe('1:01:01')
  })

  it('clamps broadcast output settings to supported ranges', () => {
    expect(clampBroadcastFps(0)).toBe(1)
    expect(clampBroadcastFps(120)).toBe(60)
    expect(clampBroadcastBitrateKbps(100)).toBe(500)
    expect(clampBroadcastBitrateKbps(99_000)).toBe(51_000)
  })

  it('recognizes Twitch destinations and applies safe output caps', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(usesTwitchIngest({ platform: { id: 'TWITCH' } })).toBe(true)
    expect(usesTwitchIngest({ platform: { url: 'rtmp://live.twitch.tv/app' } })).toBe(true)
    expect(usesTwitchIngest({ platform: { id: 'youtube' } })).toBe(false)
    expect(applyDestinationOutputCaps(
      { fps: 60, bitrateKbps: 8_000 },
      [{ platform: { id: 'twitch' } }]
    )).toEqual({ fps: 30, bitrateKbps: 4_500 })
    warn.mockRestore()
  })

  it('preserves output settings when Twitch is not selected', () => {
    const config = { fps: 60, bitrateKbps: 8_000 }
    expect(applyDestinationOutputCaps(config, [{ platform: { id: 'youtube' } }])).toBe(config)
  })

  it('normalizes persisted virtual-camera preferences', () => {
    expect(normalizeVirtualCameraFeed(null)).toEqual({
      mode: 'layout',
      layout: 'current',
      sourceFitMode: 'cover'
    })
    expect(normalizeVirtualCameraFeed({
      mode: 'source',
      layout: 'portrait',
      sourceFitMode: 'contain',
      sourceLayerId: 'camera-1'
    })).toEqual({
      mode: 'source',
      layout: 'portrait',
      sourceFitMode: 'contain',
      sourceLayerId: 'camera-1'
    })
  })

  it('maps aspect ratios and calculates centered stage rectangles', () => {
    expect(getLayoutModeForAspectRatio('9:16')).toBe('vertical')
    expect(getAspectRatioForLayoutMode('dual-portrait')).toBe('9:16')
    expect(getAspectRatioForLayoutMode('horizontal')).toBe('16:9')
    expect(fullStageRect({ width: 1920, height: 1080 })).toEqual({ x: 0, y: 0, width: 1920, height: 1080 })
    expect(fitRect({ width: 1920, height: 1080 }, 1280, 720, 1)).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080
    })
  })
})
