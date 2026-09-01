import { shell } from 'electron'
import type { AccessTokenWithUserId, AuthProvider } from '@twurple/auth'
import type { TwitchAuthProgress } from '../../../shared/twitch-auth'

const DEVICE_AUTH_URL = 'https://id.twitch.tv/oauth2/device'
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const VALIDATE_URL = 'https://id.twitch.tv/oauth2/validate'
const STREAM_KEY_URL = 'https://api.twitch.tv/helix/streams/key'
const DEFAULT_POLL_INTERVAL_SECONDS = 5
const MAX_TRANSIENT_POLL_INTERVAL_MS = 30_000
const REQUEST_TIMEOUT_MS = 15_000
const HOURLY_VALIDATION_INTERVAL_MS = 60 * 60 * 1000
const TOKEN_EXPIRY_GRACE_MS = 60_000

/**
 * Public Client ID for the ilyStream Twitch developer application. Twitch
 * explicitly treats Client IDs as public; the matching Client Secret must
 * never be shipped with the desktop app.
 */
export const DEFAULT_TWITCH_CLIENT_ID =
  process.env.ILYSTREAM_TWITCH_CLIENT_ID?.trim() || '5m34iwcxhx2v8fwsbnatxjd2eg0nhz'

/** Permissions currently exercised by ilyStream, plus automatic stream setup. */
export const TWITCH_SCOPES = [
  'chat:read',
  'chat:edit',
  'moderator:read:followers',
  'moderator:read:chatters',
  'moderation:read',
  'channel:manage:broadcast',
  'channel:read:stream_key'
] as const

export interface TwitchTokenIdentity {
  clientId: string
  login: string
  userId: string
  scopes: string[]
  expiresIn: number
}

export interface TwitchOAuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
  scopes: string[]
}

export interface TwitchAuthorizationResult extends TwitchOAuthTokens {
  clientId: string
  login: string
  userId: string
  streamKey?: string
  streamKeyError?: string
}

interface TwitchDeviceAuthorization {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresIn: number
  intervalSeconds: number
}

interface TwitchDeviceAuthOptions {
  clientId?: string
  scopes?: readonly string[]
  fetchImpl?: typeof fetch
  openExternal?: (url: string) => Promise<unknown>
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>
  signal?: AbortSignal
  onProgress?: (progress: TwitchAuthProgress) => void
}

interface TwitchPublicAuthProviderOptions {
  clientId: string
  accessToken: string
  refreshToken: string
  userId: string
  scopes: string[]
  expiresIn: number | null
  obtainmentTimestamp?: number
  lastValidatedAt?: number
  fetchImpl?: typeof fetch
  onRefresh?: (token: TwitchOAuthTokens) => void
  onRefreshFailure?: (error: Error) => void
}

class TwitchApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'TwitchApiError'
  }
}

let activeAuth: AbortController | null = null

export async function initiateTwitchAuth(
  options: Omit<TwitchDeviceAuthOptions, 'signal'> = {}
): Promise<TwitchAuthorizationResult> {
  cancelTwitchAuth('Twitch authorization restarted by a new connect attempt.')
  const controller = new AbortController()
  activeAuth = controller

  try {
    return await beginTwitchDeviceAuth({ ...options, signal: controller.signal })
  } finally {
    if (activeAuth === controller) activeAuth = null
  }
}

export function cancelTwitchAuth(reason = 'Twitch authorization canceled.'): boolean {
  if (!activeAuth) return false
  const controller = activeAuth
  activeAuth = null
  controller.abort(new Error(reason))
  return true
}

