import { describe, expect, it, vi } from 'vitest'
import { buildKickAuthorizeUrl, KICK_REDIRECT_URI } from './kick-user-auth'

vi.mock('electron', () => ({
  shell: { openExternal: vi.fn() }
}))

describe('Kick user authorization', () => {
  it('preserves a 127.0.0.1 callback with Kick’s documented redirect workaround', () => {
    const authorizeUrl = buildKickAuthorizeUrl({
      clientId: 'client-id',
      state: 'csrf-state',
      codeChallenge: 'pkce-challenge'
    })
    const url = new URL(authorizeUrl)

    expect(url.origin + url.pathname).toBe('https://id.kick.com/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe('client-id')
    expect(url.searchParams.get('redirect')).toBe('127.0.0.1')
    expect(url.searchParams.get('redirect_uri')).toBe(KICK_REDIRECT_URI)
    expect(url.searchParams.get('scope')).toBe('user:read channel:read channel:write events:subscribe')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBe('pkce-challenge')
    expect(url.searchParams.get('state')).toBe('csrf-state')
    expect(url.search).toContain(
      `redirect=127.0.0.1&redirect_uri=${encodeURIComponent(KICK_REDIRECT_URI)}`
    )
  })
})
