import { createHash, randomBytes } from 'crypto'
import { createServer, Server } from 'http'
import { shell } from 'electron'

export const SPOTIFY_REDIRECT_PORT = 8789
// Spotify requires the loopback IP (not the "localhost" hostname) for HTTP redirects.
// See: https://developer.spotify.com/documentation/web-api/concepts/redirect_uri
const REDIRECT_URI = `http://127.0.0.1:${SPOTIFY_REDIRECT_PORT}/callback`
const AUTH_URL = 'https://accounts.spotify.com/authorize'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const TOKEN_REFRESH_RETRY_DELAYS_MS = [750, 1500]
const TRANSIENT_TOKEN_STATUSES = new Set([408, 429, 500, 502, 503, 504])

/**
 * Default Client ID for ilyStream.
 * Users can still override this in settings if they want their own app.
 */
export const DEFAULT_SPOTIFY_CLIENT_ID = process.env.ILYSTREAM_SPOTIFY_CLIENT_ID?.trim() || ''

const SCOPES = [
  'user-modify-playback-state',
  'user-read-playback-state',
  'user-read-currently-playing',
  'user-read-private',
  'user-library-modify',
  'user-library-read'
].join(' ')

export interface SpotifyTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

function generateCodeVerifier(): string {
  return randomBytes(64).toString('base64url')
}

function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

// In-flight auth attempt. A second connect click should cancel the first so we can re-bind port 8789.
let activeAuth: { server: Server, cancel: (reason: Error) => void } | null = null

export async function initiateSpotifyAuth(clientId: string): Promise<SpotifyTokens> {
  if (!clientId.trim()) throw new Error('Spotify Client ID is required before connecting.')

  await cancelActiveAuth(new Error('Spotify auth canceled — restarted by a new connect attempt.'))

  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const state = randomBytes(32).toString('base64url')

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    scope: SCOPES,
    state
  })

  await shell.openExternal(`${AUTH_URL}?${params.toString()}`)

  const code = await waitForCallback(state)
  return exchangeCodeForTokens(clientId, code, codeVerifier)
}

async function cancelActiveAuth(reason: Error): Promise<void> {
  const prev = activeAuth
  if (!prev) return
  activeAuth = null
  prev.cancel(reason)
  await new Promise<void>((resolve) => prev.server.close(() => resolve()))
}

function waitForCallback(expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false

    const finalize = (action: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (activeAuth?.server === server) activeAuth = null
      server.close()
      action()
    }

    const timeout = setTimeout(() => {
      finalize(() => reject(new Error('Spotify auth timed out — no response within 5 minutes')))
    }, 5 * 60 * 1000)

    const server = createServer((req, res) => {
      try {
        const url = new URL(req.url ?? '/', `http://127.0.0.1:${SPOTIFY_REDIRECT_PORT}`)
        if (url.pathname !== '/callback') {
          res.writeHead(404)
          res.end()
          return
        }

        const code = url.searchParams.get('code')
        const error = url.searchParams.get('error')
        const state = url.searchParams.get('state')
        const validState = state === expectedState

        const html = code && validState
          ? `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ilyStream — Spotify</title><style>body{font-family:system-ui,sans-serif;background:#0b0d10;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center}.card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:40px 48px;max-width:400px}</style></head><body><div class="card"><h1 style="color:#1DB954;margin:0 0 12px">✓ Connected!</h1><p style="margin:0;opacity:.7">You can close this tab and return to ilyStream.</p></div></body></html>`
          : `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ilyStream — Spotify</title><style>body{font-family:system-ui,sans-serif;background:#0b0d10;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center}.card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:40px 48px;max-width:400px}</style></head><body><div class="card"><h1 style="color:#ef4444;margin:0 0 12px">✗ Auth failed</h1><p style="margin:0;opacity:.7">Close this tab and try again in ilyStream.</p></div></body></html>`

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(html, 'utf8')

        if (code && validState) {
          finalize(() => resolve(code))
        } else if (!validState) {
          finalize(() => reject(new Error('Spotify auth state mismatch. Try connecting again.')))
        } else {
          finalize(() => reject(new Error(`Spotify auth denied: ${error ?? 'unknown'}`)))
        }
      } catch (err) {
        res.writeHead(500)
        res.end()
        finalize(() => reject(err))
      }
    })

    activeAuth = {
      server,
      cancel: (reason) => finalize(() => reject(reason))
    }

    server.listen(SPOTIFY_REDIRECT_PORT, '127.0.0.1', () => {
      console.log(`[spotify-auth] Callback server listening on port ${SPOTIFY_REDIRECT_PORT}`)
    })

    server.on('error', (err) => {
      finalize(() => reject(new Error(`Could not start Spotify callback server on port ${SPOTIFY_REDIRECT_PORT}: ${err.message}`)))
    })
  })
}

async function exchangeCodeForTokens(
  clientId: string,
  code: string,
  codeVerifier: string
): Promise<SpotifyTokens> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier
    }).toString()
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Spotify token exchange failed (${response.status}): ${text}`)
  }

  const data = (await response.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in
  }
}

export async function refreshSpotifyTokens(
  clientId: string,
  refreshToken: string
): Promise<SpotifyTokens> {
  if (!clientId.trim()) throw new Error('Spotify Client ID is required before refreshing Spotify.')

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= TOKEN_REFRESH_RETRY_DELAYS_MS.length; attempt++) {
    let response: Response

    try {
      response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          grant_type: 'refresh_token',
          refresh_token: refreshToken
        }).toString()
      })
    } catch (error: any) {
      lastError = new Error(`Spotify token refresh failed: ${error?.message ?? String(error)}`)
      if (attempt === TOKEN_REFRESH_RETRY_DELAYS_MS.length) throw lastError
      await delay(TOKEN_REFRESH_RETRY_DELAYS_MS[attempt])
      continue
    }

    if (!response.ok) {
      const text = await response.text()
      lastError = new Error(`Spotify token refresh failed (${response.status}): ${text}`)

      if (!TRANSIENT_TOKEN_STATUSES.has(response.status) || attempt === TOKEN_REFRESH_RETRY_DELAYS_MS.length) {
        throw lastError
      }

      await delay(resolveRetryDelay(response, TOKEN_REFRESH_RETRY_DELAYS_MS[attempt]))
      continue
    }

    const data = (await response.json()) as {
      access_token: string
      refresh_token?: string
      expires_in: number
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresIn: data.expires_in
    }
  }

  throw lastError ?? new Error('Spotify token refresh failed')
}

function resolveRetryDelay(response: Response, fallbackMs: number): number {
  const retryAfter = response.headers.get('retry-after')
  if (!retryAfter) return fallbackMs

  const seconds = Number(retryAfter)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000

  const retryAt = Date.parse(retryAfter)
  if (Number.isFinite(retryAt)) return Math.max(0, retryAt - Date.now())

  return fallbackMs
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
