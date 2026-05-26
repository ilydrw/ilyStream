import { describe, expect, it } from 'vitest'
import {
  getLoyaltyLevelForXp,
  getLoyaltyProgressForXp,
  getLoyaltyXpForLevel
} from './loyalty'

describe('loyalty leveling', () => {
  it('uses a predictable quadratic XP curve', () => {
    expect(getLoyaltyXpForLevel(1)).toBe(0)
    expect(getLoyaltyXpForLevel(2)).toBe(100)
    expect(getLoyaltyXpForLevel(3)).toBe(400)
    expect(getLoyaltyLevelForXp(0)).toBe(1)
    expect(getLoyaltyLevelForXp(99)).toBe(1)
    expect(getLoyaltyLevelForXp(100)).toBe(2)
    expect(getLoyaltyLevelForXp(400)).toBe(3)
  })

  it('reports bounded progress inside the current level', () => {
    const progress = getLoyaltyProgressForXp(250)

    expect(progress.level).toBe(2)
    expect(progress.currentLevelXp).toBe(100)
    expect(progress.nextLevelXp).toBe(400)
    expect(progress.progressRatio).toBe(0.5)
  })
})
