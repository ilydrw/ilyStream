import { describe, expect, it } from 'vitest'
import { meterElementsAreStale, type MeterElements } from './utils'

/**
 * The meter tick caches its DOM targets and only re-queries when this predicate
 * says the cache went bad. If it under-reports, meters silently freeze against
 * detached nodes; if it over-reports, the per-frame querySelectorAll cost the
 * cache exists to remove comes straight back.
 */
function buildElements(overrides: Partial<Record<keyof MeterElements, unknown>> = {}): MeterElements {
  const connected = [{ isConnected: true }] as unknown as HTMLElement[]

  return {
    peakL: connected,
    peakR: connected,
    hpeakL: connected,
    hpeakR: connected,
    clipL: connected,
    clipR: connected,
    holdL: connected,
    holdR: connected,
    clipIndicatorL: connected,
    clipIndicatorR: connected,
    spectrum: null,
    ...overrides
  } as MeterElements
}

describe('meterElementsAreStale', () => {
  it('keeps a cache whose elements are all still in the document', () => {
    expect(meterElementsAreStale(buildElements())).toBe(false)
  })

  it('invalidates when a strip remounts and leaves detached nodes behind', () => {
    const detached = [{ isConnected: false }] as unknown as HTMLElement[]
    expect(meterElementsAreStale(buildElements({ holdL: detached }))).toBe(true)
  })

  it('invalidates a cache that matched nothing so it retries once the strip mounts', () => {
    const empty: HTMLElement[] = []
    const nothingFound = buildElements({
      peakL: empty,
      peakR: empty,
      hpeakL: empty,
      hpeakR: empty,
      clipL: empty,
      clipR: empty,
      holdL: empty,
      holdR: empty,
      clipIndicatorL: empty,
      clipIndicatorR: empty
    })

    expect(meterElementsAreStale(nothingFound)).toBe(true)
  })

  it('keeps a partially-populated cache — not every meter renders every group', () => {
    const empty: HTMLElement[] = []
    expect(meterElementsAreStale(buildElements({ clipIndicatorL: empty, clipIndicatorR: empty }))).toBe(false)
  })
})
