import type { Platform } from '../main/platforms/types'

export interface LoyaltyProgress {
  username: string
  platform: Platform
  displayName: string
  xp: number
  level: number
  currentLevelXp: number
  nextLevelXp: number
  progressRatio: number
}

export interface LoyaltyXpAward {
  username: string
  platform: Platform
  displayName: string
  platformUserId?: string | null
  amount: number
  reason: string
}

export interface LoyaltyLevelUpEvent extends LoyaltyProgress {
  platformUserId?: string | null
  previousLevel: number
  awardedXp: number
  reason: string
}

export interface LoyaltyXpAwardedEvent extends LoyaltyProgress {
  platformUserId?: string | null
  previousLevel: number
  awardedXp: number
  reason: string
  leveledUp: boolean
}

export const LOYALTY_LEVEL_BASE_XP = 100

export function getLoyaltyLevelForXp(xp: number): number {
  const safeXp = Math.max(0, Math.floor(Number(xp) || 0))
  return Math.floor(Math.sqrt(safeXp / LOYALTY_LEVEL_BASE_XP)) + 1
}

export function getLoyaltyXpForLevel(level: number): number {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1))
  return Math.pow(safeLevel - 1, 2) * LOYALTY_LEVEL_BASE_XP
}

export function getLoyaltyProgressForXp(xp: number): Pick<LoyaltyProgress, 'level' | 'currentLevelXp' | 'nextLevelXp' | 'progressRatio'> {
  const safeXp = Math.max(0, Math.floor(Number(xp) || 0))
  const level = getLoyaltyLevelForXp(safeXp)
  const currentLevelXp = getLoyaltyXpForLevel(level)
  const nextLevelXp = getLoyaltyXpForLevel(level + 1)
  const span = Math.max(1, nextLevelXp - currentLevelXp)

  return {
    level,
    currentLevelXp,
    nextLevelXp,
    progressRatio: Math.max(0, Math.min(1, (safeXp - currentLevelXp) / span))
  }
}
