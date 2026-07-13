import { describe, expect, it } from 'vitest'
import type { StudioLayer } from '../../../../shared/studio'
import {
  classifyMediaSourceError,
  isTransientMediaError,
  shouldInitializeLayerMedia
} from './media-init'

function createLayer(overrides: Partial<StudioLayer> = {}): StudioLayer {
  return {
    id: 'camera-1',
    type: 'camera',
    name: 'Camera',
    zIndex: 0,
    opacity: 1,
    config: {},
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
    visible: true,
    locked: false,
    portraitX: 0,
    portraitY: 0,
    portraitWidth: 1080,
    portraitHeight: 1920,
    portraitVisible: true,
    portraitLocked: false,
    ...overrides
  }
}

function mediaError(name: string, message: string): Error {
  const error = new Error(message)
  error.name = name
  return error
}

describe('media source diagnostics', () => {
  it('does not open a camera hidden in every active layout', () => {
    const layer = createLayer({ visible: false, portraitVisible: true })

    expect(shouldInitializeLayerMedia(layer, ['16:9'])).toBe(false)
    expect(shouldInitializeLayerMedia(layer, ['9:16'])).toBe(true)
    expect(shouldInitializeLayerMedia(layer, ['16:9', '9:16'])).toBe(true)
  })

  it('keeps audio active regardless of layout visibility', () => {
    const layer = createLayer({ type: 'audio', visible: false, portraitVisible: false })
    expect(shouldInitializeLayerMedia(layer, ['16:9'])).toBe(true)
  })

  it.each([
    ['NotAllowedError', 'Permission denied', 'permission-denied'],
    ['NotReadableError', 'Could not start video source', 'device-busy'],
    ['OverconstrainedError', 'Requested mode is unavailable', 'unsupported-settings'],
    ['NotFoundError', 'Requested device not found', 'device-missing']
  ])('classifies %s as %s', (name, message, expectedCode) => {
    expect(classifyMediaSourceError(mediaError(name, message)).code).toBe(expectedCode)
  })

  it('retries failures that can recover with safer constraints', () => {
    expect(isTransientMediaError(mediaError('NotReadableError', 'Device busy'))).toBe(true)
    expect(isTransientMediaError(mediaError('OverconstrainedError', 'Unsupported mode'))).toBe(true)
    expect(isTransientMediaError(mediaError('NotAllowedError', 'Denied'))).toBe(false)
  })
})
