import { describe, expect, it } from 'vitest'
import { OfficialTikTokOAuthClient } from './tiktok-oauth-client.js'

describe('OfficialTikTokOAuthClient', () => {
  it('uses TikTok OAuth v2 form encoding with the desktop PKCE verifier', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input), init })
      return new Response(JSON.stringify({
        access_token: 'access',
        refresh_token: 'refresh',
        open_id: 'open-id',
        scope: 'user.info.basic',
        expires_in: 86400,
        refresh_expires_in: 31536000
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as typeof fetch
    const client = new OfficialTikTokOAuthClient(
      'client-key',
      'client-secret',
      fetchImpl,
      () => 1000
    )

    await client.exchangeAuthorizationCode({
      code: 'authorization-code',
      codeVerifier: 'verifier',
      redirectUri: 'http://127.0.0.1:8792/callback/'
    })

    const { url, init } = requests[0]
    expect(url).toBe('https://open.tiktokapis.com/v2/oauth/token/')
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/x-www-form-urlencoded' })
    expect(String(init?.body)).toContain('grant_type=authorization_code')
    expect(String(init?.body)).toContain('code_verifier=verifier')
    expect(String(init?.body)).toContain('client_secret=client-secret')
  })
})
