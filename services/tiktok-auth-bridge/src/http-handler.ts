import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http'
import { BridgeHttpError } from './types.js'
import type { TikTokAuthBridge } from './bridge.js'
import type { KickOAuthBroker } from './kick-oauth-client.js'

const MAX_JSON_BODY_BYTES = 32 * 1024
const RATE_LIMIT_WINDOW_MS = 60_000

interface BridgeRateLimitOptions {
  windowMs?: number
  oauthRequestsPerWindow?: number
  apiRequestsPerWindow?: number
  now?: () => number
}

export function createTikTokBridgeHandler(
  bridge: TikTokAuthBridge,
  kickOAuth?: KickOAuthBroker,
  rateLimitOptions: BridgeRateLimitOptions = {}
): RequestListener {
  const rateLimiter = new BridgeRateLimiter(rateLimitOptions)
  return (request, response) => {
    void routeRequest(bridge, kickOAuth, rateLimiter, request, response)
      .catch((error) => writeError(response, error))
  }
}

async function routeRequest(
  bridge: TikTokAuthBridge,
  kickOAuth: KickOAuthBroker | undefined,
  rateLimiter: BridgeRateLimiter,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  applySecurityHeaders(response)
  const url = new URL(request.url || '/', 'http://bridge.local')
  const method = request.method || 'GET'

  if (method === 'GET' && url.pathname === '/health') {
    writeJson(response, 200, { ok: true })
    return
  }
  rateLimiter.assertAllowed(request, url.pathname)
  if (method === 'POST' && url.pathname === '/v1/tiktok/oauth/exchange') {
    const body = await readJson(request)
    writeJson(response, 200, await bridge.exchangeAuthorizationCode(body))
    return
  }
  if (method === 'POST' && url.pathname === '/v1/kick/oauth/exchange') {
    const client = requireKickOAuth(kickOAuth)
    const body = await readJson(request)
    writeJson(response, 200, await client.exchangeAuthorizationCode(body))
    return
  }
  if (method === 'POST' && url.pathname === '/v1/kick/oauth/refresh') {
    const client = requireKickOAuth(kickOAuth)
    const body = await readJson(request)
    writeJson(response, 200, await client.refreshAccessToken(body))
    return
  }

  const desktopAccessToken = bearerToken(request)
  if (method === 'GET' && url.pathname === '/v1/tiktok/session') {
    writeJson(response, 200, await bridge.getSession(desktopAccessToken))
    return
  }
  if (method === 'POST' && url.pathname === '/v1/tiktok/session/disconnect') {
    await rejectUnexpectedBody(request)
    await bridge.disconnect(desktopAccessToken)
    response.writeHead(204).end()
    return
  }
  if (method === 'POST' && url.pathname === '/v1/tiktok/live/prepare') {
    const body = await readJson(request, true)
    writeJson(response, 200, await bridge.prepareLive(desktopAccessToken, body))
    return
  }
  if (method === 'POST' && url.pathname === '/v1/tiktok/live/complete') {
    await rejectUnexpectedBody(request)
    await bridge.completeLive(desktopAccessToken)
    response.writeHead(204).end()
    return
  }

  throw new BridgeHttpError(404, 'not_found', 'Bridge endpoint not found.')
}

async function readJson(
  request: IncomingMessage,
  allowEmpty = false
): Promise<Record<string, unknown>> {
  const contentType = String(request.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase()
  if (contentType !== 'application/json') {
    throw new BridgeHttpError(415, 'unsupported_media_type', 'Use application/json.')
  }

  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > MAX_JSON_BODY_BYTES) {
      throw new BridgeHttpError(413, 'payload_too_large', 'Request body is too large.')
    }
    chunks.push(buffer)
  }
  if (!size && allowEmpty) return {}
  if (!size) throw new BridgeHttpError(400, 'invalid_json', 'A JSON request body is required.')

  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object required')
    return parsed as Record<string, unknown>
  } catch {
    throw new BridgeHttpError(400, 'invalid_json', 'Request body must be a JSON object.')
  }
}

async function rejectUnexpectedBody(request: IncomingMessage): Promise<void> {
  let size = 0
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk)
    if (size > 0) {
      throw new BridgeHttpError(400, 'unexpected_body', 'This endpoint does not accept a request body.')
    }
  }
}

function bearerToken(request: IncomingMessage): string {
  const authorization = String(request.headers.authorization || '')
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization)
  if (!match) throw new BridgeHttpError(401, 'invalid_session', 'Connect TikTok again.')
  return match[1]
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  if (response.headersSent) return
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}

function writeError(response: ServerResponse, error: unknown): void {
  if (response.headersSent) {
    response.destroy()
    return
  }
  const status = error instanceof BridgeHttpError ? error.status : 500
  const code = error instanceof BridgeHttpError ? error.code : 'internal_error'
  const message = error instanceof BridgeHttpError
    ? error.message
    : 'The auth bridge could not complete this request.'
  applySecurityHeaders(response)
  if (error instanceof BridgeHttpError && error.code === 'rate_limited') {
    response.setHeader('Retry-After', '60')
  }
  writeJson(response, status, { error: code, message })
}

class BridgeRateLimiter {
  private readonly attempts = new Map<string, number[]>()
  private readonly windowMs: number
  private readonly oauthRequestsPerWindow: number
  private readonly apiRequestsPerWindow: number
  private readonly now: () => number

  constructor(options: BridgeRateLimitOptions) {
    this.windowMs = Math.max(1_000, options.windowMs ?? RATE_LIMIT_WINDOW_MS)
    this.oauthRequestsPerWindow = Math.max(1, options.oauthRequestsPerWindow ?? 10)
    this.apiRequestsPerWindow = Math.max(1, options.apiRequestsPerWindow ?? 120)
    this.now = options.now ?? Date.now
  }

  assertAllowed(request: IncomingMessage, pathname: string): void {
    const client = request.socket.remoteAddress || 'unknown'
    const oauthEndpoint = pathname.includes('/oauth/')
    const bucket = `${client}:${oauthEndpoint ? 'oauth' : 'api'}`
    const limit = oauthEndpoint ? this.oauthRequestsPerWindow : this.apiRequestsPerWindow
    const now = this.now()
    const cutoff = now - this.windowMs
    const recent = (this.attempts.get(bucket) || []).filter((attempt) => attempt > cutoff)
    if (recent.length >= limit) {
      this.attempts.set(bucket, recent)
      throw new BridgeHttpError(429, 'rate_limited', 'Too many requests. Try again shortly.')
    }
    recent.push(now)
    this.attempts.set(bucket, recent)

    if (this.attempts.size > 10_000) {
      for (const [key, values] of this.attempts) {
        if (!values.some((attempt) => attempt > cutoff)) this.attempts.delete(key)
      }
    }
  }
}

function requireKickOAuth(kickOAuth: KickOAuthBroker | undefined): KickOAuthBroker {
  if (!kickOAuth) {
    throw new BridgeHttpError(
      503,
      'kick_not_configured',
      'Kick authorization is not configured on this bridge.'
    )
  }
  return kickOAuth
}

function applySecurityHeaders(response: ServerResponse): void {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Referrer-Policy', 'no-referrer')
}
