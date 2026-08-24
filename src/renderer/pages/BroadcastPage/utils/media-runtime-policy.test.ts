import { describe, expect, it } from 'vitest'
import type { StudioLayer, StudioScene } from '../../../../shared/studio'
import {
  collectRetainedMediaLayers,
  getRequiredMediaTrackKinds,
  mediaStreamIsReusable
} from './media-runtime-policy'

function layer(id: string, type: StudioLayer['type']): StudioLayer {
  return {
    id,
    name: id,
    type,
    zIndex: 0,
    visible: true,
    locked: false,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
    portraitX: 0,
    portraitY: 0,
    portraitWidth: 100,
    portraitHeight: 100,
    portraitVisible: true,
    portraitLocked: false,
    config: {}
  }
}

function scene(id: string, layers: StudioLayer[]): StudioScene {
  return { id, name: id, layers }
}

describe('collectRetainedMediaLayers', () => {
  it('retains Program media and ignores non-media layers', () => {
    const retained = collectRetainedMediaLayers(scene('program', [
      layer('camera', 'camera'),
      layer('title', 'text'),
      layer('mic', 'audio')
    ]))

    expect(retained.map(entry => [entry.sceneId, entry.layer.id, entry.role])).toEqual([
      ['program', 'camera', 'program'],
      ['program', 'mic', 'program']
    ])
  })

  it('prewarms selected Preview media without duplicating a shared layer id', () => {
    const retained = collectRetainedMediaLayers(
      scene('program', [layer('shared-camera', 'camera')]),
      scene('preview', [layer('shared-camera', 'camera'), layer('guest-camera', 'camera')]),
      true
    )

    expect(retained.map(entry => [entry.layer.id, entry.role])).toEqual([
      ['shared-camera', 'program'],
      ['guest-camera', 'preview']
    ])
  })

  it('does not retain Preview when Studio Mode is off', () => {
    const retained = collectRetainedMediaLayers(
      scene('program', [layer('program-camera', 'camera')]),
      scene('preview', [layer('preview-camera', 'camera')]),
      false
    )

    expect(retained.map(entry => entry.layer.id)).toEqual(['program-camera'])
  })
})

describe('mediaStreamIsReusable', () => {
  it('requires a live track of the requested media kind', () => {
    const stream = {
      getVideoTracks: () => [{ readyState: 'ended' }],
      getAudioTracks: () => [{ readyState: 'live' }]
    } as unknown as MediaStream

    expect(mediaStreamIsReusable(stream, 'video')).toBe(false)
    expect(mediaStreamIsReusable(stream, 'audio')).toBe(true)
    expect(mediaStreamIsReusable(null, 'video')).toBe(false)
  })

  it('rejects camera/display reuse when requested audio ended but video is still live', () => {
    const stream = {
      getVideoTracks: () => [{ readyState: 'live' }],
      getAudioTracks: () => [{ readyState: 'ended' }]
    } as unknown as MediaStream
    const camera = { ...layer('camera', 'camera'), config: { audioDeviceId: 'capture-audio' } }
    const display = { ...layer('display', 'display'), config: { captureAudio: true } }

    expect(mediaStreamIsReusable(stream, getRequiredMediaTrackKinds(camera, 'capture-audio'))).toBe(false)
    expect(mediaStreamIsReusable(stream, getRequiredMediaTrackKinds(display))).toBe(false)
    expect(mediaStreamIsReusable(stream, getRequiredMediaTrackKinds(layer('silent-camera', 'camera')))).toBe(true)
  })
})
