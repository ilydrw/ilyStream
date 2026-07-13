import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  BridgeHttpError,
  type StoredTikTokSession,
  type TikTokLiveDestination,
  type TikTokLiveProvider,
  type TikTokOAuthClient,
  type TikTokSessionStore,
  type TikTokTokenBundle
} from './types.js'

const ACCESS_REFRESH_WINDOW_MS = 10 * 60 * 1000
const REQUIRED_SCOPE = 'user.info.basic'

export interface TikTokAuthBridgeOptions {
  clientKey: string
  redirectUri: string
  desktopSessionTtlMs: number
  oauthClient: TikTokOAuthClient
  sessionStore: TikTokSessionStore
  liveProvider: TikTokLiveProvider
  now?: () => number
  logger?: Pick<Console, 'warn'>
}

export class TikTokAuthBridge {
  private readonly now: () => number
  private readonly logger: Pick<Console, 'warn'>
  private readonly refreshes = new Map<string, Promise<StoredTikTokSession>>()

  constructor(private readonly options: TikTokAuthBridgeOptions) {
    this.now = options.now || Date.now
    this.logger = options.logger || console
  }

  async exchangeAuthorizationCode(input: {
    clientKey?: unknown
    code?: unknown
    codeVerifier?: unknown
    redirectUri?: unknown
  }): Promise<{
    desktopAccessToken: string
    account: StoredTikTokSession['account']
    liveAccess: string
    message?: string
  }> {
    const clientKey = requiredString(input.clientKey, 'clientKey', 256)
    if (!safeStringEqual(clientKey, this.options.clientKey)) {
      throw new BridgeHttpError(400, 'invalid_client_key', 'The TikTok client key is invalid.')
    }

    const redirectUri = requiredString(input.redirectUri, 'redirectUri', 2048)
    if (redirectUri !== this.options.redirectUri) {
      throw new BridgeHttpError(400, 'invalid_redirect_uri', 'The TikTok redirect URI is invalid.')
    }

    const code = requiredString(input.code, 'code', 4096)
    const codeVerifier = requiredString(input.codeVerifier, 'codeVerifier', 128)
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier)) {
      throw new BridgeHttpError(400, 'invalid_code_verifier', 'The PKCE code verifier is invalid.')
    }

    const tokens = await this.options.oauthClient.exchangeAuthorizationCode({
      code,
      codeVerifier,
      redirectUri
    })
    assertRequiredScope(tokens.scope)
    const account = await this.options.oauthClient.getBasicUser(tokens.accessToken)
    if (account.openId !== tokens.openId) {
      throw new Error('TikTok token and profile responses returned different open IDs.')
    }

    const createdAt = this.now()
    const session: StoredTikTokSession = {
      account,
      tokens,
      createdAt,
      expiresAt: Math.min(tokens.refreshExpiresAt, createdAt + this.options.desktopSessionTtlMs)
    }
    const desktopAccessToken = randomBytes(32).toString('base64url')
    await this.options.sessionStore.set(hashDesktopToken(desktopAccessToken), session)
    const liveStatus = await this.options.liveProvider.getAccess(account)
    return {
      desktopAccessToken,
      account,
      liveAccess: liveStatus.access,
      message: liveStatus.message
    }
  }

  async getSession(desktopAccessToken: string): Promise<{
    account: StoredTikTokSession['account']
    liveAccess: string
    message?: string
  }> {
    const { session } = await this.getActiveSession(desktopAccessToken)
    const liveStatus = await this.options.liveProvider.getAccess(session.account)
    return {
      account: session.account,
      liveAccess: liveStatus.access,
      message: liveStatus.message
    }
  }

  async disconnect(desktopAccessToken: string): Promise<void> {
    const tokenHash = hashDesktopToken(desktopAccessToken)
    const session = await this.options.sessionStore.get(tokenHash)
    if (!session) return

    try {
      await this.options.oauthClient.revokeAccessToken(session.tokens.accessToken)
    } catch (error) {
      this.logger.warn('[tiktok-bridge] TikTok token revocation failed; deleting local session.', error)
    } finally {
      await this.options.sessionStore.delete(tokenHash)
    }
  }

  async prepareLive(
    desktopAccessToken: string,
    input: { title?: unknown; orientation?: unknown }
  ): Promise<TikTokLiveDestination> {
    const { session } = await this.getActiveSession(desktopAccessToken)
    const orientation = optionalOrientation(input.orientation)
    const title = optionalString(input.title, 150)
    return this.options.liveProvider.prepare(session, { title, orientation })
  }

  async completeLive(desktopAccessToken: string): Promise<void> {
    const { session } = await this.getActiveSession(desktopAccessToken)
    await this.options.liveProvider.complete(session)
  }

  private async getActiveSession(desktopAccessToken: string): Promise<{
    tokenHash: string
    session: StoredTikTokSession
  }> {
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(desktopAccessToken)) {
      throw unauthorized()
    }
    const tokenHash = hashDesktopToken(desktopAccessToken)
    let session = await this.options.sessionStore.get(tokenHash)
    if (!session || session.expiresAt <= this.now() || session.tokens.refreshExpiresAt <= this.now()) {
      if (session) await this.options.sessionStore.delete(tokenHash)
      throw unauthorized()
    }

    if (session.tokens.accessExpiresAt - this.now() <= ACCESS_REFRESH_WINDOW_MS) {
      session = await this.refreshSessionOnce(tokenHash, session)
    }
    return { tokenHash, session }
  }

  private refreshSessionOnce(
    tokenHash: string,
    session: StoredTikTokSession
  ): Promise<StoredTikTokSession> {
    const existing = this.refreshes.get(tokenHash)
    if (existing) return existing

    const refresh = this.refreshSession(tokenHash, session).finally(() => {
      if (this.refreshes.get(tokenHash) === refresh) this.refreshes.delete(tokenHash)
    })
    this.refreshes.set(tokenHash, refresh)
    return refresh
  }

  private async refreshSession(
    tokenHash: string,
    session: StoredTikTokSession
  ): Promise<StoredTikTokSession> {
    let tokens: TikTokTokenBundle
    try {
      tokens = await this.options.oauthClient.refreshAccessToken(session.tokens.refreshToken)
    } catch (error) {
      await this.options.sessionStore.delete(tokenHash)
      throw new BridgeHttpError(
        401,
        'reauthorization_required',
        'TikTok authorization expired. Connect TikTok again.'
      )
    }
    assertRequiredScope(tokens.scope)
    if (tokens.openId !== session.account.openId) {
      await this.options.sessionStore.delete(tokenHash)
      throw new Error('TikTok refreshed credentials for a different account.')
    }

    const updated: StoredTikTokSession = {
      ...session,
      tokens,
      expiresAt: Math.min(session.expiresAt, tokens.refreshExpiresAt)
    }
    await this.options.sessionStore.set(tokenHash, updated)
    return updated
  }
}

