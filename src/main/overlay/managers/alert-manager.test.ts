import { describe, expect, it, vi } from 'vitest'
import { AlertManager } from './alert-manager'

describe('AlertManager', () => {
  it('rewrites alert sound ids to overlay-served sound URLs', () => {
    const sse = { broadcast: vi.fn() }
    const manager = new AlertManager(sse as any)

    manager.pushAlert({
      id: 'alert-1',
      template: 'Alert',
      audioUrl: 'alerts/alert.mp3',
      audioVolume: 0.75,
      durationMs: 5000,
      animationIn: 'fade',
      animationOut: 'fade'
    }, 'tiktok')

    expect(manager.getHistory()[0]).toEqual(
      expect.objectContaining({
        audioUrl: '/sounds/alerts/alert.mp3',
        audioVolume: 0.75
      })
    )
    expect(sse.broadcast).toHaveBeenCalledWith(
      'alerts',
      expect.objectContaining({
        type: 'append',
        payload: expect.objectContaining({
          audioUrl: '/sounds/alerts/alert.mp3'
        })
      })
    )
  })

  it('supports legacy alert sound file names', () => {
    const manager = new AlertManager({ broadcast: vi.fn() } as any)

    manager.pushAlert({
      id: 'alert-2',
      template: 'Alert',
      audioUrl: 'alert.wav',
      durationMs: 5000,
      animationIn: 'fade',
      animationOut: 'fade'
    }, 'tiktok')

    expect(manager.getHistory()[0]).toEqual(
      expect.objectContaining({
        audioUrl: '/sounds/alerts/alert.wav'
      })
    )
  })
})
