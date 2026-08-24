import { describe, expect, it } from 'vitest'
import type { DiscordConfig } from '../types'
import { prepareDiscordConfigForSave } from './discord-config'

describe('prepareDiscordConfigForSave', () => {
  const existing: DiscordConfig = {
    platform: 'discord',
    enabled: false,
    webhookUrl: 'https://discord.com/api/webhooks/example',
    botToken: 'bot-token',
    clientId: '111111111111111111',
    clientSecret: 'client-secret',
    redirectUrl: 'http://localhost:8888/callback/discord',
    accessToken: 'old-rpc-access-token'
  }

  it('removes only the app-bound RPC token when the client ID changes', () => {
    const incoming: DiscordConfig = {
      ...existing,
      enabled: true,
      clientId: '222222222222222222'
    }

    const prepared = prepareDiscordConfigForSave(existing, incoming)
    const { accessToken: _discardedAccessToken, ...expected } = incoming

    expect(prepared).toEqual(expected)
    expect('accessToken' in prepared).toBe(false)
    expect(prepared).toMatchObject({
      webhookUrl: existing.webhookUrl,
      botToken: existing.botToken,
      clientSecret: existing.clientSecret
    })
    expect(existing.accessToken).toBe('old-rpc-access-token')
  })

  it('keeps the RPC token for an ordinary reconnect with the same client ID', () => {
    const { accessToken: _omittedAccessToken, ...savedFields } = existing
    const incoming = { ...savedFields, enabled: true, clientId: ` ${existing.clientId} ` }

    expect(prepareDiscordConfigForSave(existing, incoming)).toEqual({
      ...incoming,
      accessToken: existing.accessToken
    })
  })
})
