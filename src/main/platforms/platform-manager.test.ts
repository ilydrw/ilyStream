import { describe, expect, it, vi } from 'vitest'
import type { ConnectorError } from './base-connector'
import { PlatformManager, resolvePlatformAutoReconnect } from './platform-manager'

describe('PlatformManager', () => {
  it('re-emits connector validation failures without triggering an unhandled error event', async () => {
    const db = { getAllSettings: vi.fn().mockReturnValue({}) } as any
    const tiktokChatSender = { getStatus: vi.fn().mockReturnValue({ isChatReady: false }) } as any
    const manager = new PlatformManager(db, tiktokChatSender)
    const errors: ConnectorError[] = []

    manager.on('connector-error', (error) => {
      errors.push(error as ConnectorError)
    })

    await expect(
      manager.connect({
        platform: 'tiktok',
        enabled: true,
        username: ''
      })
    ).rejects.toThrow('TikTok username is required')

    expect(errors).toHaveLength(1)
    expect(errors[0]).toEqual(
      expect.objectContaining({
        platform: 'tiktok',
        context: 'validation',
        recoverable: false
      })
    )
  })

  it('reads auto reconnect from the nested platform setting', () => {
    expect(resolvePlatformAutoReconnect({ platform: { autoReconnect: true } })).toBe(true)
    expect(resolvePlatformAutoReconnect({ platform: { autoReconnect: false } })).toBe(false)
  })

  it('immediately retries only connectors waiting for a live channel', async () => {
    const db = { getAllSettings: vi.fn().mockReturnValue({}) } as any
    const tiktokChatSender = { getStatus: vi.fn().mockReturnValue({ isChatReady: false }) } as any
    const manager = new PlatformManager(db, tiktokChatSender)
    const retryTikTok = vi.fn().mockResolvedValue(true)
    const retryTwitch = vi.fn().mockResolvedValue(false)
    ;(manager as any).connectors = new Map([
      ['tiktok', { retryWaitingNow: retryTikTok }],
      ['twitch', { retryWaitingNow: retryTwitch }]
    ])

    await expect(manager.retryWaitingConnections()).resolves.toEqual(['tiktok'])
    expect(retryTikTok).toHaveBeenCalledTimes(1)
    expect(retryTwitch).toHaveBeenCalledTimes(1)
  })

  it('persists refreshed platform access tokens without dropping the existing refresh token', () => {
    const existingConfig = {
      platform: 'twitch',
      enabled: true,
      channel: 'ily2drw',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      accessToken: 'old-access-token',
      refreshToken: 'old-refresh-token'
    }
    const db = {
      getAllSettings: vi.fn().mockReturnValue({}),
      getPlatformConfig: vi.fn().mockReturnValue(existingConfig),
      savePlatformConfig: vi.fn()
    } as any
    const tiktokChatSender = { getStatus: vi.fn().mockReturnValue({ isChatReady: false }) } as any
    const manager = new PlatformManager(db, tiktokChatSender)

    ;(manager as any).persistRefreshedPlatformToken({
      platform: 'twitch',
      accessToken: 'new-access-token'
    })

    expect(db.savePlatformConfig).toHaveBeenCalledWith({
      ...existingConfig,
      accessToken: 'new-access-token',
      refreshToken: 'old-refresh-token'
    })
  })

  it('removes only a Discord RPC token after Discord rejects its application binding', () => {
    const existingConfig = {
      platform: 'discord',
      enabled: false,
      webhookUrl: 'https://discord.com/api/webhooks/example',
      botToken: 'bot-token',
      clientId: '123456789012345678',
      clientSecret: 'client-secret',
      redirectUrl: 'http://localhost:8888/callback/discord',
      accessToken: 'stale-rpc-access-token'
    }
    const db = {
      getAllSettings: vi.fn().mockReturnValue({}),
      getPlatformConfig: vi.fn().mockReturnValue(existingConfig),
      savePlatformConfig: vi.fn()
    } as any
    const tiktokChatSender = { getStatus: vi.fn().mockReturnValue({ isChatReady: false }) } as any
    const manager = new PlatformManager(db, tiktokChatSender)

    ;(manager as any).discordConnector.emit('token-invalidated', { platform: 'discord' })

    expect(db.savePlatformConfig).toHaveBeenCalledOnce()
    const saved = db.savePlatformConfig.mock.calls[0][0]
    expect(saved).toEqual({
      platform: 'discord',
      enabled: false,
      webhookUrl: existingConfig.webhookUrl,
      botToken: existingConfig.botToken,
      clientId: existingConfig.clientId,
      clientSecret: existingConfig.clientSecret,
      redirectUrl: existingConfig.redirectUrl
    })
    expect('accessToken' in saved).toBe(false)
  })
})
