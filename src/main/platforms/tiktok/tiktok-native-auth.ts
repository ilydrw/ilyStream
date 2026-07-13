import { createHash, randomBytes } from 'crypto'
import { type IncomingMessage, type ServerResponse } from 'http'
import { shell } from 'electron'
import {
  TIKTOK_NATIVE_AUTH_TIMEOUT_MS,
  TIKTOK_NATIVE_REDIRECT_PORT,
  TIKTOK_NATIVE_REDIRECT_URI,
  type TikTokNativeAccount,
  type TikTokNativeAuthPhase,
  type TikTokNativeAuthProgress,
  type TikTokNativeAuthStatus,
  type TikTokNativeLiveAccess,
  type TikTokNativeLiveDestination
} from '../../../shared/tiktok-native'
import { registerLoopbackRoute, type LoopbackRouteRegistration } from '../loopback-route-server'

const AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/'
const AUTH_SCOPES = ['user.info.basic']
const REQUEST_TIMEOUT_MS = 15_000

const ILYSTREAM_TIKTOK_CLIENT_KEY = 'awduv326or2kgmm6'
const ILYSTREAM_TIKTOK_AUTH_BRIDGE_URL = 'https://ilystream-production.up.railway.app'

export const DEFAULT_TIKTOK_CLIENT_KEY =
  process.env.ILYSTREAM_TIKTOK_CLIENT_KEY?.trim() || ILYSTREAM_TIKTOK_CLIENT_KEY
export const DEFAULT_TIKTOK_AUTH_BRIDGE_URL =
  process.env.ILYSTREAM_TIKTOK_AUTH_BRIDGE_URL?.trim() || ILYSTREAM_TIKTOK_AUTH_BRIDGE_URL

export interface TikTokNativeAuthOptions {
  clientKey: string
  bridgeUrl: string
  getAccessToken: () => string
  setAccessToken: (token: string) => void
  fetchImpl?: typeof fetch
  openExternal?: (url: string) => Promise<void>
  onProgress?: (progress: TikTokNativeAuthProgress) => void
  authTimeoutMs?: number
  registerLoopbackRouteImpl?: typeof registerLoopbackRoute
  now?: () => number
}

interface NativeSessionResponse {
  desktopAccessToken?: string
  account?: TikTokNativeAccount
  liveAccess?: TikTokNativeLiveAccess
  message?: string
}

let activeAuth: { cancel: (reason: Error) => Promise<void> } | null = null

export function generateTikTokCodeVerifier(): string {
  return randomBytes(64).toString('base64url')
}

export function generateTikTokCodeChallenge(verifier: string): string {
  // TikTok's desktop Login Kit requires the SHA-256 challenge encoded as hex.
  return createHash('sha256').update(verifier).digest('hex')
}

