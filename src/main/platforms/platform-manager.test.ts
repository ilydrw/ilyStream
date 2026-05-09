import { describe, expect, it } from 'vitest'
import type { ConnectorError } from './base-connector'
import { PlatformManager } from './platform-manager'

describe('PlatformManager', () => {
  it('re-emits connector validation failures without triggering an unhandled error event', async () => {
    const manager = new PlatformManager()
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
})
