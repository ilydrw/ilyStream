import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BaseConnector,
  ConnectorFatalError,
  ConnectorOfflineError,
  formatConnectorErrorMessage
} from './base-connector'
import type { Platform, PlatformConfig } from './types'

describe('formatConnectorErrorMessage', () => {
  it('keeps normal Error messages readable', () => {
    expect(formatConnectorErrorMessage(new Error('connection failed'))).toBe('connection failed')
  })

  it('extracts common message fields from plain connector error objects', () => {
    expect(formatConnectorErrorMessage({ message: 'room unavailable', code: 404 })).toBe('room unavailable')
    expect(formatConnectorErrorMessage({ error: 'rate limited', status: 429 })).toBe('rate limited')
    expect(formatConnectorErrorMessage({ code: 403, detail: 'blocked' })).toBe('403')
  })

  it('serializes plain objects instead of logging [object Object]', () => {
    expect(formatConnectorErrorMessage({ detail: 'cloudflare', retryable: true })).toBe(
      '{"detail":"cloudflare","retryable":true}'
    )
  })
})

describe('BaseConnector reconnect policy', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not auto-reconnect after a fatal connector error', async () => {
    vi.useFakeTimers()
    const connector = new FatalConnectConnector()
    const errors: unknown[] = []
    connector.on('error', (error) => errors.push(error))

    await expect(
      connector.connect({ platform: 'twitch', enabled: true, clientId: '', clientSecret: '', channel: '' })
    ).rejects.toThrow('reauthorize required')

    await vi.advanceTimersByTimeAsync(5_000)

    expect(connector.connectAttempts).toBe(1)
    expect(errors[0]).toEqual(expect.objectContaining({ recoverable: false }))
  })

  it('treats an offline error as a calm waiting state instead of a failure', async () => {
    vi.useFakeTimers()
    const connector = new OfflineConnector()
    const errors: unknown[] = []
    const reconnects: any[] = []
    connector.on('error', (error) => errors.push(error))
    connector.on('reconnecting', (data) => reconnects.push(data))

    // Resolves rather than rejecting: "not live yet" keeps the platform enabled.
    await expect(
      connector.connect({ platform: 'tiktok', enabled: true, username: 'offline_creator' })
    ).resolves.toBeUndefined()

    expect(connector.status).toBe('connecting')
    expect(errors).toHaveLength(0)
    expect(reconnects[0]).toEqual(
      expect.objectContaining({ platform: 'tiktok', reason: 'not live yet' })
    )
  })
})

class OfflineConnector extends BaseConnector {
  readonly platform: Platform = 'tiktok'

  validateConfig(_config: PlatformConfig): string | null {
    return null
  }

  protected async doConnect(_config: PlatformConfig): Promise<void> {
    throw new ConnectorOfflineError('not live yet')
  }

  protected async doDisconnect(): Promise<void> {}
}

class FatalConnectConnector extends BaseConnector {
  readonly platform: Platform = 'twitch'
  connectAttempts = 0

  validateConfig(_config: PlatformConfig): string | null {
    return null
  }

  protected async doConnect(_config: PlatformConfig): Promise<void> {
    this.connectAttempts += 1
    throw new ConnectorFatalError('reauthorize required')
  }

  protected async doDisconnect(): Promise<void> {}
}
