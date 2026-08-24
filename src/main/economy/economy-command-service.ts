import type { EconomyRedemption, EconomyWagerResult } from '../../shared/economy'
import type { ChatEvent } from '../platforms/types'
import type { LoyaltyService } from '../loyalty/loyalty-service'
import type { SoundboardService } from '../soundboard/soundboard-service'
import type { LightingManagerService } from '../services/lighting/lighting-manager'
import type { EconomyService } from './economy-service'

export interface EconomyCommandResponse {
  message: string
  speak: boolean
}

export class EconomyCommandService {
  private commandCooldowns = new Map<string, number>()

  constructor(
    private readonly economy: EconomyService,
    private readonly loyalty: LoyaltyService,
    private readonly soundboard: Pick<SoundboardService, 'playSound'>,
    private readonly lighting: Pick<LightingManagerService, 'getState' | 'executeAction'>
  ) {}

  async handleChat(event: ChatEvent): Promise<EconomyCommandResponse | null> {
    if ((event.raw as any)?.simulated) return null
    const parsed = parseCommand(event.message)
    if (!parsed) return null

    const redemption = parsed.command === 'redeem'
      ? this.economy.getRedemptionByCommand(parsed.args[0])
      : this.economy.getRedemptionByCommand(parsed.command)
    const known = BUILT_IN_COMMANDS.has(parsed.command) || Boolean(redemption)
    if (!known) return null

    const username = event.user.username
    const platform = event.platform
    const name = displayName(event)
    const identityHint = {
      platformUserId: event.user.id,
      displayName: event.user.displayName
    }
    const ownerKey = this.economy.getOwnerKey(username, platform, identityHint)
    const cooldown = this.checkCommandCooldown(ownerKey, parsed.command)
    if (cooldown > 0) {
      return { message: `${name}, wait ${Math.ceil(cooldown / 1000)}s before using that again.`, speak: false }
    }

    const config = this.economy.getConfig()
    const currency = config.currencyName

    switch (parsed.command) {
      case 'points':
      case 'balance': {
        const points = await this.economy.getPoints(username, platform, identityHint)
        return { message: `${name}, you have ${formatPoints(points)} ${currency}.`, speak: false }
      }
      case 'level': {
        const progress = this.loyalty.getUserProgress(platform, username, identityHint)
        const points = await this.economy.getPoints(username, platform, identityHint)
        if (!progress) {
          return { message: `${name}: Level 1 • 0/100 XP • ${formatPoints(points)} ${currency}.`, speak: false }
        }
        return {
          message: `${name}: Level ${progress.level} • ${formatPoints(progress.xp - progress.currentLevelXp)}/${formatPoints(progress.nextLevelXp - progress.currentLevelXp)} XP • ${formatPoints(points)} ${currency}.`,
          speak: false
        }
      }
      case 'rank': {
        const rank = this.loyalty.getUserRank(platform, username, 100, identityHint)
        const progress = this.loyalty.getUserProgress(platform, username, identityHint)
        return {
          message: rank !== null
            ? `${name}, you are #${rank} at level ${progress?.level || 1}.`
            : `${name}, earn XP to enter the top 100. You are level ${progress?.level || 1}.`,
          speak: false
        }
      }
      case 'daily': {
        if (!config.enabled) return { message: `The ${currency} economy is currently paused.`, speak: false }
        const level = this.loyalty.getUserProgress(platform, username, identityHint)?.level || 1
        const result = this.economy.claimDaily(username, platform, level, undefined, identityHint)
        return result.ok
          ? {
              message: `${name} claimed ${formatPoints(result.reward)} ${currency}! Daily streak: ${result.streak}. Balance: ${formatPoints(result.balance)}.`,
              speak: result.streak === 7 || result.streak % 30 === 0
            }
          : {
              message: `${name}, today's daily is already claimed. Streak: ${result.streak}; balance: ${formatPoints(result.balance)} ${currency}.`,
              speak: false
            }
      }
      case 'gamble':
      case 'bet': {
        const balance = await this.economy.getPoints(username, platform, identityHint)
        const bet = resolveBet(parsed.args[0], balance, config.minBet, config.maxBet)
        return this.describeWager(name, currency, this.economy.playCoinFlip(username, platform, bet, 'heads', identityHint))
      }
      case 'coinflip': {
        const choice = parsed.args.find((arg) => arg === 'heads' || arg === 'tails') as 'heads' | 'tails' | undefined
        const betToken = parsed.args.find((arg) => arg !== 'heads' && arg !== 'tails')
        if (!choice) return { message: `Use !coinflip heads ${config.minBet} (or tails).`, speak: false }
        const balance = await this.economy.getPoints(username, platform, identityHint)
        const bet = resolveBet(betToken, balance, config.minBet, config.maxBet)
        return this.describeWager(name, currency, this.economy.playCoinFlip(username, platform, bet, choice, identityHint))
      }
      case 'spin':
      case 'slots': {
        const balance = await this.economy.getPoints(username, platform, identityHint)
        const bet = resolveBet(parsed.args[0], balance, config.minBet, config.maxBet)
        return this.describeWager(name, currency, this.economy.playSlots(username, platform, bet, identityHint))
      }
      case 'roulette': {
        const choice = parsed.args.find((arg) => arg === 'red' || arg === 'black' || arg === 'green') as 'red' | 'black' | 'green' | undefined
        const betToken = parsed.args.find((arg) => arg !== 'red' && arg !== 'black' && arg !== 'green')
        if (!choice) return { message: `Use !roulette red ${config.minBet} (red, black, or green).`, speak: false }
        const balance = await this.economy.getPoints(username, platform, identityHint)
        const bet = resolveBet(betToken, balance, config.minBet, config.maxBet)
        return this.describeWager(name, currency, this.economy.playRoulette(username, platform, bet, choice, identityHint))
      }
      case 'shop': {
        const items = this.economy.getRedemptions(false).slice(0, 4)
        if (items.length === 0) return { message: 'The point shop is empty right now.', speak: false }
        const listing = items.map((item) => `!${item.command} ${formatPoints(item.cost)}`).join(' • ')
        const more = this.economy.getRedemptions(false).length > items.length ? ' • more in ilyStream' : ''
        return { message: `${currency} shop: ${listing}${more}`, speak: false }
      }
      case 'give': {
        const recipient = sanitizeRecipient(parsed.args[0])
        const amount = parsePointAmount(parsed.args[1])
        if (!recipient || !amount) return { message: `Use !give username amount.`, speak: false }
        const result = this.economy.transferPoints(username, platform, recipient, amount, identityHint)
        if (result.ok) {
          return { message: `${name} sent ${formatPoints(amount)} ${currency} to ${recipient}. Balance: ${formatPoints(result.balance)}.`, speak: false }
        }
        if (result.error === 'same-user') return { message: `${name}, you cannot send points to yourself.`, speak: false }
        return { message: `${name}, that transfer failed. Check your balance and amount.`, speak: false }
      }
      case 'economy':
        return {
          message: `Commands: !points !level !daily !gamble <bet> !slots <bet> !roulette <color> <bet> !shop !give <user> <amount>.`,
          speak: false
        }
      case 'redeem':
        if (!redemption) return { message: `Use !redeem <shop command>, or type !shop.`, speak: false }
        return this.redeem(event, redemption, currency)
      default:
        if (redemption) return this.redeem(event, redemption, currency)
        return null
    }
  }

