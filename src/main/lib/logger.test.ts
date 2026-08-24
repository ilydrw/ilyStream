import { describe, expect, it, vi } from 'vitest'
import { logEmitter, setupLogger, shouldForwardErrorToRenderer } from './logger'

describe('shouldForwardErrorToRenderer', () => {
  it('does not relay Electron disposed-frame send failures to the same renderer', () => {
    expect(shouldForwardErrorToRenderer([
      'Error sending from webFrameMain: ',
      new Error('Render frame was disposed before WebFrameMain could be accessed')
    ])).toBe(false)
  })

  it('keeps unrelated WebFrameMain and application errors visible in the renderer', () => {
    expect(shouldForwardErrorToRenderer([
      'Error sending from webFrameMain: ',
      new Error('An object could not be cloned')
    ])).toBe(true)
    expect(shouldForwardErrorToRenderer([
      '[Spotify] Poll failed',
      new Error('request timed out')
    ])).toBe(true)
  })

  it('prints a disposed-frame failure locally without emitting a renderer log', () => {
    const originals = {
      log: console.log,
      warn: console.warn,
      error: console.error
    }
    const errorSink = vi.fn()
    const rendererLog = vi.fn()

    console.error = errorSink
    setupLogger()
    logEmitter.on('log', rendererLog)

    try {
      console.error(
        'Error sending from webFrameMain: ',
        new Error('Render frame was disposed before WebFrameMain could be accessed')
      )

      expect(errorSink).toHaveBeenCalledTimes(1)
      expect(rendererLog).not.toHaveBeenCalled()

      console.error('[Spotify] Poll failed', new Error('request timed out'))
      expect(rendererLog).toHaveBeenCalledOnce()
    } finally {
      logEmitter.off('log', rendererLog)
      console.log = originals.log
      console.warn = originals.warn
      console.error = originals.error
    }
  })
})
