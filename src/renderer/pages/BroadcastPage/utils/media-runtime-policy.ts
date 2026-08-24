import type { StudioLayer, StudioScene } from '../../../../shared/studio'

export interface RetainedMediaLayer {
  sceneId: string
  layer: StudioLayer
  role: 'program' | 'preview'
}

export type RequiredMediaTrackKind = 'video' | 'audio'

function isManagedMediaLayer(layer: StudioLayer): boolean {
  return layer.type === 'camera' || layer.type === 'display' || layer.type === 'audio'
}

/**
 * Program always owns a lease. Studio Preview owns a second lease so TAKE can
 * switch atomically without opening cameras, microphones, or displays mid-cut.
 */
export function collectRetainedMediaLayers(
  programScene: StudioScene,
  previewScene?: StudioScene,
  retainPreview = false
): RetainedMediaLayer[] {
  const retained: RetainedMediaLayer[] = []
  const layerIds = new Set<string>()

  const append = (scene: StudioScene, role: RetainedMediaLayer['role']) => {
    for (const layer of scene.layers) {
      if (!isManagedMediaLayer(layer) || layerIds.has(layer.id)) continue
      layerIds.add(layer.id)
      retained.push({ sceneId: scene.id, layer, role })
    }
  }

  append(programScene, 'program')
  if (retainPreview && previewScene && previewScene.id !== programScene.id) {
    append(previewScene, 'preview')
  }

  return retained
}

export function mediaStreamIsReusable(
  stream: MediaStream | null | undefined,
  requiredTracks: RequiredMediaTrackKind | readonly RequiredMediaTrackKind[]
): boolean {
  if (!stream) return false
  const requirements = Array.isArray(requiredTracks) ? requiredTracks : [requiredTracks]
  return requirements.every(requiredTrack => {
    const tracks = requiredTrack === 'video' ? stream.getVideoTracks() : stream.getAudioTracks()
    return tracks.some(track => track.readyState === 'live')
  })
}

/** Track kinds that must remain live for a retained source to be reusable. */
export function getRequiredMediaTrackKinds(
  layer: StudioLayer,
  resolvedCameraAudioDeviceId?: string
): readonly RequiredMediaTrackKind[] {
  if (layer.type === 'audio') return ['audio']
  if (layer.type === 'display') {
    return layer.config.captureAudio === true ? ['video', 'audio'] : ['video']
  }
  if (layer.type === 'camera') {
    return resolvedCameraAudioDeviceId ? ['video', 'audio'] : ['video']
  }
  return []
}
