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

  it('keeps checking an offline channel after the normal retry budget is exhausted', async () => {
    vi.useFakeTimers()
    const connector = new EventuallyLiveConnector(4)
    const reconnectFailures: Platform[] = []
    connector.setMaxReconnectAttempts(2)
    connector.on('reconnect-failed', (platform) => reconnectFailures.push(platform))

    await connector.connect({ platform: 'tiktok', enabled: true, username: 'offline_creator' })

    await vi.advanceTimersByTimeAsync(15_000)
    await vi.advanceTimersByTimeAsync(15_000)
    await vi.advanceTimersByTimeAsync(15_000)

    expect(connector.connectAttempts).toBe(4)
    expect(connector.status).toBe('connected')
    expect(reconnectFailures).toHaveLength(0)
  })

  it('can immediately retry a waiting channel when live output starts', async () => {
    vi.useFakeTimers()
    const connector = new EventuallyLiveConnector(2)

    await connector.connect({ platform: 'tiktok', enabled: true, username: 'offline_creator' })
    await expect(connector.retryWaitingNow()).resolves.toBe(true)

    expect(connector.connectAttempts).toBe(2)
    expect(connector.status).toBe('connected')
    await vi.advanceTimersByTimeAsync(15_000)
    expect(connector.connectAttempts).toBe(2)
  })

  it('does not become connected when disconnected during an immediate retry', async () => {
    vi.useFakeTimers()
    const connector = new DeferredLiveConnector()

    await connector.connect({ platform: 'tiktok', enabled: true, username: 'offline_creator' })
    const retry = connector.retryWaitingNow()
    await Promise.resolve()
    await connector.disconnect()
    connector.finishConnection()
    await retry

    expect(connector.status).toBe('disconnected')
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

class EventuallyLiveConnector extends BaseConnector {
  readonly platform: Platform = 'tiktok'
  connectAttempts = 0

  constructor(private readonly liveOnAttempt: number) {
    super()
  }

  validateConfig(_config: PlatformConfig): string | null {
    return null
  }

  protected async doConnect(_config: PlatformConfig): Promise<void> {
    this.connectAttempts += 1
    if (this.connectAttempts < this.liveOnAttempt) {
      throw new ConnectorOfflineError('not live yet')
    }
  }

  protected async doDisconnect(): Promise<void> {}
}

class DeferredLiveConnector extends BaseConnector {
  readonly platform: Platform = 'tiktok'
  private connectAttempts = 0
  private resolveConnection: (() => void) | null = null

  validateConfig(_config: PlatformConfig): string | null {
    return null
  }

  protected async doConnect(_config: PlatformConfig): Promise<void> {
    this.connectAttempts += 1
    if (this.connectAttempts === 1) throw new ConnectorOfflineError('not live yet')
    await new Promise<void>((resolve) => {
      this.resolveConnection = resolve
    })
  }

  protected async doDisconnect(): Promise<void> {}

  finishConnection(): void {
    this.resolveConnection?.()
  }
}
