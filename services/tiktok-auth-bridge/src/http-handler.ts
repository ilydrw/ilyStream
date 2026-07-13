import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http'
import { BridgeHttpError } from './types.js'
import type { TikTokAuthBridge } from './bridge.js'

const MAX_JSON_BODY_BYTES = 32 * 1024

export function createTikTokBridgeHandler(bridge: TikTokAuthBridge): RequestListener {
  return (request, response) => {
    void routeRequest(bridge, request, response).catch((error) => writeError(response, error))
  }
}

async function routeRequest(
  bridge: TikTokAuthBridge,
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
  if (method === 'POST' && url.pathname === '/v1/tiktok/oauth/exchange') {
    const body = await readJson(request)
    writeJson(response, 200, await bridge.exchangeAuthorizationCode(body))
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
    : 'The TikTok bridge could not complete this request.'
  applySecurityHeaders(response)
  writeJson(response, status, { error: code, message })
}

function applySecurityHeaders(response: ServerResponse): void {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Referrer-Policy', 'no-referrer')
}