  private async redeem(event: ChatEvent, redemption: EconomyRedemption, currency: string): Promise<EconomyCommandResponse> {
    const name = displayName(event)
    const identityHint = {
      platformUserId: event.user.id,
      displayName: event.user.displayName
    }
    const level = this.loyalty.getUserProgress(event.platform, event.user.username, identityHint)?.level || 1
    const purchase = this.economy.purchaseRedemption(
      event.user.username,
      event.platform,
      redemption.command,
      level,
      undefined,
      identityHint
    )
    if (!purchase.ok) {
      switch (purchase.error) {
        case 'level-required':
          return { message: `${name}, ${redemption.name} unlocks at level ${purchase.requiredLevel}.`, speak: false }
        case 'cooldown':
          return { message: `${redemption.name} is cooling down for ${purchase.retryAfterSeconds}s.`, speak: false }
        case 'insufficient-points':
          return { message: `${name}, ${redemption.name} costs ${formatPoints(redemption.cost)} ${currency}; you have ${formatPoints(purchase.balance)}.`, speak: false }
        case 'disabled':
          return { message: `Point redemptions are currently paused.`, speak: false }
        default:
          return { message: `That shop item is unavailable. Type !shop for the current list.`, speak: false }
      }
    }

    const executed = await this.executeRedemption(redemption)
    if (!executed && purchase.purchaseId) {
      const refundedBalance = this.economy.refundRedemption(purchase.purchaseId, `${redemption.name} could not run`)
      return {
        message: `${redemption.name} could not run, so ${name}'s ${formatPoints(redemption.cost)} ${currency} were refunded${refundedBalance === null ? '' : ` (balance ${formatPoints(refundedBalance)})`}.`,
        speak: false
      }
    }

    return {
      message: `${name} redeemed ${redemption.name} for ${formatPoints(redemption.cost)} ${currency}!`,
      speak: true
    }
  }

