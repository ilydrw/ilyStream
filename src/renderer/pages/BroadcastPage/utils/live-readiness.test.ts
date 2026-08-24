import { describe, expect, it } from 'vitest'
import {
  buildLiveReadinessReport,
  createLiveReadinessDiagnosticReport,
  type BuildLiveReadinessInput
} from './live-readiness'

function readyInput(overrides: Partial<BuildLiveReadinessInput> = {}): BuildLiveReadinessInput {
  return {
    now: Date.parse('2026-07-25T12:00:00.000Z'),
    destinationNames: ['Twitch'],
    hasIncompleteCustomDestination: false,
    sceneName: 'Main',
    visibleVisualLayerCount: 2,
    mediaSources: [{
      id: 'camera',
      name: 'Camera',
      status: { code: 'live', label: 'Live', detail: 'Active' }
    }],
    hasAudioRoute: true,
    hasConfiguredAudio: true,
    masterMuted: false,
    audioContextState: 'running',
    online: true,
    system: {
      checkedAt: Date.parse('2026-07-25T11:59:59.000Z'),
      ffmpegAvailable: true,
      encoder: 'h264_nvenc',
      encoderKind: 'hardware',
      recordingWritable: true,
      recordingFreeBytes: 50 * 1024 * 1024 * 1024
    },
    isStreaming: false,
    outputs: [],
    ...overrides
  }
}

describe('buildLiveReadinessReport', () => {
  it('is ready when the destination, scene, capture, audio, encoder, storage, and network are ready', () => {
    const report = buildLiveReadinessReport(readyInput())
    expect(report.tone).toBe('ready')
    expect(report.blockerCount).toBe(0)
    expect(report.warningCount).toBe(0)
  })

  it('blocks definite failures before Go Live', () => {
    const report = buildLiveReadinessReport(readyInput({
      destinationNames: [],
      sceneName: 'Empty',
      visibleVisualLayerCount: 0,
      online: false,
      mediaSources: [{
        id: 'camera',
        name: 'Camera',
        status: { code: 'device-busy', label: 'Device busy', detail: 'Busy' }
      }]
    }))

    expect(report.tone).toBe('blocked')
    expect(report.blockerCount).toBe(3)
    expect(report.checks.filter(check => check.blocksGoLive && check.tone === 'blocked').map(check => check.id))
      .toEqual(['destination', 'scene', 'media'])
  })

  it('blocks assigning two layout encoders to the same destination', () => {
    const report = buildLiveReadinessReport(readyInput({
      duplicateDestinationNames: ['Twitch']
    }))

    expect(report.blockerCount).toBe(1)
    expect(report.checks.find(check => check.id === 'destination')?.summary)
      .toContain('multiple layouts')
  })

  it('warns without blocking for software encoding, low disk, and muted audio', () => {
    const report = buildLiveReadinessReport(readyInput({
      masterMuted: true,
      system: {
        checkedAt: Date.now(),
        ffmpegAvailable: true,
        encoder: 'libx264',
        encoderKind: 'software',
        recordingWritable: true,
        recordingFreeBytes: 512 * 1024 * 1024
      }
    }))

    expect(report.tone).toBe('warning')
    expect(report.blockerCount).toBe(0)
    expect(report.warningCount).toBe(3)
  })

  it('treats pending capture and encoder probes as checking, not hard failures', () => {
    const report = buildLiveReadinessReport(readyInput({
      mediaSources: [{ id: 'camera', name: 'Camera' }],
      system: null
    }))

    expect(report.tone).toBe('warning')
    expect(report.blockerCount).toBe(0)
    expect(report.checkingCount).toBe(3)
  })

  it('keeps a terminal destination failure visible while other outputs remain live', () => {
    const report = buildLiveReadinessReport(readyInput({
      isStreaming: true,
      destinationNames: ['Twitch', 'YouTube'],
      outputs: [{ id: 'horizontal:youtube', name: 'YouTube', state: 'live', degraded: false }],
      incidents: [{
        id: 'incident-1',
        outputId: 'horizontal:twitch',
        outputName: 'Twitch',
        kind: 'failed',
        at: Date.now(),
        message: 'Connection refused after retries'
      }]
    }))

    const outputs = report.checks.find(check => check.id === 'outputs')
    expect(outputs).toMatchObject({
      tone: 'blocked',
      blocksGoLive: false,
      summary: '1 destination stopped after reconnect attempts'
    })
    expect(outputs?.detail).toContain('Twitch')
  })

  it('reports connecting until an output confirms packets', () => {
    const report = buildLiveReadinessReport(readyInput({
      isStreaming: true,
      outputs: [{ id: 'horizontal:twitch', name: 'Twitch', state: 'starting', degraded: false }]
    }))

    expect(report.checks.find(check => check.id === 'outputs')).toMatchObject({
      tone: 'checking',
      summary: 'Connecting to destination ingest'
    })
  })
})

describe('createLiveReadinessDiagnosticReport', () => {
  it('contains operational state without accepting ingest credentials', () => {
    const report = buildLiveReadinessReport(readyInput())
    const diagnostic = createLiveReadinessDiagnosticReport(report, {
      sceneName: 'Main',
      destinationNames: ['Twitch'],
      system: readyInput().system,
      outputs: [],
      incidents: [{
        id: 'incident-1',
        outputId: 'horizontal:twitch',
        outputName: 'Twitch',
        kind: 'reconnecting',
        at: Date.parse('2026-07-25T12:00:01.000Z'),
        message: 'Connection interrupted',
        retry: 1
      }]
    })

    expect(diagnostic).toContain('"area": "broadcast-live-readiness"')
    expect(diagnostic).toContain('"destinations": [')
    expect(diagnostic).toContain('"kind": "reconnecting"')
    expect(diagnostic).not.toMatch(/streamKey|rtmpUrl|token|secret/i)
  })
})