export async function beginTwitchDeviceAuth(
  options: TwitchDeviceAuthOptions = {}
): Promise<TwitchAuthorizationResult> {
  const clientId = options.clientId?.trim() || DEFAULT_TWITCH_CLIENT_ID
  const scopes = [...(options.scopes ?? TWITCH_SCOPES)]
  const fetchImpl = options.fetchImpl ?? fetch
  const openExternal = options.openExternal ?? ((url: string) => shell.openExternal(url))
  const wait = options.wait ?? waitFor
  const signal = options.signal ?? new AbortController().signal
  const startedAt = Date.now()

  if (!clientId) {
    throw new Error('ilyStream does not have a Twitch Client ID configured for this build.')
  }

  options.onProgress?.({
    phase: 'requesting-code',
    message: 'Requesting a secure sign-in code from Twitch…',
    startedAt
  })

  const device = await requestTwitchDeviceAuthorization(clientId, scopes, fetchImpl, signal)
  const expiresAt = startedAt + device.expiresIn * 1000

  options.onProgress?.({
    phase: 'opening-browser',
    message: 'Opening Twitch in your browser…',
    startedAt,
    expiresAt,
    userCode: device.userCode,
    verificationUri: device.verificationUri
  })
  await openExternal(device.verificationUri)

  options.onProgress?.({
    phase: 'awaiting-consent',
    message: 'Waiting for you to authorize ilyStream on Twitch…',
    startedAt,
    expiresAt,
    userCode: device.userCode,
    verificationUri: device.verificationUri
  })

  const tokens = await pollForTwitchTokens({
    clientId,
    scopes,
    device,
    expiresAt,
    fetchImpl,
    wait,
    signal
  })
  const identity = await validateTwitchAccessToken(tokens.accessToken, clientId, fetchImpl, signal)
  assertRequiredScopes(identity.scopes, scopes)

  let streamKey: string | undefined
  let streamKeyError: string | undefined
  try {
    streamKey = await fetchTwitchStreamKey({
      clientId,
      accessToken: tokens.accessToken,
      broadcasterUserId: identity.userId,
      fetchImpl,
      signal
    })
  } catch (error) {
    streamKeyError = formatTwitchError(error)
  }

  return {
    clientId,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: identity.expiresIn || tokens.expiresIn,
    scopes: identity.scopes,
    login: identity.login,
    userId: identity.userId,
    streamKey,
    streamKeyError
  }
}

export async function requestTwitchDeviceAuthorization(
  clientId: string,
  scopes: readonly string[],
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<TwitchDeviceAuthorization> {
  const response = await fetchWithTimeout(fetchImpl, DEVICE_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      scopes: scopes.join(' ')
    }).toString(),
  }, signal)
  const data = await readJson(response)

  if (!response.ok) {
    throw new TwitchApiError(
      `Twitch could not start authorization (${response.status}): ${readApiMessage(data, 'unknown error')}`,
      response.status
    )
  }

  const deviceCode = readString(data.device_code)
  const userCode = readString(data.user_code)
  const verificationUri = readString(data.verification_uri)
  const expiresIn = readPositiveNumber(data.expires_in)
  const intervalSeconds = readPositiveNumber(data.interval) || DEFAULT_POLL_INTERVAL_SECONDS

  if (!deviceCode || !userCode || !verificationUri || !expiresIn) {
    throw new Error('Twitch returned an incomplete device authorization response. Try again.')
  }

  const verificationUrl = new URL(verificationUri)
  if (verificationUrl.protocol !== 'https:' || verificationUrl.hostname !== 'www.twitch.tv') {
    throw new Error('Twitch returned an unexpected authorization address. Try again.')
  }

  return { deviceCode, userCode, verificationUri, expiresIn, intervalSeconds }
}

export async function refreshTwitchAccessToken(
  clientId: string,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<TwitchOAuthTokens> {
  const response = await fetchWithTimeout(fetchImpl, TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }).toString(),
  }, signal)
  const data = await readJson(response)

  if (!response.ok) {
    throw new TwitchApiError(
      `Twitch session refresh failed (${response.status}): ${readApiMessage(data, 'reconnect your Twitch account')}`,
      response.status
    )
  }

  return parseTokenResponse(data, 'Twitch refresh')
}

