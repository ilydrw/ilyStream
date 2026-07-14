import { createHash, randomBytes } from 'crypto'
import { createServer, Server } from 'http'
import { shell } from 'electron'

/**
 * Kick user-account OAuth (authorization code + PKCE against id.kick.com).
 * The app-credential (client_credentials) token used for event subscriptions
 * can't touch the channel — updating the stream title/category needs a token
 * issued to the broadcaster with channel:write, which is what this flow gets.
 *
 * Kick apps must have the redirect URI registered verbatim, so the port is
 * fixed and the URI is exported for the Kick page to display.
 */

// Loopback port for the Kick OAuth callback. Distinct from Spotify (8789),
// YouTube (8790), X (8791), and the TikTok-native/Kick-webhook pair (8792)
// so the flows never contend for the same socket.
export const KICK_REDIRECT_PORT = 8793
export const KICK_REDIRECT_URI = `http://127.0.0.1:${KICK_REDIRECT_PORT}/callback`

const AUTH_URL = 'https://id.kick.com/oauth/authorize'
const TOKEN_URL = 'https://id.kick.com/oauth/token'

// channel:read/write cover reading + patching stream title/category;
// user:read lets us confirm which account authorized.
const SCOPES = ['user:read', 'channel:read', 'channel:write'].join(' ')

export interface KickUserTokens {
  accessToken: string
  refreshToken: string
  /** Epoch ms when the access token expires. */
  expiresAt: number
  scopes: string
}

function generateCodeVerifier(): string {
  return randomBytes(64).toString('base64url')
}

function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

// In-flight auth attempt. A second connect click cancels the first so the
// loopback port can be re-bound.
let activeAuth: { server: Server; cancel: (reason: Error) => void } | null = null

export async function initiateKickUserAuth(
  clientId: string,
  clientSecret: string
): Promise<KickUserTokens> {
  if (!clientId.trim() || !clientSecret.trim()) {
    throw new Error('Kick Client ID and Client Secret are required before connecting your account.')
  }

  await cancelActiveAuth(new Error('Kick auth canceled — restarted by a new connect attempt.'))

  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const state = randomBytes(32).toString('base64url')

  const params = new URLSearchParams({
    client_id: clientId.trim(),
    response_type: 'code',
    redirect_uri: KICK_REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    state
  })

  await shell.openExternal(`${AUTH_URL}?${params.toString()}`)

  const code = await waitForCallback(state)
  return exchangeCodeForTokens(clientId.trim(), clientSecret.trim(), code, codeVerifier)
}

export async function refreshKickUserTokens(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<KickUserTokens> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId.trim(),
      client_secret: clientSecret.trim(),
      refresh_token: refreshToken
    }).toString()
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      `Kick session expired and could not be refreshed (${response.status}). Reconnect your Kick account on the Kick page. ${text}`.trim()
    )
  }

  return readTokenResponse(await response.json())
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
      finalize(() => reject(new Error('Kick auth timed out — no response within 5 minutes')))
    }, 5 * 60 * 1000)

    const server = createServer((req, res) => {
      try {
        const url = new URL(req.url ?? '/', `http://127.0.0.1:${KICK_REDIRECT_PORT}`)
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
          ? `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ilyStream — Kick</title><style>body{font-family:system-ui,sans-serif;background:#0b0d10;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center}.card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:40px 48px;max-width:400px}</style></head><body><div class="card"><h1 style="color:#53fc18;margin:0 0 12px">✓ Connected!</h1><p style="margin:0;opacity:.7">You can close this tab and return to ilyStream.</p></div></body></html>`
          : `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ilyStream — Kick</title><style>body{font-family:system-ui,sans-serif;background:#0b0d10;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center}.card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:40px 48px;max-width:400px}</style></head><body><div class="card"><h1 style="color:#ef4444;margin:0 0 12px">✗ Auth failed</h1><p style="margin:0;opacity:.7">Close this tab and try again in ilyStream.</p></div></body></html>`

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(html, 'utf8')

        if (code && validState) {
          finalize(() => resolve(code))
        } else if (!validState) {
          finalize(() => reject(new Error('Kick auth state mismatch. Try connecting again.')))
        } else {
          finalize(() => reject(new Error(`Kick auth denied: ${error ?? 'unknown'}`)))
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

    server.listen(KICK_REDIRECT_PORT, '127.0.0.1', () => {
      console.log(`[kick-auth] Callback server listening on port ${KICK_REDIRECT_PORT}`)
    })

    server.on('error', (err) => {
      finalize(() =>
        reject(
          new Error(
            `Could not start Kick callback server on port ${KICK_REDIRECT_PORT}: ${err.message}`
          )
        )
      )
    })
  })
}

async function exchangeCodeForTokens(
  clientId: string,
  clientSecret: string,
  code: string,
  codeVerifier: string
): Promise<KickUserTokens> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: KICK_REDIRECT_URI,
      code_verifier: codeVerifier,
      code
    }).toString()
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      `Kick token exchange failed (${response.status}). Check that ${KICK_REDIRECT_URI} is registered as a redirect URI on your Kick app. ${text}`.trim()
    )
  }

  return readTokenResponse(await response.json())
}

function readTokenResponse(data: any): KickUserTokens {
  const accessToken = String(data?.access_token || '')
  if (!accessToken) {
    throw new Error('Kick did not return an access token. Try connecting again.')
  }
  const expiresIn = Number(data?.expires_in)
  return {
    accessToken,
    refreshToken: String(data?.refresh_token || ''),
    expiresAt: Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600) * 1000,
    scopes: String(data?.scope || '')
  }
}
