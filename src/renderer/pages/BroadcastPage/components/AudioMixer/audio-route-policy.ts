import type { AudioSource, AudioMonitoringMode } from '../../../../../shared/studio'
import { normalizeAudioMonitoringMode } from '../../../../../shared/studio'

const INTERNAL_GLOBAL_AUDIO_SOURCE_IDS = new Set(['soundboard', 'tts-audio'])

export interface AudioRoutePolicy {
  /** The source belongs to the live scene or is an explicit internal bus. */
  eligible: boolean
  /** Feed the encoded/recorded program mix. */
  output: boolean
  /** Feed this source directly to headphones. */
  monitor: boolean
  /** Include it in the optional whole-program headphone monitor. */
  programMonitor: boolean
  monitoringMode: AudioMonitoringMode
}

export interface ProgramSceneTransition {
  isActive: boolean
  type: 'fade' | 'stinger'
  progress: number
  fromLayerIds: ReadonlySet<string>
  toLayerIds: ReadonlySet<string>
  fromHasSolo?: boolean
  toHasSolo?: boolean
}

export function isGlobalInternalAudioSource(source: Pick<AudioSource, 'id'>): boolean {
  return INTERNAL_GLOBAL_AUDIO_SOURCE_IDS.has(source.id)
}

export function isAudioSourceEligible(
  source: Pick<AudioSource, 'id'>,
  activeLayerIds: ReadonlySet<string>
): boolean {
  return isGlobalInternalAudioSource(source) || activeLayerIds.has(source.id)
}

export function hasEligibleSolo(
  sources: readonly AudioSource[],
  activeLayerIds: ReadonlySet<string>
): boolean {
  return sources.some(source => isAudioSourceEligible(source, activeLayerIds) && source.solo === true)
}

/** True only when an active scene-owned capture source reaches Program. */
export function hasAudibleCaptureSource(
  sources: readonly AudioSource[],
  activeLayerIds: ReadonlySet<string>
): boolean {
  const anySolo = hasEligibleSolo(sources, activeLayerIds)
  return sources.some(source => (
    !isGlobalInternalAudioSource(source) &&
    source.volume > 0 &&
    getAudioRoutePolicy(source, activeLayerIds, anySolo).output
  ))
}

/**
 * Program ownership gate for a prewarmed mixer track. Preview sources stay
 * connected but silent until TAKE; fades crossfade their scene-owned gates.
 */
export function getProgramSceneGain(
  source: Pick<AudioSource, 'id' | 'solo'>,
  activeLayerIds: ReadonlySet<string>,
  transition?: ProgramSceneTransition,
  activeSceneHasSolo = false
): number {
  const isGlobal = isGlobalInternalAudioSource(source)
  const passesSolo = (sceneHasSolo: boolean | undefined) => !sceneHasSolo || source.solo === true

  if (transition?.isActive && transition.type === 'fade') {
    const progress = Math.min(1, Math.max(0, transition.progress))
    const inFrom = isGlobal || transition.fromLayerIds.has(source.id)
    const inTo = isGlobal || transition.toLayerIds.has(source.id)
    const fromGain = inFrom && passesSolo(transition.fromHasSolo) ? 1 - progress : 0
    const toGain = inTo && passesSolo(transition.toHasSolo) ? progress : 0
    return Math.min(1, fromGain + toGain)
  }

  return (isGlobal || activeLayerIds.has(source.id)) && passesSolo(activeSceneHasSolo) ? 1 : 0
}

/**
 * Resolve every live routing gate in one place. Keeping this pure prevents the
 * WebAudio hook and mixer UI from quietly developing different meanings for
 * monitoring, solo, and scene ownership.
 */
export function getAudioRoutePolicy(
  source: AudioSource,
  activeLayerIds: ReadonlySet<string>,
  anySolo = false
): AudioRoutePolicy {
  const eligible = isAudioSourceEligible(source, activeLayerIds)
  const monitoringMode = normalizeAudioMonitoringMode(source.monitoringMode, source.monitoring)
  const audible = eligible && !source.muted && (!anySolo || source.solo === true)
  const output = audible && monitoringMode !== 'monitorOnly'
  const monitor = eligible && !source.muted && monitoringMode !== 'off'

  return {
    eligible,
    output,
    monitor,
    // A source with its own monitor send must not also arrive through the
    // whole-program monitor or it would be heard twice.
    programMonitor: output && monitoringMode !== 'monitorAndOutput',
    monitoringMode
  }
}
