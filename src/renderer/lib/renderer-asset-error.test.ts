import { describe, expect, it } from 'vitest'
import { isRendererAssetLoadError } from './renderer-asset-error'

describe('renderer asset error detection', () => {
  it('recognizes a missing Vite lazy-route chunk', () => {
    expect(
      isRendererAssetLoadError(
        new TypeError(
          'Failed to fetch dynamically imported module: file:///C:/Dev/ilyStream/out/renderer/assets/index-old.js'
        )
      )
    ).toBe(true)
  })

  it.each([
    'Error loading dynamically imported module',
    'Importing a module script failed.',
    'Unable to preload CSS for /assets/page-old.css',
    'Loading chunk StatsPage failed'
  ])('recognizes other renderer asset failures: %s', (message) => {
    expect(isRendererAssetLoadError(new Error(message))).toBe(true)
  })

  it('does not treat an ordinary application error as a stale asset', () => {
    expect(isRendererAssetLoadError(new Error('Failed to fetch audience stats'))).toBe(false)
    expect(isRendererAssetLoadError({ message: 'Failed to fetch dynamically imported module' })).toBe(false)
  })
})
