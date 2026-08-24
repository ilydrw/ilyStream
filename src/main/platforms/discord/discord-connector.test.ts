import { EventEmitter } from 'events'
import { describe, expect, it, vi } from 'vitest'
import { DiscordConnector, type DiscordRpcClient } from './discord-connector'

class FakeDiscordRpcClient extends EventEmitter {
  user = { id: 'host-id', username: 'host', avatar: 'host-avatar' }
  requests: Array<{ command: string; args?: Record<string, unknown> }> = []
  subscriptions: Array<{ event: string; channelId?: string }> = []
  unsubscribed: string[] = []
  destroy = vi.fn(async () => undefined)
  login = vi.fn(async () => undefined)
  authenticateErrors: unknown[] = []
  authorizeError: unknown = null

  async request<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    this.requests.push({ command, args })
    if (command === 'AUTHORIZE') {
      if (this.authorizeError) throw this.authorizeError
      return { code: 'authorization-code' } as T
    }
    if (command === 'AUTHENTICATE') {
      const error = this.authenticateErrors.shift()
      if (error) throw error
      return {} as T
    }
    if (command === 'GET_SELECTED_VOICE_CHANNEL') {
      return {
        id: 'voice-1',
        name: 'Stream Room',
        guild_id: 'guild-1',
        voice_states: [
          {
            user: { id: 'host-id', username: 'host', avatar: 'host-avatar' },
            voice_state: { self_mute: false, self_deaf: false }
          },
          {
            user: { id: 'guest-id', username: 'guest', global_name: 'Guest Display', avatar: 'a_guest-avatar' },
            voice_state: { self_mute: true, self_deaf: false }
          }
        ]
      } as T
    }
    throw new Error(`Unexpected request: ${command}`)
  }

  async subscribe(event: string, args?: { channel_id?: string }) {
    this.subscriptions.push({ event, channelId: args?.channel_id })
    return {
      unsubscribe: async () => { this.unsubscribed.push(args?.channel_id ? `${event}:${args.channel_id}` : event) }
    }
  }
}

