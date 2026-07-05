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

  it('rewrites bare image asset ids to overlay-served asset URLs', () => {
    const manager = new AlertManager({ broadcast: vi.fn() } as any)

    manager.pushAlert({
      id: 'alert-3',
      template: 'Alert',
      imageUrl: 'gift-icon.png',
      durationMs: 5000,
      animationIn: 'fade',
      animationOut: 'fade'
    }, 'tiktok')

    expect(manager.getHistory()[0]).toEqual(
      expect.objectContaining({
        imageUrl: '/assets/gift-icon.png'
      })
    )
  })

  it('rewrites asset protocol image URLs to overlay-served asset URLs', () => {
    const manager = new AlertManager({ broadcast: vi.fn() } as any)

    manager.pushAlert({
      id: 'alert-asset-url',
      template: 'Alert',
      imageUrl: 'asset:///app/gift%20icon.png',
      durationMs: 5000,
      animationIn: 'fade',
      animationOut: 'fade'
    }, 'tiktok')

    expect(manager.getHistory()[0]).toEqual(
      expect.objectContaining({
        imageUrl: '/assets/gift%20icon.png'
      })
    )
  })

  it('rewrites preview-style asset image URLs to overlay-served asset URLs', () => {
    const manager = new AlertManager({ broadcast: vi.fn() } as any)

    manager.pushAlert({
      id: 'alert-preview-url',
      template: 'Alert',
      imageUrl: 'asset://image/gift-icon.png',
      durationMs: 5000,
      animationIn: 'fade',
      animationOut: 'fade'
    }, 'tiktok')

    expect(manager.getHistory()[0]).toEqual(
      expect.objectContaining({
        imageUrl: '/assets/gift-icon.png'
      })
    )
  })

  it('leaves remote image URLs untouched', () => {
    const manager = new AlertManager({ broadcast: vi.fn() } as any)

    manager.pushAlert({
      id: 'alert-4',
      template: 'Alert',
      imageUrl: 'https://cdn.example.com/avatar.png',
      durationMs: 5000,
      animationIn: 'fade',
      animationOut: 'fade'
    }, 'tiktok')

    expect(manager.getHistory()[0]).toEqual(
      expect.objectContaining({
        imageUrl: 'https://cdn.example.com/avatar.png'
      })
    )
  })
})
