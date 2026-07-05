import { createHash, randomBytes } from 'crypto'
import { createServer, Server } from 'http'
import { shell } from 'electron'

// Loopback port for the X OAuth callback. Distinct from Spotify (8789) and
// YouTube (8790) so the flows never contend for the same socket.
export const X_REDIRECT_PORT = 8791
// X OAuth2 requires the redirect URI registered on the app to match exactly.
// Users add this string under their app's "Callback URI / Redirect URL".
export const X_REDIRECT_URI = `http://127.0.0.1:${X_REDIRECT_PORT}/callback`
const AUTH_URL = 'https://twitter.com/i/oauth2/authorize'
const TOKEN_URL = 'https://api.twitter.com/2/oauth2/token'
const TOKEN_REFRESH_RETRY_DELAYS_MS = [750, 1500]
const TRANSIENT_TOKEN_STATUSES = new Set([408, 429, 500, 502, 503, 504])

/**
 * Optional built-in client ID from env. X public ("Native App") clients have no
 * secret, so a client ID alone is enough — users can supply their own instead.
 */
export const DEFAULT_X_CLIENT_ID = process.env.ILYSTREAM_X_CLIENT_ID?.trim() || ''

// tweet.write is what lets ilyStream post the go-live announcement.
// offline.access returns a refresh token so we can post without re-auth.
const SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'].join(' ')

export interface XTokens {
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

// In-flight auth attempt. A second connect click cancels the first so we can
// re-bind the loopback port.
let activeAuth: { server: Server; cancel: (reason: Error) => void } | null = null

export async function initiateXAuth(clientId: string): Promise<XTokens> {
  if (!clientId.trim()) throw new Error('X OAuth client ID is required before connecting.')

  await cancelActiveAuth(new Error('X auth canceled — restarted by a new connect attempt.'))

  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const state = randomBytes(32).toString('base64url')

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: X_REDIRECT_URI,
    scope: SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
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
      finalize(() => reject(new Error('X auth timed out — no response within 5 minutes')))
    }, 5 * 60 * 1000)

    const server = createServer((req, res) => {
      try {
        const url = new URL(req.url ?? '/', `http://127.0.0.1:${X_REDIRECT_PORT}`)
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
          ? `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ilyStream — X</title><style>body{font-family:system-ui,sans-serif;background:#0b0d10;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center}.card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:40px 48px;max-width:400px}</style></head><body><div class="card"><h1 style="color:#1d9bf0;margin:0 0 12px">✓ Connected!</h1><p style="margin:0;opacity:.7">You can close this tab and return to ilyStream.</p></div></body></html>`
          : `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ilyStream — X</title><style>body{font-family:system-ui,sans-serif;background:#0b0d10;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center}.card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:40px 48px;max-width:400px}</style></head><body><div class="card"><h1 style="color:#ef4444;margin:0 0 12px">✗ Auth failed</h1><p style="margin:0;opacity:.7">Close this tab and try again in ilyStream.</p></div></body></html>`

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(html, 'utf8')

        if (code && validState) {
          finalize(() => resolve(code))
        } else if (!validState) {
          finalize(() => reject(new Error('X auth state mismatch. Try connecting again.')))
        } else {
          finalize(() => reject(new Error(`X auth denied: ${error ?? 'unknown'}`)))
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

    server.listen(X_REDIRECT_PORT, '127.0.0.1', () => {
      console.log(`[x-auth] Callback server listening on port ${X_REDIRECT_PORT}`)
    })

    server.on('error', (err) => {
      finalize(() =>
        reject(new Error(`Could not start X callback server on port ${X_REDIRECT_PORT}: ${err.message}`))
      )
    })
  })
}

async function exchangeCodeForTokens(
  clientId: string,
  code: string,
  codeVerifier: string
): Promise<XTokens> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: X_REDIRECT_URI,
      code_verifier: codeVerifier
    }).toString()
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`X token exchange failed (${response.status}): ${text}`)
  }

  const data = (await response.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
  }

  if (!data.refresh_token) {
    throw new Error(
      'X did not return a refresh token. Make sure your app requests the offline.access scope and try connecting again.'
    )
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in
  }
}

export async function refreshXTokens(clientId: string, refreshToken: string): Promise<XTokens> {
  if (!clientId.trim()) throw new Error('X client ID is required before refreshing X.')

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
      lastError = new Error(`X token refresh failed: ${error?.message ?? String(error)}`)
      if (attempt === TOKEN_REFRESH_RETRY_DELAYS_MS.length) throw lastError
      await delay(TOKEN_REFRESH_RETRY_DELAYS_MS[attempt])
      continue
    }

    if (!response.ok) {
      const text = await response.text()
      lastError = new Error(`X token refresh failed (${response.status}): ${text}`)

      if (!TRANSIENT_TOKEN_STATUSES.has(response.status) || attempt === TOKEN_REFRESH_RETRY_DELAYS_MS.length) {
        throw lastError
      }

      await delay(TOKEN_REFRESH_RETRY_DELAYS_MS[attempt])
      continue
    }

    const data = (await response.json()) as {
      access_token: string
      refresh_token?: string
      expires_in: number
    }

    return {
      accessToken: data.access_token,
      // X rotates refresh tokens — fall back to the old one only if absent.
      refreshToken: data.refresh_token ?? refreshToken,
      expiresIn: data.expires_in
    }
  }

  throw lastError ?? new Error('X token refresh failed')
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