export function hashDesktopToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

function assertRequiredScope(scope: string): void {
  const scopes = new Set(scope.split(',').map((value) => value.trim()).filter(Boolean))
  if (!scopes.has(REQUIRED_SCOPE)) {
    throw new BridgeHttpError(
      403,
      'missing_scope',
      'TikTok authorization did not grant user.info.basic.'
    )
  }
}

function safeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.byteLength === rightBuffer.byteLength && timingSafeEqual(leftBuffer, rightBuffer)
}

function requiredString(value: unknown, field: string, maxLength: number): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text || text.length > maxLength) {
    throw new BridgeHttpError(400, 'invalid_request', `${field} is required and must be valid.`)
  }
  return text
}

function optionalString(value: unknown, maxLength: number): string | undefined {
  if (value == null || value === '') return undefined
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text || text.length > maxLength) {
    throw new BridgeHttpError(400, 'invalid_request', 'The LIVE title is invalid.')
  }
  return text
}

function optionalOrientation(value: unknown): 'portrait' | 'landscape' | undefined {
  if (value == null || value === '') return undefined
  if (value === 'portrait' || value === 'landscape') return value
  throw new BridgeHttpError(400, 'invalid_request', 'The LIVE orientation is invalid.')
}

function unauthorized(): BridgeHttpError {
  return new BridgeHttpError(401, 'invalid_session', 'Connect TikTok again.')
}
