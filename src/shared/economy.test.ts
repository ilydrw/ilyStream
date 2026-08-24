import { describe, expect, it } from 'vitest'
import {
  calculateLoyaltyPointReward,
  DEFAULT_ECONOMY_CONFIG,
  RESERVED_ECONOMY_COMMANDS,
  resolveEconomyConfig
} from './economy'

describe('viewer economy rules', () => {
  it('scales point earning with level and caps the boost', () => {
    const levelOne = calculateLoyaltyPointReward(100, 1, false)
    const levelTen = calculateLoyaltyPointReward(100, 10, false)
    const veryHighLevel = calculateLoyaltyPointReward(100, 1000, false)

    expect(levelOne).toMatchObject({ activityPoints: 25, levelUpBonus: 0, total: 25, multiplier: 1 })
    expect(levelTen.activityPoints).toBe(29)
    expect(veryHighLevel.multiplier).toBe(1.5)
    expect(veryHighLevel.activityPoints).toBe(37)
  })

  it('adds an explicit level-up bonus on top of activity earnings', () => {
    expect(calculateLoyaltyPointReward(35, 4, true)).toMatchObject({
      activityPoints: 9,
      levelUpBonus: 40,
      total: 49
    })
  })

  it('allows hosts to disable activity earning without disabling level-up bonuses', () => {
    const config = { ...DEFAULT_ECONOMY_CONFIG, pointsPerXp: 0 }
    expect(calculateLoyaltyPointReward(100, 3, false, config).total).toBe(0)
    expect(calculateLoyaltyPointReward(100, 3, true, config)).toMatchObject({
      activityPoints: 0,
      levelUpBonus: 30,
      total: 30
    })
  })

  it('sanitizes unsafe or contradictory host configuration', () => {
    const resolved = resolveEconomyConfig({
      currencyName: '   ',
      pointsPerXp: -4,
      minBet: 500,
      maxBet: 10,
      commandCooldownMs: 50
    })

    expect(resolved.currencyName).toBe(DEFAULT_ECONOMY_CONFIG.currencyName)
    expect(resolved.pointsPerXp).toBe(0)
    expect(resolved.minBet).toBe(500)
    expect(resolved.maxBet).toBe(500)
    expect(resolved.commandCooldownMs).toBe(500)
  })

  it('reserves commands already owned by points drops, AI, and Spotify', () => {
    for (const command of ['get', 'ai', 'sr', 'songrequest', 'play', 'skip', 'voteskip']) {
      expect(RESERVED_ECONOMY_COMMANDS.has(command)).toBe(true)
    }
  })
})
