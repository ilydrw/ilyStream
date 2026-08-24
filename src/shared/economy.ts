import type { Platform } from '../main/platforms/types'
import type { LightPlatform } from './lighting'

export interface EconomyConfig {
  enabled: boolean
  currencyName: string
  pointsPerXp: number
  levelBoostPercent: number
  maxLevelBoostPercent: number
  levelUpBonusPerLevel: number
  dailyBase: number
  dailyPerLevel: number
  minBet: number
  maxBet: number
  commandCooldownMs: number
  gamblingEnabled: boolean
  redemptionsEnabled: boolean
}

export const DEFAULT_ECONOMY_CONFIG: EconomyConfig = {
  enabled: true,
  currencyName: 'Sparks',
  pointsPerXp: 0.25,
  levelBoostPercent: 2,
  maxLevelBoostPercent: 50,
  levelUpBonusPerLevel: 10,
  dailyBase: 50,
  dailyPerLevel: 10,
  minBet: 10,
  maxBet: 5000,
  commandCooldownMs: 2500,
  gamblingEnabled: true,
  redemptionsEnabled: true
}

export const RESERVED_ECONOMY_COMMANDS = new Set([
  // Commands already owned elsewhere in the event pipeline. A redemption
  // using one of these could run twice or never be reached.
  'get',
  'ai',
  'sr',
  'songrequest',
  'play',
  'skip',
  'voteskip',
  'points',
  'balance',
  'level',
  'rank',
  'daily',
  'gamble',
  'bet',
  'coinflip',
  'spin',
  'slots',
  'roulette',
  'shop',
  'redeem',
  'give',
  'economy'
])

export interface EconomySoundAction {
  type: 'sound'
  soundId: string
  volume: number
}

export interface EconomyLightingAction {
  type: 'lighting'
  effect: 'flash' | 'pulse'
  color: string
  durationMs: number
  targetDeviceIds: string[]
  targetPlatforms: LightPlatform[]
}

export type EconomyRedemptionAction = EconomySoundAction | EconomyLightingAction

export interface EconomyRedemption {
  id: string
  name: string
  command: string
  description: string
  cost: number
  minLevel: number
  cooldownSeconds: number
  enabled: boolean
  action: EconomyRedemptionAction
  createdAt?: string
  updatedAt?: string
}

export interface EconomyAccount {
  username: string
  platform: Platform
  points: number
  xp: number
  level: number
  updatedAt: string | null
}

export type EconomyTransactionKind =
  | 'earn'
  | 'grant'
  | 'spend'
  | 'wager'
  | 'payout'
  | 'daily'
  | 'transfer'
  | 'refund'
  | 'adjustment'

export interface EconomyTransaction {
  id: number
  username: string
  platform: Platform
  delta: number
  balanceAfter: number
  kind: EconomyTransactionKind
  reason: string
  referenceId: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export interface EconomyDashboard {
  config: EconomyConfig
  totals: {
    accounts: number
    pointsInCirculation: number
    lifetimeEarned: number
    lifetimeSpent: number
    activeRedemptions: number
  }
  leaders: EconomyAccount[]
  recentTransactions: EconomyTransaction[]
  redemptions: EconomyRedemption[]
}

export interface EconomyWagerResult {
  ok: boolean
  error?: 'disabled' | 'invalid-bet' | 'insufficient-points'
  game: 'coinflip' | 'slots' | 'roulette'
  bet: number
  payout: number
  balance: number
  outcome: string
  won: boolean
}

export interface EconomyDailyClaimResult {
  ok: boolean
  alreadyClaimed: boolean
  reward: number
  streak: number
  balance: number
}

export interface LoyaltyPointReward {
  activityPoints: number
  levelUpBonus: number
  total: number
  multiplier: number
}

export function resolveEconomyConfig(value: unknown): EconomyConfig {
  const input = value && typeof value === 'object' ? value as Partial<EconomyConfig> : {}
  const minBet = clampInteger(input.minBet, 1, 1_000_000, DEFAULT_ECONOMY_CONFIG.minBet)
  const maxBet = clampInteger(input.maxBet, minBet, 10_000_000, DEFAULT_ECONOMY_CONFIG.maxBet)

  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : DEFAULT_ECONOMY_CONFIG.enabled,
    currencyName: normalizeCurrencyName(input.currencyName),
    pointsPerXp: clampNumber(input.pointsPerXp, 0, 100, DEFAULT_ECONOMY_CONFIG.pointsPerXp),
    levelBoostPercent: clampNumber(input.levelBoostPercent, 0, 100, DEFAULT_ECONOMY_CONFIG.levelBoostPercent),
    maxLevelBoostPercent: clampNumber(input.maxLevelBoostPercent, 0, 1000, DEFAULT_ECONOMY_CONFIG.maxLevelBoostPercent),
    levelUpBonusPerLevel: clampInteger(input.levelUpBonusPerLevel, 0, 1_000_000, DEFAULT_ECONOMY_CONFIG.levelUpBonusPerLevel),
    dailyBase: clampInteger(input.dailyBase, 0, 1_000_000, DEFAULT_ECONOMY_CONFIG.dailyBase),
    dailyPerLevel: clampInteger(input.dailyPerLevel, 0, 100_000, DEFAULT_ECONOMY_CONFIG.dailyPerLevel),
    minBet,
    maxBet,
    commandCooldownMs: clampInteger(input.commandCooldownMs, 500, 60_000, DEFAULT_ECONOMY_CONFIG.commandCooldownMs),
    gamblingEnabled: typeof input.gamblingEnabled === 'boolean' ? input.gamblingEnabled : DEFAULT_ECONOMY_CONFIG.gamblingEnabled,
    redemptionsEnabled: typeof input.redemptionsEnabled === 'boolean' ? input.redemptionsEnabled : DEFAULT_ECONOMY_CONFIG.redemptionsEnabled
  }
}

export function calculateLoyaltyPointReward(
  awardedXp: number,
  level: number,
  leveledUp: boolean,
  config: EconomyConfig = DEFAULT_ECONOMY_CONFIG
): LoyaltyPointReward {
  const safeXp = Math.max(0, Math.floor(Number(awardedXp) || 0))
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1))
  const boostPercent = Math.min(
    config.maxLevelBoostPercent,
    Math.max(0, safeLevel - 1) * config.levelBoostPercent
  )
  const multiplier = 1 + (boostPercent / 100)
  const rawActivityPoints = safeXp * config.pointsPerXp * multiplier
  const activityPoints = rawActivityPoints > 0 ? Math.max(1, Math.floor(rawActivityPoints)) : 0
  const levelUpBonus = leveledUp ? safeLevel * config.levelUpBonusPerLevel : 0

  return {
    activityPoints,
    levelUpBonus,
    total: activityPoints + levelUpBonus,
    multiplier
  }
}

function normalizeCurrencyName(value: unknown): string {
  const normalized = String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 24)
  return normalized || DEFAULT_ECONOMY_CONFIG.currencyName
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}