  private async executeRedemption(redemption: EconomyRedemption): Promise<boolean> {
    if (redemption.action.type === 'sound') {
      return this.soundboard.playSound(redemption.action.soundId, redemption.action.volume)
    }

    const action = redemption.action
    const devices = this.lighting.getState().devices.filter((device) => {
      if (!device.online || !device.reachable) return false
      if (action.targetDeviceIds.length > 0 && !action.targetDeviceIds.includes(device.id)) return false
      if (action.targetPlatforms.length > 0 && !action.targetPlatforms.includes(device.platform)) return false
      return true
    })
    if (devices.length === 0) return false

    const results = await Promise.allSettled(devices.map((device) => this.lighting.executeAction(
      device.id,
      action.effect,
      { color: action.color, duration: action.durationMs }
    )))
    return results.some((result) => result.status === 'fulfilled')
  }

  private describeWager(name: string, currency: string, result: EconomyWagerResult): EconomyCommandResponse {
    if (!result.ok) {
      if (result.error === 'disabled') return { message: 'Viewer gambling is currently paused.', speak: false }
      if (result.error === 'invalid-bet') {
        const config = this.economy.getConfig()
        return { message: `Bet between ${formatPoints(config.minBet)} and ${formatPoints(config.maxBet)} ${currency}.`, speak: false }
      }
      return { message: `${name}, you do not have enough ${currency} for that bet.`, speak: false }
    }

    if (result.payout > result.bet) {
      return {
        message: `${result.outcome} — ${name} won ${formatPoints(result.payout - result.bet)} ${currency}! Balance: ${formatPoints(result.balance)}.`,
        speak: result.payout >= result.bet * 4
      }
    }
    if (result.payout === result.bet) {
      return { message: `${result.outcome} — ${name} broke even. Balance: ${formatPoints(result.balance)} ${currency}.`, speak: false }
    }
    return { message: `${result.outcome} — ${name} lost ${formatPoints(result.bet - result.payout)} ${currency}. Balance: ${formatPoints(result.balance)}.`, speak: false }
  }

  private checkCommandCooldown(ownerKey: string, command: string): number {
    const now = Date.now()
    const key = `${ownerKey}:${command}`
    const last = this.commandCooldowns.get(key) || 0
    const cooldownMs = this.economy.getConfig().commandCooldownMs
    const remaining = (last + cooldownMs) - now
    if (remaining > 0) return remaining
    this.commandCooldowns.set(key, now)

    if (this.commandCooldowns.size > 5000) {
      const cutoff = now - (cooldownMs * 4)
      for (const [candidate, timestamp] of this.commandCooldowns) {
        if (timestamp < cutoff) this.commandCooldowns.delete(candidate)
      }
    }
    return 0
  }
}

const BUILT_IN_COMMANDS = new Set([
  'points', 'balance', 'level', 'rank', 'daily', 'gamble', 'bet', 'coinflip',
  'spin', 'slots', 'roulette', 'shop', 'give', 'economy', 'redeem'
])

function parseCommand(message: string): { command: string; args: string[] } | null {
  const normalized = String(message || '').trim()
  if (!normalized.startsWith('!')) return null
  const parts = normalized.slice(1).trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return null
  return { command: parts[0], args: parts.slice(1) }
}

function resolveBet(token: string | undefined, balance: number, min: number, max: number): number {
  const normalized = String(token || '').trim().toLowerCase()
  if (normalized === 'all' || normalized === 'max') return Math.min(balance, max)
  if (normalized === 'half') return Math.min(Math.floor(balance / 2), max)
  return parsePointAmount(normalized) || min
}

function parsePointAmount(value: unknown): number {
  const parsed = Number(String(value || '').replace(/,/g, ''))
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0
}

function sanitizeRecipient(value: unknown): string {
  return String(value || '').trim().replace(/^@/, '').replace(/[^a-z0-9_.-]/gi, '').slice(0, 80)
}

function displayName(event: ChatEvent): string {
  return event.user.displayName?.trim() || event.user.username
}

function formatPoints(value: number): string {
  return Math.max(0, Math.floor(value || 0)).toLocaleString('en-US')
}
