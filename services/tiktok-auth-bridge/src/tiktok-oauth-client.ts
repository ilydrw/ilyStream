import type { TikTokAccount, TikTokOAuthClient, TikTokTokenBundle } from './types.js'

const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/'
const REVOKE_URL = 'https://open.tiktokapis.com/v2/oauth/revoke/'
const USER_INFO_URL =
  'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url'
const REQUEST_TIMEOUT_MS = 15_000

interface TikTokTokenResponse {
  access_token?: string
  refresh_token?: string
  open_id?: string
  scope?: string
  expires_in?: number
  refresh_expires_in?: number
  error?: string
  error_description?: string
  log_id?: string
}

export class OfficialTikTokOAuthClient implements TikTokOAuthClient {
  constructor(
    private readonly clientKey: string,
    private readonly clientSecret: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now
  ) {}

  exchangeAuthorizationCode(input: {
    code: string
    codeVerifier: string
    redirectUri: string
  }): Promise<TikTokTokenBundle> {
    return this.requestToken({
      client_key: this.clientKey,
      client_secret: this.clientSecret,
      code: input.code,
      code_verifier: input.codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: input.redirectUri
    })
  }

  refreshAccessToken(refreshToken: string): Promise<TikTokTokenBundle> {
    return this.requestToken({
      client_key: this.clientKey,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  }

  async revokeAccessToken(accessToken: string): Promise<void> {
    const response = await this.fetchImpl(REVOKE_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_key: this.clientKey,
        client_secret: this.clientSecret,
        token: accessToken
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    const body = await response.json().catch(() => ({})) as TikTokTokenResponse
    if (!response.ok || body.error) throw tikTokRequestError('revoke access', response.status, body)
  }

  async getBasicUser(accessToken: string): Promise<TikTokAccount> {
    const response = await this.fetchImpl(USER_INFO_URL, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    const body = await response.json().catch(() => ({})) as {
      data?: { user?: { open_id?: string; display_name?: string; avatar_url?: string } }
      error?: { code?: string; message?: string; log_id?: string }
    }
    const apiError = body.error
    if (!response.ok || (apiError?.code && apiError.code !== 'ok')) {
      const detail = apiError?.message || apiError?.code || `HTTP ${response.status}`
      throw new Error(`TikTok user info request failed: ${detail}`)
    }

    const user = body.data?.user
    const openId = String(user?.open_id || '').trim()
    const displayName = String(user?.display_name || '').trim()
    if (!openId || !displayName) {
      throw new Error('TikTok user info response did not include an open ID and display name.')
    }
    const avatarUrl = String(user?.avatar_url || '').trim()
    return { openId, displayName, avatarUrl: avatarUrl || undefined }
  }

  private async requestToken(parameters: Record<string, string>): Promise<TikTokTokenBundle> {
    const response = await this.fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(parameters),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    const body = await response.json().catch(() => ({})) as TikTokTokenResponse
    if (!response.ok || body.error) throw tikTokRequestError('manage access tokens', response.status, body)

    const accessToken = String(body.access_token || '').trim()
    const refreshToken = String(body.refresh_token || '').trim()
    const openId = String(body.open_id || '').trim()
    const accessLifetime = positiveSeconds(body.expires_in)
    const refreshLifetime = positiveSeconds(body.refresh_expires_in)
    if (!accessToken || !refreshToken || !openId || !accessLifetime || !refreshLifetime) {
      throw new Error('TikTok token response was missing required credentials or expiry values.')
    }

    const issuedAt = this.now()
    return {
      accessToken,
      refreshToken,
      openId,
      scope: String(body.scope || '').trim(),
      accessExpiresAt: issuedAt + accessLifetime * 1000,
      refreshExpiresAt: issuedAt + refreshLifetime * 1000
    }
  }
}

function positiveSeconds(value: unknown): number | undefined {
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined
}

function tikTokRequestError(
  operation: string,
  status: number,
  body: TikTokTokenResponse
): Error {
  const detail = String(body.error_description || body.error || '').trim() || `HTTP ${status}`
  return new Error(`TikTok could not ${operation}: ${detail}`)
}
