import { BridgeHttpError } from './types.js'

const TOKEN_URL = 'https://id.kick.com/oauth/token'
const REQUEST_TIMEOUT_MS = 15_000
const PKCE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/

export interface KickTokenBundle {
  accessToken: string
  refreshToken: string
  expiresIn: number
  scope: string
  tokenType: string
}

export interface KickOAuthBroker {
  exchangeAuthorizationCode(input: Record<string, unknown>): Promise<KickTokenBundle>
  refreshAccessToken(input: Record<string, unknown>): Promise<KickTokenBundle>
}

interface KickTokenResponse {
  access_token?: unknown
  refresh_token?: unknown
  expires_in?: unknown
  scope?: unknown
  token_type?: unknown
  error?: unknown
}

export class OfficialKickOAuthClient implements KickOAuthBroker {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly redirectUri: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async exchangeAuthorizationCode(input: Record<string, unknown>): Promise<KickTokenBundle> {
    assertExactFields(input, ['code', 'codeVerifier', 'redirectUri'])
    const code = requiredCredential(input.code, 'code', 4096)
    const codeVerifier = requiredCredential(input.codeVerifier, 'codeVerifier', 128)
    if (!PKCE_VERIFIER_PATTERN.test(codeVerifier)) {
      throw new BridgeHttpError(
        400,
        'invalid_code_verifier',
        'codeVerifier must be a valid 43 to 128 character PKCE verifier.'
      )
    }

    const redirectUri = requiredString(input.redirectUri, 'redirectUri', 2048)
    if (redirectUri !== this.redirectUri) {
      throw new BridgeHttpError(
        400,
        'invalid_redirect_uri',
        'redirectUri does not match the registered Kick redirect URI.'
      )
    }

    return this.requestToken(
      {
        grant_type: 'authorization_code',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        code_verifier: codeVerifier,
        redirect_uri: this.redirectUri
      },
      'exchange'
    )
  }

  async refreshAccessToken(input: Record<string, unknown>): Promise<KickTokenBundle> {
    assertExactFields(input, ['refreshToken'])
    const refreshToken = requiredCredential(input.refreshToken, 'refreshToken', 8192)
    return this.requestToken(
      {
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken
      },
      'refresh',
      refreshToken
    )
  }

  private async requestToken(
    parameters: Record<string, string>,
    operation: 'exchange' | 'refresh',
    fallbackRefreshToken?: string
  ): Promise<KickTokenBundle> {
    let response: Response
    try {
      response = await this.fetchImpl(TOKEN_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams(parameters),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      })
    } catch (error) {
      if (isTimeoutError(error)) {
        throw new BridgeHttpError(504, 'kick_timeout', 'Kick did not respond in time. Try again.')
      }
      throw new BridgeHttpError(
        502,
        'kick_unavailable',
        'Kick could not be reached. Check your connection and try again.'
      )
    }

    const body = await readResponse(response)
    if (!response.ok || typeof body.error === 'string') {
      throw kickResponseError(operation, response.status)
    }

    const accessToken = responseCredential(body.access_token, 'access token')
    const returnedRefreshToken = optionalResponseCredential(body.refresh_token, 'refresh token')
    const refreshToken = returnedRefreshToken || fallbackRefreshToken
    const expiresIn = positiveInteger(body.expires_in)
    const scope = optionalResponseString(body.scope, 'scope')
    const tokenType = requiredResponseString(body.token_type, 'token type', 64)
    if (!refreshToken || !expiresIn) {
      throw invalidKickResponse()
    }

    return { accessToken, refreshToken, expiresIn, scope, tokenType }
  }
}

function assertExactFields(input: Record<string, unknown>, allowedFields: readonly string[]): void {
  const allowed = new Set(allowedFields)
  if (Object.keys(input).some((field) => !allowed.has(field))) {
    throw new BridgeHttpError(400, 'invalid_request', 'The request contains an unexpected field.')
  }
}

function requiredString(value: unknown, field: string, maxLength: number): string {
  const text = typeof value === 'string' ? value : ''
  if (!text || text !== text.trim() || text.length > maxLength || hasControlCharacters(text)) {
    throw new BridgeHttpError(400, 'invalid_request', `${field} is required and must be valid.`)
  }
  return text
}

function requiredCredential(value: unknown, field: string, maxLength: number): string {
  const text = requiredString(value, field, maxLength)
  if (/\s/.test(text)) {
    throw new BridgeHttpError(400, 'invalid_request', `${field} is required and must be valid.`)
  }
  return text
}

function hasControlCharacters(value: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(value)
}

function responseCredential(value: unknown, name: string): string {
  const token = optionalResponseCredential(value, name)
  if (!token) throw invalidKickResponse()
  return token
}

function optionalResponseCredential(value: unknown, name: string): string | undefined {
  if (value == null || value === '') return undefined
  const token = typeof value === 'string' ? value : ''
  if (!token || token.length > 8192 || /\s/.test(token) || hasControlCharacters(token)) {
    throw new BridgeHttpError(502, 'invalid_kick_response', `Kick returned an invalid ${name}.`)
  }
  return token
}

function requiredResponseString(value: unknown, name: string, maxLength: number): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text || text.length > maxLength || hasControlCharacters(text)) throw invalidKickResponse()
  return text
}

function optionalResponseString(value: unknown, name: string): string {
  if (value == null || value === '') return ''
  if (typeof value !== 'string' || value.length > 4096 || hasControlCharacters(value)) {
    throw new BridgeHttpError(502, 'invalid_kick_response', `Kick returned an invalid ${name}.`)
  }
  return value.trim()
}

function positiveInteger(value: unknown): number | undefined {
  const number = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN
  return Number.isSafeInteger(number) && number > 0 ? number : undefined
}

async function readResponse(response: Response): Promise<KickTokenResponse> {
  try {
    const body = await response.json() as unknown
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as KickTokenResponse
      : {}
  } catch {
    if (response.ok) throw invalidKickResponse()
    return {}
  }
}

function kickResponseError(operation: 'exchange' | 'refresh', status: number): BridgeHttpError {
  if (status === 429) {
    return new BridgeHttpError(429, 'kick_rate_limited', 'Kick is receiving too many requests. Try again shortly.')
  }
  if (status >= 500) {
    return new BridgeHttpError(502, 'kick_unavailable', 'Kick is temporarily unavailable. Try again.')
  }
  if (operation === 'refresh') {
    return new BridgeHttpError(
      401,
      'reauthorization_required',
      'Kick authorization expired. Connect Kick again.'
    )
  }
  return new BridgeHttpError(
    400,
    'kick_authorization_rejected',
    'Kick rejected the authorization code. Start the connection again.'
  )
}

function invalidKickResponse(): BridgeHttpError {
  return new BridgeHttpError(
    502,
    'invalid_kick_response',
    'Kick returned an incomplete token response. Try again.'
  )
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
}
