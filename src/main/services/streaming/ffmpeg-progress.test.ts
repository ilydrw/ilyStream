import { describe, expect, it } from 'vitest'
import { scanFfmpegProgress } from './ffmpeg-progress'

describe('scanFfmpegProgress', () => {
  it('does not treat process diagnostics as a connected output', () => {
    const result = scanFfmpegProgress('', 'Opening rtmp://example/live for writing\n')

    expect(result.connected).toBe(false)
    expect(result.diagnosticText).toContain('Opening rtmp://example/live')
  })

  it('detects a completed progress block split across chunks', () => {
    const first = scanFfmpegProgress('', 'frame=4\nout_time_ms=1000\nprogr')
    const second = scanFfmpegProgress(first.buffer, 'ess=continue\n')

    expect(first.connected).toBe(false)
    expect(second.connected).toBe(true)
    expect(second.diagnosticText).toBe('')
  })

  it('does not report connected for FFmpeg\'s initial zero-output block', () => {
    const result = scanFfmpegProgress('', 'frame=0\ntotal_size=0\nout_time=N/A\nprogress=continue\n')

    expect(result.connected).toBe(false)
    expect(result.buffer).toBe('')
    expect(result.diagnosticText).toBe('')
  })

  it('reports connected once a later progress block contains output evidence', () => {
    const initial = scanFfmpegProgress('', 'frame=0\ntotal_size=0\nprogress=continue\n')
    const output = scanFfmpegProgress(initial.buffer, 'frame=1\ntotal_size=4096\nprogress=continue\n')

    expect(initial.connected).toBe(false)
    expect(output.connected).toBe(true)
  })

  it('removes complete machine-progress lines from operator diagnostics', () => {
    const result = scanFfmpegProgress('', 'frame=12\nprogress=continue\nnetwork warning\n')

    expect(result.connected).toBe(true)
    expect(result.diagnosticText).toBe('network warning')
  })

  it('retains split diagnostic lines without leaking protocol fragments', () => {
    const first = scanFfmpegProgress('', 'network warn')
    const second = scanFfmpegProgress(first.buffer, 'ing\nframe=2\nprogr')
    const third = scanFfmpegProgress(second.buffer, 'ess=continue\n')

    expect(first.diagnosticText).toBe('')
    expect(second.diagnosticText).toBe('network warning')
    expect(third.connected).toBe(true)
    expect(third.diagnosticText).toBe('')
  })
})