export function buildTikTokAuthorizeUrl(input: {
  clientKey: string
  state: string
  codeChallenge: string
  redirectUri?: string
}): string {
  const params = new URLSearchParams({
    client_key: input.clientKey,
    response_type: 'code',
    scope: AUTH_SCOPES.join(','),
    redirect_uri: input.redirectUri || TIKTOK_NATIVE_REDIRECT_URI,
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: 'S256'
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

export function validateTikTokAuthBridgeUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('ilyStream TikTok auth bridge URL is invalid.')
  }

  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('ilyStream TikTok auth bridge must use HTTPS (HTTP is allowed only on loopback).')
  }
  url.pathname = url.pathname.replace(/\/*$/, '/')
  url.search = ''
  url.hash = ''
  return url
}

export async function getTikTokNativeAuthStatus(
  options: TikTokNativeAuthOptions
): Promise<TikTokNativeAuthStatus> {
  const readiness = getConfigurationStatus(options)
  if (readiness) return readiness

  const accessToken = options.getAccessToken().trim()
  if (!accessToken) {
    return {
      state: 'ready',
      configured: true,
      redirectUri: TIKTOK_NATIVE_REDIRECT_URI,
      liveAccess: 'unknown',
      message: 'Ready to connect with TikTok.'
    }
  }

  try {
    const response = await requestBridge<NativeSessionResponse>(options, 'v1/tiktok/session', {
      method: 'GET',
      accessToken
    })
    return statusFromSession(response, true)
  } catch (err) {
    return {
      state: 'error',
      configured: true,
      redirectUri: TIKTOK_NATIVE_REDIRECT_URI,
      liveAccess: 'unknown',
      message: errorMessage(err)
    }
  }
}

export async function initiateTikTokNativeAuth(
  options: TikTokNativeAuthOptions
): Promise<TikTokNativeAuthStatus> {
  const readiness = getConfigurationStatus(options)
  if (readiness) throw new Error(readiness.message)

  await cancelActiveAuth(new Error('TikTok authorization restarted by a new connect attempt.'))

  const codeVerifier = generateTikTokCodeVerifier()
  const codeChallenge = generateTikTokCodeChallenge(codeVerifier)
  const state = randomBytes(32).toString('base64url')
  const now = options.now || Date.now
  const startedAt = now()
  const expiresAt = startedAt + (options.authTimeoutMs || TIKTOK_NATIVE_AUTH_TIMEOUT_MS)
  const openExternal = options.openExternal || ((url: string) => shell.openExternal(url))
  const authorizeUrl = buildTikTokAuthorizeUrl({
    clientKey: options.clientKey.trim(),
    state,
    codeChallenge
  })
  reportAuthProgress(
    options,
    'opening-browser',
    'Opening TikTok in your browser…',
    startedAt,
    expiresAt
  )
  const code = await waitForCallback(
    state,
    () => openExternal(authorizeUrl),
    () => reportAuthProgress(
      options,
      'awaiting-consent',
      'Approve ilyStream in TikTok, then return here.',
      startedAt,
      expiresAt
    ),
    {
      timeoutMs: options.authTimeoutMs || TIKTOK_NATIVE_AUTH_TIMEOUT_MS,
      registerRoute: options.registerLoopbackRouteImpl || registerLoopbackRoute
    }
  )
  reportAuthProgress(
    options,
    'exchanging-code',
    'Securing your TikTok session on the ilyStream auth bridge…',
    startedAt,
    expiresAt
  )
  const response = await requestBridge<NativeSessionResponse>(options, 'v1/tiktok/oauth/exchange', {
    method: 'POST',
    body: {
      clientKey: options.clientKey.trim(),
      code,
      codeVerifier,
      redirectUri: TIKTOK_NATIVE_REDIRECT_URI
    }
  })

  const desktopAccessToken = String(response.desktopAccessToken || '').trim()
  if (!desktopAccessToken) {
    throw new Error('TikTok auth bridge did not return a desktop session token.')
  }
  options.setAccessToken(desktopAccessToken)
  const status = statusFromSession(response, true)
  reportAuthProgress(
    options,
    'connected',
    'TikTok account connected.',
    startedAt,
    expiresAt
  )
  return status
}

export async function cancelTikTokNativeAuth(
  reason = new Error('TikTok authorization cancelled.')
): Promise<boolean> {
  if (!activeAuth) return false
  const auth = activeAuth
  activeAuth = null
  await auth.cancel(reason)
  return true
}

export async function disconnectTikTokNativeAuth(
  options: TikTokNativeAuthOptions
): Promise<TikTokNativeAuthStatus> {
  const accessToken = options.getAccessToken().trim()
  if (accessToken && options.bridgeUrl.trim()) {
    try {
      await requestBridge(options, 'v1/tiktok/session/disconnect', {
        method: 'POST',
        accessToken
      })
    } catch (err) {
      console.warn('[tiktok-native] Remote disconnect failed:', errorMessage(err))
    }
  }
  options.setAccessToken('')
  return getTikTokNativeAuthStatus(options)
}

export async function prepareTikTokNativeLive(
  options: TikTokNativeAuthOptions,
  payload: { title?: string; orientation?: 'portrait' | 'landscape' } = {}
): Promise<TikTokNativeLiveDestination> {
  const readiness = getConfigurationStatus(options)
  if (readiness) throw new Error(readiness.message)

  const accessToken = options.getAccessToken().trim()
  if (!accessToken) {
    throw new Error('Connect TikTok on the TikTok page before going live.')
  }

  const response = await requestBridge<Partial<TikTokNativeLiveDestination>>(
    options,
    'v1/tiktok/live/prepare',
    {
      method: 'POST',
      accessToken,
      body: {
        title: String(payload.title || '').trim() || undefined,
        orientation: payload.orientation
      }
    }
  )
  return parseTikTokNativeLiveDestination(response)
}

export async function completeTikTokNativeLive(
  options: TikTokNativeAuthOptions
): Promise<void> {
  const readiness = getConfigurationStatus(options)
  if (readiness) throw new Error(readiness.message)

  const accessToken = options.getAccessToken().trim()
  if (!accessToken) return
  await requestBridge(options, 'v1/tiktok/live/complete', {
    method: 'POST',
    accessToken
  })
}

export function parseTikTokNativeLiveDestination(
  value: Partial<TikTokNativeLiveDestination>
): TikTokNativeLiveDestination {
  const rtmpUrl = String(value?.rtmpUrl || '').trim()
  const streamKey = String(value?.streamKey || '').trim()
  if (!/^rtmps?:\/\//i.test(rtmpUrl)) {
    throw new Error('TikTok LIVE provider returned an invalid RTMP ingest URL.')
  }
  if (!streamKey) {
    throw new Error('TikTok LIVE provider did not return a stream key.')
  }
  return {
    rtmpUrl,
    streamKey,
    liveId: cleanOptionalString(value.liveId),
    watchUrl: cleanOptionalString(value.watchUrl),
    title: cleanOptionalString(value.title)
  }
}

function getConfigurationStatus(options: TikTokNativeAuthOptions): TikTokNativeAuthStatus | null {
  if (!options.clientKey.trim()) {
    return {
      state: 'unconfigured',
      configured: false,
      redirectUri: TIKTOK_NATIVE_REDIRECT_URI,
      liveAccess: 'unknown',
      message: 'Add the ilyStream TikTok Login Kit client key first.'
    }
  }
  if (!options.bridgeUrl.trim()) {
    return {
      state: 'unconfigured',
      configured: false,
      redirectUri: TIKTOK_NATIVE_REDIRECT_URI,
      liveAccess: 'unknown',
      message: 'This build is waiting for the secure ilyStream TikTok auth bridge.'
    }
  }
  try {
    validateTikTokAuthBridgeUrl(options.bridgeUrl)
  } catch (err) {
    return {
      state: 'error',
      configured: false,
      redirectUri: TIKTOK_NATIVE_REDIRECT_URI,
      liveAccess: 'unknown',
      message: errorMessage(err)
    }
  }
  return null
}

function statusFromSession(
  response: NativeSessionResponse,
  configured: boolean
): TikTokNativeAuthStatus {
  return {
    state: 'connected',
    configured,
    redirectUri: TIKTOK_NATIVE_REDIRECT_URI,
    liveAccess: normalizeLiveAccess(response.liveAccess),
    account: normalizeAccount(response.account),
    message: cleanOptionalString(response.message)
  }
}

function normalizeLiveAccess(value: unknown): TikTokNativeLiveAccess {
  return ['unknown', 'pending', 'approved', 'rtmp-only', 'denied'].includes(String(value))
    ? value as TikTokNativeLiveAccess
    : 'unknown'
}

function normalizeAccount(value: unknown): TikTokNativeAccount | undefined {
  if (!value || typeof value !== 'object') return undefined
  const account = value as Partial<TikTokNativeAccount>
  const openId = String(account.openId || '').trim()
  const displayName = String(account.displayName || '').trim()
  if (!openId || !displayName) return undefined
  return { openId, displayName, avatarUrl: cleanOptionalString(account.avatarUrl) }
}

async function requestBridge<T = unknown>(
  options: TikTokNativeAuthOptions,
  path: string,
  request: {
    method: 'GET' | 'POST'
    accessToken?: string
    body?: Record<string, unknown>
  }
): Promise<T> {
  const base = validateTikTokAuthBridgeUrl(options.bridgeUrl)
  const url = new URL(path, base)
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (request.accessToken) headers.Authorization = `Bearer ${request.accessToken}`
  if (request.body) headers['Content-Type'] = 'application/json'

  const fetchImpl = options.fetchImpl || fetch
  const response = await fetchImpl(url, {
    method: request.method,
    headers,
    body: request.body ? JSON.stringify(request.body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  const data = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) {
    const detail = String(data.message || data.error || '').trim()
    throw new Error(`TikTok auth bridge request failed (${response.status})${detail ? `: ${detail}` : ''}`)
  }
  return data as T
}

function waitForCallback(
  expectedState: string,
  onReady: () => Promise<void>,
  onBrowserOpened: () => void,
  options: {
    timeoutMs: number
    registerRoute: typeof registerLoopbackRoute
  }
): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false
    let registration: LoopbackRouteRegistration | null = null
    const timeout = setTimeout(() => {
      void finalize(() => reject(new Error('TikTok authorization timed out after 5 minutes.')))
    }, options.timeoutMs)

    const handleCallback = (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || '/', TIKTOK_NATIVE_REDIRECT_URI)
      const finishPage = (status: number, heading: string, detail: string) => {
        res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`<!doctype html><html><body style="font-family:system-ui;background:#111;color:#fff;padding:40px"><h2>${heading}</h2><p>${detail}</p></body></html>`)
      }

      const state = url.searchParams.get('state')
      const error = url.searchParams.get('error')
      const code = url.searchParams.get('code')
      if (state !== expectedState) {
        finishPage(400, 'TikTok authorization failed', 'Security state mismatch. Return to ilyStream and try again.')
        void finalize(() => reject(new Error('TikTok auth state mismatch. Try connecting again.')))
        return
      }
      if (error) {
        const description = url.searchParams.get('error_description') || error
        finishPage(400, 'TikTok authorization denied', 'Return to ilyStream for details.')
        void finalize(() => reject(new Error(`TikTok authorization denied: ${description}`)))
        return
      }
      if (!code) {
        finishPage(400, 'TikTok authorization failed', 'No authorization code was returned.')
        void finalize(() => reject(new Error('TikTok did not return an authorization code.')))
        return
      }

      finishPage(200, 'TikTok connected', 'You can close this window and return to ilyStream.')
      void finalize(() => resolve(code))
    }

    const finalize = async (complete: () => void): Promise<void> => {
      if (settled) return Promise.resolve()
      settled = true
      clearTimeout(timeout)
      if (activeAuth?.cancel === cancel) activeAuth = null
      await registration?.close()
      complete()
    }

    const cancel = (reason: Error) => finalize(() => reject(reason))
    activeAuth = { cancel }
    void options.registerRoute({
      port: TIKTOK_NATIVE_REDIRECT_PORT,
      paths: ['/callback'],
      handle: handleCallback
    }).then(async (route) => {
      registration = route
      if (settled) {
        await route.close()
        return
      }
      await onReady()
      if (!settled) onBrowserOpened()
    }).catch((err) => finalize(() => reject(err)))
  })
}

async function cancelActiveAuth(reason: Error): Promise<void> {
  await cancelTikTokNativeAuth(reason)
}

function reportAuthProgress(
  options: TikTokNativeAuthOptions,
  phase: TikTokNativeAuthPhase,
  message: string,
  startedAt: number,
  expiresAt: number
): void {
  options.onProgress?.({ phase, message, startedAt, expiresAt })
}

function cleanOptionalString(value: unknown): string | undefined {
  const text = String(value || '').trim()
  return text || undefined
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
