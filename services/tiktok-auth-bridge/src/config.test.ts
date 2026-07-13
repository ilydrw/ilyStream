import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { loadTikTokBridgeConfig } from './config.js'

const requiredEnvironment = {
  TIKTOK_CLIENT_KEY: 'test-client-key',
  TIKTOK_CLIENT_SECRET: 'test-client-secret',
  TIKTOK_BRIDGE_ENCRYPTION_KEY: randomBytes(32).toString('base64')
}

describe('loadTikTokBridgeConfig', () => {
  it('uses local-only defaults outside a hosting platform', () => {
    const config = loadTikTokBridgeConfig(requiredEnvironment)

    expect(config.host).toBe('127.0.0.1')
    expect(config.port).toBe(8787)
  })

  it('binds to the platform port on all interfaces when PORT is present', () => {
    const config = loadTikTokBridgeConfig({ ...requiredEnvironment, PORT: '4321' })

    expect(config.host).toBe('0.0.0.0')
    expect(config.port).toBe(4321)
  })

  it('allows explicit bridge host and port overrides', () => {
    const config = loadTikTokBridgeConfig({
      ...requiredEnvironment,
      PORT: '4321',
      TIKTOK_BRIDGE_HOST: '::',
      TIKTOK_BRIDGE_PORT: '9876'
    })

    expect(config.host).toBe('::')
    expect(config.port).toBe(9876)
  })
})