export async function validateTwitchAccessToken(
  accessToken: string,
  expectedClientId = '',
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<TwitchTokenIdentity> {
  const response = await fetchWithTimeout(fetchImpl, VALIDATE_URL, {
    headers: { Authorization: `OAuth ${accessToken}` },
  }, signal)
  const data = await readJson(response)

  if (!response.ok) {
    throw new TwitchApiError(
      `Twitch access token validation failed (${response.status}): ${readApiMessage(data, 'token is invalid')}`,
      response.status
    )
  }

  const identity = {
    clientId: readString(data.client_id),
    login: readString(data.login),
    userId: readString(data.user_id),
    scopes: normalizeScopes(data.scopes ?? data.scope),
    expiresIn: readPositiveNumber(data.expires_in)
  }

  if (!identity.clientId || !identity.login || !identity.userId) {
    throw new Error('Twitch validated the token but did not return an account identity. Try connecting again.')
  }
  if (expectedClientId && identity.clientId !== expectedClientId) {
    throw new Error('This Twitch token belongs to a different application. Connect with Twitch again.')
  }

  return identity
}

export async function fetchTwitchStreamKey(input: {
  clientId: string
  accessToken: string
  broadcasterUserId: string
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}): Promise<string> {
  const url = new URL(STREAM_KEY_URL)
  url.searchParams.set('broadcaster_id', input.broadcasterUserId)
  const response = await fetchWithTimeout(input.fetchImpl ?? fetch, url, {
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Client-Id': input.clientId
    }
  }, input.signal)
  const data = await readJson(response)

  if (!response.ok) {
    throw new TwitchApiError(
      `Twitch could not provide the stream key (${response.status}): ${readApiMessage(data, 'streaming is not available for this account')}`,
      response.status
    )
  }

  const streamKey = readString(Array.isArray(data.data) ? data.data[0]?.stream_key : '')
  if (!streamKey) throw new Error('Twitch did not return a stream key for this account.')
  return streamKey
}

/**
 * Twurple 8 requires a client secret in its RefreshingAuthProvider. This
 * provider implements the same user/intents surface while omitting the secret
 * from public-client refresh requests and serializing one-time token rotation.
 */
export class TwitchPublicAuthProvider implements AuthProvider {
  readonly clientId: string
  private token: AccessTokenWithUserId
  private readonly fetchImpl: typeof fetch
  private readonly onRefresh?: (token: TwitchOAuthTokens) => void
  private readonly onRefreshFailure?: (error: Error) => void
  private refreshPromise: Promise<AccessTokenWithUserId> | null = null
  private validationPromise: Promise<AccessTokenWithUserId> | null = null
  private lastValidatedAt: number

  constructor(options: TwitchPublicAuthProviderOptions) {
    this.clientId = options.clientId
    this.fetchImpl = options.fetchImpl ?? fetch
    this.onRefresh = options.onRefresh
    this.onRefreshFailure = options.onRefreshFailure
    this.lastValidatedAt = options.lastValidatedAt ?? 0
    this.token = {
      accessToken: options.accessToken,
      refreshToken: options.refreshToken,
      scope: [...options.scopes],
      expiresIn: options.expiresIn,
      obtainmentTimestamp: options.obtainmentTimestamp ?? Date.now(),
      userId: options.userId
    }
  }

  getCurrentScopesForUser(user: unknown): string[] {
    const userId = resolveUserId(user)
    return userId && this.token.userId && userId !== this.token.userId ? [] : [...this.token.scope]
  }

  async getAccessTokenForUser(
    user: unknown,
    ...scopeSets: Array<string[] | undefined>
  ): Promise<AccessTokenWithUserId | null> {
    const token = await this.getFreshToken(scopeSets)
    const userId = resolveUserId(user)
    return userId && token.userId && userId !== token.userId ? null : token
  }

  async getAccessTokenForIntent(
    _intent: string,
    ...scopeSets: Array<string[] | undefined>
  ): Promise<AccessTokenWithUserId> {
    return this.getFreshToken(scopeSets)
  }

  async getAnyAccessToken(): Promise<AccessTokenWithUserId> {
    return this.getFreshToken([])
  }

  async refreshAccessTokenForUser(user: unknown): Promise<AccessTokenWithUserId> {
    const userId = resolveUserId(user)
    if (userId && this.token.userId && userId !== this.token.userId) {
      throw new Error(`No Twitch access token is registered for user ${userId}.`)
    }
    return this.refreshToken()
  }

  async refreshAccessTokenForIntent(_intent: string): Promise<AccessTokenWithUserId> {
    return this.refreshToken()
  }

  async validateNow(): Promise<AccessTokenWithUserId> {
    return this.validateCurrentToken()
  }

