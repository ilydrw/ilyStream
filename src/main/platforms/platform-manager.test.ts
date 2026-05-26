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
})
