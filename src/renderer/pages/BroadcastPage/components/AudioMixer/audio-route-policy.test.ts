import { describe, expect, it } from 'vitest'
import type { AudioSource } from '../../../../../shared/studio'
import { normalizeAudioMonitoringMode } from '../../../../../shared/studio'
import {
  buildNativeMixerShadowSnapshot,
  getAudioRoutePolicy,
  getProgramSceneGain,
  hasAudibleCaptureSource,
  hasEligibleSolo,
  isAudioSourceEligible
} from './audio-route-policy'

function source(overrides: Partial<AudioSource> = {}): AudioSource {
  return {
    id: 'camera-one',
    name: 'Camera one',
    volume: 1,
    muted: false,
    monitoringMode: 'off',
    monitoring: false,
    solo: false,
    type: 'layer',
    channelMode: 'stereo',
    pan: 0,
    filters: [],
    ...overrides
  }
}

describe('audio route policy', () => {
  const activeLayerIds = new Set(['camera-one', 'active-mic'])

  it('never makes a persisted inactive-scene microphone eligible', () => {
    const inactiveMic = source({ id: 'old-mic', type: 'mic', deviceId: 'device-id' })

    expect(isAudioSourceEligible(inactiveMic, activeLayerIds)).toBe(false)
    expect(getAudioRoutePolicy(inactiveMic, activeLayerIds)).toMatchObject({
      eligible: false,
      output: false,
      monitor: false,
      programMonitor: false
    })
  })

  it('keeps only the explicit soundboard and TTS buses global', () => {
    const soundboard = source({ id: 'soundboard', type: 'media' })
    const tts = source({ id: 'tts-audio', type: 'media' })

    expect(isAudioSourceEligible(soundboard, new Set())).toBe(true)
    expect(isAudioSourceEligible(tts, new Set())).toBe(true)
    expect(getAudioRoutePolicy(soundboard, new Set()).output).toBe(true)
    expect(getAudioRoutePolicy(tts, new Set()).output).toBe(true)
    expect(isAudioSourceEligible(source({ id: 'desktop-audio', type: 'system' }), new Set())).toBe(false)
    expect(isAudioSourceEligible(source({ id: 'mic-audio', type: 'mic' }), new Set())).toBe(false)
  })

  it('keeps active desktop capture out of headphones by default', () => {
    const desktop = source({ id: 'desktop-layer', type: 'system', monitoringMode: undefined, monitoring: undefined })
    const policy = getAudioRoutePolicy(desktop, new Set(['desktop-layer']))

    expect(policy.output).toBe(true)
    expect(policy.monitor).toBe(false)
    expect(policy.monitoringMode).toBe('off')
  })

  it('implements all three monitoring modes without double monitoring', () => {
    expect(getAudioRoutePolicy(source({ monitoringMode: 'off' }), activeLayerIds)).toMatchObject({
      output: true,
      monitor: false,
      programMonitor: true
    })
    expect(getAudioRoutePolicy(source({ monitoringMode: 'monitorOnly' }), activeLayerIds)).toMatchObject({
      output: false,
      monitor: true,
      programMonitor: false
    })
    expect(getAudioRoutePolicy(source({ monitoringMode: 'monitorAndOutput' }), activeLayerIds)).toMatchObject({
      output: true,
      monitor: true,
      programMonitor: false
    })
  })

  it('migrates the old boolean while keeping missing monitoring off', () => {
    expect(normalizeAudioMonitoringMode(undefined, undefined)).toBe('off')
    expect(normalizeAudioMonitoringMode(undefined, false)).toBe('off')
    expect(normalizeAudioMonitoringMode(undefined, true)).toBe('monitorAndOutput')
    expect(normalizeAudioMonitoringMode('monitorOnly', false)).toBe('monitorOnly')
  })

  it('uses solo only among eligible live sources', () => {
    const active = source({ id: 'camera-one' })
    const activeSolo = source({ id: 'active-mic', type: 'mic', solo: true })
    const inactiveSolo = source({ id: 'old-mic', type: 'mic', solo: true })

    expect(hasEligibleSolo([active, inactiveSolo], activeLayerIds)).toBe(false)
    expect(hasEligibleSolo([active, activeSolo], activeLayerIds)).toBe(true)
    expect(getAudioRoutePolicy(active, activeLayerIds, true).output).toBe(false)
    expect(getAudioRoutePolicy(activeSolo, activeLayerIds, true).output).toBe(true)
  })

  it('never routes a muted source to output or headphones', () => {
    expect(getAudioRoutePolicy(source({
      muted: true,
      monitoringMode: 'monitorAndOutput'
    }), activeLayerIds)).toMatchObject({ output: false, monitor: false, programMonitor: false })
  })

  it('does not mistake idle internal buses for configured capture audio', () => {
    const internalOnly = [
      source({ id: 'soundboard', type: 'media' }),
      source({ id: 'tts-audio', type: 'media' })
    ]

    expect(hasAudibleCaptureSource(internalOnly, new Set())).toBe(false)
  })

  it('requires an active scene-owned source that actually reaches Program', () => {
    const activeMic = source({ id: 'active-mic', type: 'mic' })
    expect(hasAudibleCaptureSource([activeMic], activeLayerIds)).toBe(true)
    expect(hasAudibleCaptureSource([{ ...activeMic, muted: true }], activeLayerIds)).toBe(false)
    expect(hasAudibleCaptureSource([{ ...activeMic, monitoringMode: 'monitorOnly' }], activeLayerIds)).toBe(false)
    expect(hasAudibleCaptureSource([source({ id: 'old-mic', type: 'mic' })], activeLayerIds)).toBe(false)
  })

  it('keeps Preview prewarmed but closed, then switches Program atomically on CUT', () => {
    const programMic = source({ id: 'program-mic', type: 'mic' })
    const previewMic = source({ id: 'preview-mic', type: 'mic' })

    expect(getProgramSceneGain(programMic, new Set(['program-mic']))).toBe(1)
    expect(getProgramSceneGain(previewMic, new Set(['program-mic']))).toBe(0)
    expect(getProgramSceneGain(programMic, new Set(['preview-mic']))).toBe(0)
    expect(getProgramSceneGain(previewMic, new Set(['preview-mic']))).toBe(1)
  })

  it('crossfades unique scene audio while keeping shared tracks at unity', () => {
    const transition = {
      isActive: true,
      type: 'fade' as const,
      progress: 0.25,
      fromLayerIds: new Set(['from-mic', 'shared-mic']),
      toLayerIds: new Set(['to-mic', 'shared-mic'])
    }

    expect(getProgramSceneGain(source({ id: 'from-mic' }), new Set(), transition)).toBe(0.75)
    expect(getProgramSceneGain(source({ id: 'to-mic' }), new Set(), transition)).toBe(0.25)
    expect(getProgramSceneGain(source({ id: 'shared-mic' }), new Set(), transition)).toBe(1)
    expect(getProgramSceneGain(source({ id: 'preview-only' }), new Set(), transition)).toBe(0)
  })

  it('applies Solo independently to outgoing and incoming fade contributions', () => {
    const transition = {
      isActive: true,
      type: 'fade' as const,
      progress: 0.5,
      fromLayerIds: new Set(['outgoing']),
      toLayerIds: new Set(['incoming-solo', 'incoming-peer']),
      fromHasSolo: false,
      toHasSolo: true
    }

    expect(getProgramSceneGain(source({ id: 'outgoing' }), new Set(), transition)).toBe(0.5)
    expect(getProgramSceneGain(source({ id: 'incoming-solo', solo: true }), new Set(), transition)).toBe(0.5)
    expect(getProgramSceneGain(source({ id: 'incoming-peer' }), new Set(), transition)).toBe(0)
    expect(getProgramSceneGain(source({ id: 'incoming-peer' }), new Set(['incoming-peer']), undefined, true)).toBe(0)
  })

  it('builds a native shadow oracle from the same Program decisions', () => {
    const active = source({ id: 'active-mic', type: 'mic', volume: 0.8, channelMode: 'mono' })
    const monitorOnly = source({ id: 'camera-one', monitoringMode: 'monitorOnly' })
    const snapshot = buildNativeMixerShadowSnapshot(
      [active, monitorOnly],
      new Set(['active-mic', 'camera-one']),
      new Set(['active-mic', 'camera-one']),
      undefined,
      12
    )

    expect(snapshot.sequence).toBe(12)
    expect(snapshot.sources[0]).toMatchObject({ id: 'active-mic', volume: 0.8, mono: true })
    expect(snapshot.expected).toEqual([
      { id: 'active-mic', eligible: true, output: true, sceneGain: 1, effectiveGain: 0.8 },
      { id: 'camera-one', eligible: true, output: false, sceneGain: 1, effectiveGain: 0 }
    ])
  })
})