  private async getFreshToken(scopeSets: Array<string[] | undefined>): Promise<AccessTokenWithUserId> {
    let token = this.token
    if (isTokenExpired(token)) {
      token = await this.refreshToken()
    } else if (Date.now() - this.lastValidatedAt >= HOURLY_VALIDATION_INTERVAL_MS) {
      token = await this.validateCurrentToken()
    }
    assertRequestedScopeSet(token.scope, scopeSets)
    return { ...token, scope: [...token.scope] }
  }

  private async validateCurrentToken(): Promise<AccessTokenWithUserId> {
    if (this.validationPromise) return this.validationPromise

    this.validationPromise = (async () => {
      try {
        const identity = await validateTwitchAccessToken(
          this.token.accessToken,
          this.clientId,
          this.fetchImpl
        )
        this.token = {
          ...this.token,
          userId: identity.userId,
          scope: identity.scopes,
          expiresIn: identity.expiresIn,
          obtainmentTimestamp: Date.now()
        }
        this.lastValidatedAt = Date.now()
        return { ...this.token, scope: [...this.token.scope] }
      } catch (error) {
        if (error instanceof TwitchApiError && error.status === 401) {
          return this.refreshToken()
        }
        throw error
      }
    })()

    try {
      return await this.validationPromise
    } finally {
      this.validationPromise = null
    }
  }

  private async refreshToken(): Promise<AccessTokenWithUserId> {
    if (this.refreshPromise) return this.refreshPromise

    this.refreshPromise = (async () => {
      try {
        const currentRefreshToken = this.token.refreshToken
        if (!currentRefreshToken) {
          throw new Error('Twitch session expired and has no refresh token. Connect with Twitch again.')
        }

        const refreshed = await refreshTwitchAccessToken(
          this.clientId,
          currentRefreshToken,
          this.fetchImpl
        )
        // Public-client refresh tokens are one-time-use. Publish and retain the
        // rotated pair before the validation request so a transient validation
        // failure can never make us reuse the now-consumed previous token.
        const provisionalToken: AccessTokenWithUserId = {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          scope: refreshed.scopes.length > 0 ? refreshed.scopes : this.token.scope,
          expiresIn: refreshed.expiresIn,
          obtainmentTimestamp: Date.now(),
          userId: this.token.userId
        }
        this.token = provisionalToken
        this.onRefresh?.({
          accessToken: provisionalToken.accessToken,
          refreshToken: provisionalToken.refreshToken || '',
          expiresIn: refreshed.expiresIn,
          scopes: [...provisionalToken.scope]
        })

        const identity = await validateTwitchAccessToken(
          refreshed.accessToken,
          this.clientId,
          this.fetchImpl
        )
        const nextToken: AccessTokenWithUserId = {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          scope: identity.scopes,
          expiresIn: identity.expiresIn || refreshed.expiresIn,
          obtainmentTimestamp: Date.now(),
          userId: identity.userId
        }

        this.token = nextToken
        this.lastValidatedAt = Date.now()
        return { ...nextToken, scope: [...nextToken.scope] }
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error))
        this.onRefreshFailure?.(normalized)
        throw normalized
      }
    })()

    try {
      return await this.refreshPromise
    } finally {
      this.refreshPromise = null
    }
  }
}

