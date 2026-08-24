import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

/**
 * OverlayServer receives its collaborators through `setX()` calls made once at
 * startup. Forgetting one does not crash or fail a type-check — the affected
 * endpoint just serves an empty payload forever, which reads as a broken
 * widget. That is exactly how the likes all-time leaderboard and the points
 * leaderboard both shipped dead: their setters existed and were exercised in
 * overlay-server tests, but production never called them.
 *
 * Rather than pin a hand-written list that drifts, derive the dependency
 * setters from OverlayServer itself and require the registry to wire each one.
 */
describe('overlay server dependency wiring', () => {
  const srcDir = join(__dirname, '..')
  const overlayServerSource = readFileSync(join(srcDir, 'overlay', 'overlay-server.ts'), 'utf8')
  const registrySource = readFileSync(join(srcDir, 'services', 'service-registry.ts'), 'utf8')

  // Collaborator setters only — `setPort`/`setNowPlaying`/`setDualVerticalFrame`
  // are runtime operations, not startup dependencies.
  const dependencySetters = [
    ...overlayServerSource.matchAll(/^ {2}(set[A-Z]\w*(?:Service|Manager|Api|Database))\s*\(/gm)
  ].map((match) => match[1])

  it('finds the dependency setters it means to check', () => {
    expect(dependencySetters).toContain('setStatsService')
    expect(dependencySetters).toContain('setEconomyService')
    expect(dependencySetters.length).toBeGreaterThanOrEqual(8)
  })

  it.each(dependencySetters)('wires %s in the service registry', (setter) => {
    expect(registrySource).toContain(`overlayServer.${setter}(`)
  })
})
