import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_ECONOMY_CONFIG, type EconomyRedemption } from '../../shared/economy'
import type { ChatEvent } from '../platforms/types'
import { EconomyCommandService } from './economy-command-service'

function makeChat(message: string): ChatEvent {
  return {
    id: `chat-${message}`,
    platform: 'twitch',
    timestamp: new Date(),
    type: 'chat',
    raw: {},
    message,
    emotes: [],
    user: {
      id: 'viewer-1',
      username: 'viewer',
      displayName: 'Viewer',
      isModerator: false,
      isSubscriber: false,
      isVip: false,
      badges: []
    }
  }
}

function makeMocks() {
  const economy = {
    getConfig: vi.fn(() => DEFAULT_ECONOMY_CONFIG),
    getOwnerKey: vi.fn(() => 'account:twitch:viewer'),
    getRedemptionByCommand: vi.fn((_command: string): EconomyRedemption | null => null),
    getRedemptions: vi.fn(() => []),
    getPoints: vi.fn().mockResolvedValue(340),
    claimDaily: vi.fn((..._args: any[]): any => null),
    playCoinFlip: vi.fn((..._args: any[]): any => null),
    playSlots: vi.fn((..._args: any[]): any => null),
    playRoulette: vi.fn((..._args: any[]): any => null),
    transferPoints: vi.fn((..._args: any[]): any => null),
    purchaseRedemption: vi.fn((..._args: any[]): any => null),
    refundRedemption: vi.fn((..._args: any[]): any => null)
  }
  const loyalty = {
    getUserProgress: vi.fn(() => ({
      username: 'viewer', platform: 'twitch', displayName: 'Viewer', xp: 250,
      level: 2, currentLevelXp: 100, nextLevelXp: 400, progressRatio: 0.5
    })),
    getUserRank: vi.fn((): number | null => null),
    getTopUsers: vi.fn(() => [])
  }
  const soundboard = { playSound: vi.fn(() => true) }
  const lighting = {
    getState: vi.fn((): any => ({ devices: [] })),
    executeAction: vi.fn().mockResolvedValue(undefined)
  }
  const service = new EconomyCommandService(economy as any, loyalty as any, soundboard as any, lighting as any)
  return { service, economy, loyalty, soundboard, lighting }
}

describe('EconomyCommandService', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('reports level progress and the matching point balance together', async () => {
    const { service } = makeMocks()
    await expect(service.handleChat(makeChat('!level'))).resolves.toEqual({
      message: 'Viewer: Level 2 • 150/300 XP • 340 Sparks.',
      speak: false
    })
  })

  it('uses the profile-aware loyalty rank for an account alias', async () => {
    const { service, loyalty } = makeMocks()
    loyalty.getUserRank.mockReturnValue(4)

    await expect(service.handleChat(makeChat('!rank'))).resolves.toEqual({
      message: 'Viewer, you are #4 at level 2.',
      speak: false
    })
  })

  it('shares the command throttle across aliases in the same profile', async () => {
    const { service, economy } = makeMocks()
    economy.getOwnerKey.mockReturnValue('profile:shared-viewer')
    const alias = makeChat('!points')
    alias.user = {
      ...alias.user,
      id: 'viewer-2',
      username: 'viewer_alias',
      displayName: 'Viewer Alias'
    }

    await expect(service.handleChat(makeChat('!points'))).resolves.toMatchObject({
      message: 'Viewer, you have 340 Sparks.'
    })
    await expect(service.handleChat(alias)).resolves.toMatchObject({
      message: expect.stringMatching(/^Viewer Alias, wait \d+s before using that again\.$/)
    })
    expect(economy.getPoints).toHaveBeenCalledTimes(1)
  })

  it('settles slots through the atomic economy game API', async () => {
    const { service, economy } = makeMocks()
    economy.playSlots.mockReturnValue({
      ok: true,
      game: 'slots',
      bet: 50,
      payout: 200,
      balance: 490,
      outcome: '⭐ ⭐ ⭐',
      won: true
    })

    const response = await service.handleChat(makeChat('!slots 50'))

    expect(economy.playSlots).toHaveBeenCalledWith('viewer', 'twitch', 50, {
      platformUserId: 'viewer-1',
      displayName: 'Viewer'
    })
    expect(response).toEqual({
      message: '⭐ ⭐ ⭐ — Viewer won 150 Sparks! Balance: 490.',
      speak: true
    })
  })

  it('refunds a purchased sound reward when its file cannot play', async () => {
    const reward: EconomyRedemption = {
      id: 'airhorn', name: 'Airhorn', command: 'airhorn', description: '', cost: 200,
      minLevel: 1, cooldownSeconds: 30, enabled: true,
      action: { type: 'sound', soundId: 'board/missing.mp3', volume: 0.8 }
    }
    const { service, economy, soundboard } = makeMocks()
    economy.getRedemptionByCommand.mockImplementation((command: string) => command === 'airhorn' ? reward : null)
    economy.purchaseRedemption.mockReturnValue({ ok: true, balance: 140, purchaseId: 'purchase-1', redemption: reward })
    economy.refundRedemption.mockReturnValue(340)
    soundboard.playSound.mockReturnValue(false)

    const response = await service.handleChat(makeChat('!airhorn'))

    expect(economy.refundRedemption).toHaveBeenCalledWith('purchase-1', 'Airhorn could not run')
    expect(response?.message).toContain('were refunded (balance 340)')
  })

  it('runs lighting rewards only on reachable targeted devices', async () => {
    const reward: EconomyRedemption = {
      id: 'party', name: 'Party', command: 'party', description: '', cost: 400,
      minLevel: 1, cooldownSeconds: 30, enabled: true,
      action: {
        type: 'lighting', effect: 'pulse', color: '#D035F1', durationMs: 2000,
        targetDeviceIds: ['hue-1', 'hue-offline'], targetPlatforms: []
      }
    }
    const { service, economy, lighting } = makeMocks()
    economy.getRedemptionByCommand.mockImplementation((command: string) => command === 'party' ? reward : null)
    economy.purchaseRedemption.mockReturnValue({ ok: true, balance: 0, purchaseId: 'purchase-2', redemption: reward })
    lighting.getState.mockReturnValue({
      devices: [
        { id: 'hue-1', name: 'Desk', platform: 'hue', online: true, reachable: true },
        { id: 'hue-offline', name: 'Shelf', platform: 'hue', online: false, reachable: false },
        { id: 'govee-1', name: 'Wall', platform: 'govee', online: true, reachable: true }
      ]
    })

    const response = await service.handleChat(makeChat('!party'))

    expect(lighting.executeAction).toHaveBeenCalledTimes(1)
    expect(lighting.executeAction).toHaveBeenCalledWith('hue-1', 'pulse', { color: '#D035F1', duration: 2000 })
    expect(response).toEqual({ message: 'Viewer redeemed Party for 400 Sparks!', speak: true })
  })
})