async function pollForTwitchTokens(input: {
  clientId: string
  scopes: readonly string[]
  device: TwitchDeviceAuthorization
  expiresAt: number
  fetchImpl: typeof fetch
  wait: (milliseconds: number, signal: AbortSignal) => Promise<void>
  signal: AbortSignal
}): Promise<TwitchOAuthTokens> {
  let intervalMs = input.device.intervalSeconds * 1000

  while (Date.now() < input.expiresAt) {
    await input.wait(Math.min(intervalMs, input.expiresAt - Date.now()), input.signal)
    throwIfAborted(input.signal)
    if (Date.now() >= input.expiresAt) break

    let response: Response
    let data: Record<string, any>
    try {
      response = await fetchWithTimeout(input.fetchImpl, TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: input.clientId,
          scopes: input.scopes.join(' '),
          device_code: input.device.deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
        }).toString(),
      }, input.signal)
      data = await readJson(response)
    } catch (error) {
      if (input.signal.aborted) throw abortError(input.signal)
      intervalMs = Math.min(intervalMs * 2, MAX_TRANSIENT_POLL_INTERVAL_MS)
      continue
    }

    if (response.ok) return parseTokenResponse(data, 'Twitch authorization')

    const oauthError = normalizeOAuthError(data.error ?? data.message)
    if (oauthError === 'authorization_pending') continue
    if (oauthError === 'slow_down') {
      intervalMs += 5_000
      continue
    }
    if (response.status >= 500) {
      intervalMs = Math.min(intervalMs * 2, MAX_TRANSIENT_POLL_INTERVAL_MS)
      continue
    }
    if (oauthError === 'access_denied') {
      throw new Error('Twitch authorization was denied. No account changes were made.')
    }
    if (oauthError === 'expired_token' || oauthError === 'invalid_device_code') break

    throw new TwitchApiError(
      `Twitch authorization failed (${response.status}): ${readApiMessage(data, 'unknown error')}`,
      response.status
    )
  }

  throw new Error('Twitch authorization timed out. Select Connect with Twitch to try again.')
}

function parseTokenResponse(data: Record<string, any>, context: string): TwitchOAuthTokens {
  const accessToken = readString(data.access_token)
  const refreshToken = readString(data.refresh_token)
  const expiresIn = readPositiveNumber(data.expires_in)
  const scopes = normalizeScopes(data.scope ?? data.scopes)

  if (!accessToken || !refreshToken || !expiresIn) {
    throw new Error(`${context} returned incomplete tokens. Connect with Twitch again.`)
  }

  return { accessToken, refreshToken, expiresIn, scopes }
}

function assertRequiredScopes(granted: string[], required: readonly string[]): void {
  const missing = required.filter((scope) => !granted.includes(scope))
  if (missing.length > 0) {
    throw new Error(`Twitch did not grant required permission${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.`)
  }
}

function assertRequestedScopeSet(
  available: string[],
  scopeSets: Array<string[] | undefined>
): void {
  const requested = scopeSets.filter((scopeSet): scopeSet is string[] => Array.isArray(scopeSet))
  if (requested.length === 0 || requested.every((scopeSet) => (
    scopeSet.length === 0 || scopeSet.some((scope) => available.includes(scope))
  ))) {
    return
  }
  throw new Error(`Twitch token is missing one of the requested permission sets: ${requested.map((set) => set.join(', ')).join(' or ')}.`)
}

function isTokenExpired(token: AccessTokenWithUserId): boolean {
  if (token.expiresIn === null) return false
  return Date.now() + TOKEN_EXPIRY_GRACE_MS >= token.obtainmentTimestamp + token.expiresIn * 1000
}

function waitFor(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError(signal))
      return
    }
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, milliseconds)
    const onAbort = () => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', onAbort)
      reject(abortError(signal))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError(signal)
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('Twitch authorization canceled.')
}

async function readJson(response: Response): Promise<Record<string, any>> {
  return await response.json().catch(() => ({})) as Record<string, any>
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: Parameters<typeof fetch>[0],
  init: NonNullable<Parameters<typeof fetch>[1]>,
  signal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort(new Error('Twitch request timed out.'))
  }, REQUEST_TIMEOUT_MS)
  const onAbort = () => controller.abort(signal?.reason)

  if (signal?.aborted) onAbort()
  else signal?.addEventListener('abort', onAbort, { once: true })

  try {
    return await fetchImpl(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', onAbort)
  }
}

function readApiMessage(data: Record<string, any>, fallback: string): string {
  return readString(data.message) || readString(data.error_description) || readString(data.error) || fallback
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readPositiveNumber(value: unknown): number {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

function normalizeScopes(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((scope) => scope.trim()).filter(Boolean)
  if (typeof value === 'string') return value.split(/[\s,]+/).map((scope) => scope.trim()).filter(Boolean)
  return []
}

function normalizeOAuthError(value: unknown): string {
  return readString(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function resolveUserId(user: unknown): string {
  if (typeof user === 'string' || typeof user === 'number') return String(user)
  if (user && typeof user === 'object') {
    const record = user as Record<string, unknown>
    return readString(record.id) || readString(record.userId)
  }
  return ''
}

function formatTwitchError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error)
}
