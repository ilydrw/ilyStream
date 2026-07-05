import { createHash, randomBytes } from 'crypto'
import { createServer, Server } from 'http'
import { shell } from 'electron'

// Loopback port for the Google OAuth callback. Kept distinct from Spotify's
// (8789) so the two auth flows never fight over the same socket.
export const YOUTUBE_REDIRECT_PORT = 8790
// Google's installed-app ("Desktop app") OAuth clients auto-authorize loopback
// redirects on 127.0.0.1 with any port — no need to register the URI. 127.0.0.1
// is preferred over "localhost" per Google's guidance.
// The exact loopback redirect ilyStream listens on. "Web application" OAuth
// clients must register this string verbatim under Authorized redirect URIs;
// "Desktop app" clients accept loopback redirects automatically. Exported so the
// UI can show users precisely what to register.
export const YOUTUBE_REDIRECT_URI = `http://127.0.0.1:${YOUTUBE_REDIRECT_PORT}/callback`
const REDIRECT_URI = YOUTUBE_REDIRECT_URI
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

/**
 * Optional built-in OAuth client. Users can supply their own client ID/secret
 * from their Google Cloud project (same project as their API key), or these
 * env-provided defaults are used when present. Google's desktop-app client
 * secret is not treated as confidential, so shipping one via env is acceptable.
 */
export const DEFAULT_YOUTUBE_CLIENT_ID = process.env.ILYSTREAM_YOUTUBE_CLIENT_ID?.trim() || ''
export const DEFAULT_YOUTUBE_CLIENT_SECRET = process.env.ILYSTREAM_YOUTUBE_CLIENT_SECRET?.trim() || ''

// force-ssl grants both reading live chat / broadcasts and posting chat
// messages, so a single scope powers auto-discovery *and* sending.
const SCOPES = ['https://www.googleapis.com/auth/youtube.force-ssl'].join(' ')

export interface YouTubeTokens {
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

// In-flight auth attempt. A second connect click should cancel the first so we
// can re-bind the loopback port.
let activeAuth: { server: Server; cancel: (reason: Error) => void } | null = null

export async function initiateYouTubeAuth(
  clientId: string,
  clientSecret: string
): Promise<YouTubeTokens> {
  if (!clientId.trim()) throw new Error('YouTube OAuth client ID is required before connecting.')
  if (!clientSecret.trim()) throw new Error('YouTube OAuth client secret is required before connecting.')

  await cancelActiveAuth(new Error('YouTube auth canceled — restarted by a new connect attempt.'))

  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const state = randomBytes(32).toString('base64url')

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    // access_type=offline + prompt=consent guarantee Google returns a refresh
    // token every time (it otherwise only hands one out on first authorization).
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    state
  })

  await shell.openExternal(`${AUTH_URL}?${params.toString()}`)

  const code = await waitForCallback(state)
  return exchangeCodeForTokens(clientId, clientSecret, code, codeVerifier)
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
      finalize(() => reject(new Error('YouTube auth timed out — no response within 5 minutes')))
    }, 5 * 60 * 1000)

    const server = createServer((req, res) => {
      try {
        const url = new URL(req.url ?? '/', `http://127.0.0.1:${YOUTUBE_REDIRECT_PORT}`)
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
          ? `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ilyStream — YouTube</title><style>body{font-family:system-ui,sans-serif;background:#0b0d10;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center}.card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:40px 48px;max-width:400px}</style></head><body><div class="card"><h1 style="color:#ff0000;margin:0 0 12px">✓ Connected!</h1><p style="margin:0;opacity:.7">You can close this tab and return to ilyStream.</p></div></body></html>`
          : `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ilyStream — YouTube</title><style>body{font-family:system-ui,sans-serif;background:#0b0d10;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center}.card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:40px 48px;max-width:400px}</style></head><body><div class="card"><h1 style="color:#ef4444;margin:0 0 12px">✗ Auth failed</h1><p style="margin:0;opacity:.7">Close this tab and try again in ilyStream.</p></div></body></html>`

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(html, 'utf8')

        if (code && validState) {
          finalize(() => resolve(code))
        } else if (!validState) {
          finalize(() => reject(new Error('YouTube auth state mismatch. Try connecting again.')))
        } else {
          finalize(() => reject(new Error(`YouTube auth denied: ${error ?? 'unknown'}`)))
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

    server.listen(YOUTUBE_REDIRECT_PORT, '127.0.0.1', () => {
      console.log(`[youtube-auth] Callback server listening on port ${YOUTUBE_REDIRECT_PORT}`)
    })

    server.on('error', (err) => {
      finalize(() =>
        reject(
          new Error(
            `Could not start YouTube callback server on port ${YOUTUBE_REDIRECT_PORT}: ${err.message}`
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
): Promise<YouTubeTokens> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier
    }).toString()
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`YouTube token exchange failed (${response.status}): ${text}`)
  }

  const data = (await response.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
  }

  if (!data.refresh_token) {
    throw new Error(
      'YouTube did not return a refresh token. Remove ilyStream from your Google account permissions (myaccount.google.com/permissions) and connect again.'
    )
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in
  }
}
