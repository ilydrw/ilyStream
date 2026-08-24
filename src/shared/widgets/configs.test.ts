import { describe, expect, it } from 'vitest'
import { DEFAULT_PARTICLES_CONFIG, resolveParticlesWidgetConfig } from './configs'

describe('resolveParticlesWidgetConfig', () => {
  it('upgrades the exact legacy heart defaults with Heart Puff', () => {
    const legacyHeartMe = {
      ...DEFAULT_PARTICLES_CONFIG.heartMe,
      giftIds: DEFAULT_PARTICLES_CONFIG.heartMe.giftIds.slice(0, -1),
      giftNames: DEFAULT_PARTICLES_CONFIG.heartMe.giftNames.slice(0, -1)
    }

    const resolved = resolveParticlesWidgetConfig({ heartMe: legacyHeartMe })

    expect(resolved.heartMe.giftIds).toContain('9967')
    expect(resolved.heartMe.giftNames).toContain('Heart Puff')
    expect(resolved.bubbles).toMatchObject({
      enabled: false,
      giftIds: ['14084'],
      giftNames: ['Blow Bubbles']
    })
  })

  it('does not overwrite a custom heart gift selection', () => {
    const resolved = resolveParticlesWidgetConfig({
      heartMe: {
        ...DEFAULT_PARTICLES_CONFIG.heartMe,
        giftIds: ['5879'],
        giftNames: ['Doughnut']
      }
    })

    expect(resolved.heartMe.giftIds).toEqual(['5879'])
    expect(resolved.heartMe.giftNames).toEqual(['Doughnut'])
  })

  it('enables bubbles when upgrading an existing all-effects widget', () => {
    const legacyAllEffects = Object.fromEntries(
      ['fallingRoses', 'galaxy', 'ggs', 'heartMe', 'confetti', 'fireworks', 'lightning', 'moneyRain']
        .map((key) => [key, { enabled: true }])
    )

    expect(resolveParticlesWidgetConfig(legacyAllEffects).bubbles.enabled).toBe(true)
    expect(resolveParticlesWidgetConfig({ heartMe: { enabled: true } }).bubbles.enabled).toBe(false)
  })
})