describe('DiscordConnector', () => {
  it('hydrates the selected call and applies speaking events without a full refresh', async () => {
    const client = new FakeDiscordRpcClient()
    const connector = new DiscordConnector(() => client as unknown as DiscordRpcClient)

    await connector.connect({
      platform: 'discord',
      enabled: true,
      webhookUrl: '',
      clientId: '123456789012345678',
      clientSecret: 'a'.repeat(32),
      redirectUrl: 'http://localhost:8888/callback/discord',
      accessToken: 'saved-access-token'
    })

    const initial = connector.getCallState()
    expect(initial.connectionPhase).toBe('connected')
    expect(initial.channelName).toBe('Stream Room')
    expect(initial.participants).toHaveLength(2)
    expect(initial.participants[0]).toMatchObject({
      id: 'host-id',
      isCurrentUser: true,
      isMuted: false
    })
    expect(initial.participants[1]).toMatchObject({
      id: 'guest-id',
      username: 'Guest Display',
      isMuted: true
    })
    expect(initial.participants[1].avatarUrl).toContain('.gif?size=256')
    expect(client.subscriptions).toContainEqual({ event: 'SPEAKING_START', channelId: 'voice-1' })

    client.emit('SPEAKING_START', { user_id: 'guest-id' })
    expect(connector.getCallState().participants.find((participant) => participant.id === 'guest-id')?.isSpeaking).toBe(true)

    client.emit('SPEAKING_STOP', { user_id: 'guest-id' })
    expect(connector.getCallState().participants.find((participant) => participant.id === 'guest-id')?.isSpeaking).toBe(false)

    await connector.disconnect()
    expect(connector.getCallState().isConnected).toBe(false)
    expect(client.destroy).toHaveBeenCalledOnce()
  })

  it('rejects non-local OAuth redirect URLs before opening Discord', () => {
    const connector = new DiscordConnector()
    expect(connector.validateConfig({
      platform: 'discord',
      enabled: true,
      webhookUrl: '',
      clientId: '123456789012345678',
      clientSecret: 'a'.repeat(32),
      redirectUrl: 'https://example.com/callback'
    })).toBe('Discord Redirect URL must use HTTP on localhost.')
  })

  it('uses approved-app authorization and the redirect URL for the code exchange', async () => {
    const redirectUrl = 'http://localhost:8888/callback/discord'
    const client = new FakeDiscordRpcClient()
    const connector = new DiscordConnector(() => client as unknown as DiscordRpcClient)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'fresh-access-token' })
    } as Response)

    try {
      await connector.connect({
        platform: 'discord',
        enabled: true,
        webhookUrl: '',
        clientId: '123456789012345678',
        clientSecret: 'a'.repeat(32),
        redirectUrl
      })

      expect(client.requests).toContainEqual({
        command: 'AUTHORIZE',
        args: {
          client_id: '123456789012345678',
          scopes: ['rpc.voice.read', 'rpc'],
          prompt: 'consent'
        }
      })

      expect(fetchMock.mock.calls[0]?.[0]).toBe('https://discord.com/api/oauth2/token')
      const tokenRequest = fetchMock.mock.calls[0]?.[1]
      expect(tokenRequest?.body).toBeInstanceOf(URLSearchParams)
      expect((tokenRequest?.body as URLSearchParams).get('redirect_uri')).toBe(redirectUrl)
    } finally {
      await connector.disconnect()
      fetchMock.mockRestore()
    }
  })

  it('invalidates an app-mismatched saved token and authorizes a fresh token', async () => {
    const client = new FakeDiscordRpcClient()
    client.authenticateErrors.push(new Error("Application does not match the connection's"))
    const connector = new DiscordConnector(() => client as unknown as DiscordRpcClient)
    const tokenInvalidated = vi.fn()
    const tokenRefreshed = vi.fn()
    const tokenEvents: string[] = []
    connector.on('token-invalidated', (data) => {
      tokenEvents.push('invalidated')
      tokenInvalidated(data)
    })
    connector.on('token-refresh', (data) => {
      tokenEvents.push('refreshed')
      tokenRefreshed(data)
    })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'fresh-access-token' })
    } as Response)

    try {
      await connector.connect({
        platform: 'discord',
        enabled: true,
        webhookUrl: '',
        clientId: '123456789012345678',
        clientSecret: 'a'.repeat(32),
        redirectUrl: 'http://localhost:8888/callback/discord',
        accessToken: 'token-from-a-different-application'
      })

      expect(client.requests
        .filter(({ command }) => command === 'AUTHENTICATE' || command === 'AUTHORIZE')
      ).toEqual([
        {
          command: 'AUTHENTICATE',
          args: { access_token: 'token-from-a-different-application' }
        },
        {
          command: 'AUTHORIZE',
          args: {
            client_id: '123456789012345678',
            scopes: ['rpc.voice.read', 'rpc'],
            prompt: 'consent'
          }
        },
        {
          command: 'AUTHENTICATE',
          args: { access_token: 'fresh-access-token' }
        }
      ])
      expect(tokenInvalidated).toHaveBeenCalledOnce()
      expect(tokenInvalidated).toHaveBeenCalledWith({ platform: 'discord' })
      expect(tokenRefreshed).toHaveBeenCalledWith({
        platform: 'discord',
        accessToken: 'fresh-access-token'
      })
      expect(tokenEvents).toEqual(['invalidated', 'refreshed'])
    } finally {
      await connector.disconnect()
      fetchMock.mockRestore()
    }
  })

  it('keeps the stale token invalidated when fresh authorization fails', async () => {
    const client = new FakeDiscordRpcClient()
    client.authenticateErrors.push(Object.assign(
      new Error("Application does not match the connection's"),
      { code: 4007 }
    ))
    client.authorizeError = new Error('Authorization denied')
    const connector = new DiscordConnector(() => client as unknown as DiscordRpcClient)
    connector.setAutoReconnect(false)
    connector.on('error', () => undefined)
    const tokenInvalidated = vi.fn()
    const tokenRefreshed = vi.fn()
    connector.on('token-invalidated', tokenInvalidated)
    connector.on('token-refresh', tokenRefreshed)
    const config = {
      platform: 'discord' as const,
      enabled: true,
      webhookUrl: '',
      clientId: '123456789012345678',
      clientSecret: 'a'.repeat(32),
      redirectUrl: 'http://localhost:8888/callback/discord',
      accessToken: 'token-from-a-different-application'
    }

    try {
      await expect(connector.connect(config)).rejects.toThrow('Authorization denied')

      expect(tokenInvalidated).toHaveBeenCalledOnce()
      expect(tokenRefreshed).not.toHaveBeenCalled()
      expect('accessToken' in config).toBe(false)
    } finally {
      await connector.disconnect()
    }
  })
})
