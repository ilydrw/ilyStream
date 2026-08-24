/**
 * Minimal fetch-backed replacement for the slice of the `googleapis` package the
 * YouTube integration used — `google.auth.OAuth2` plus
 * `google.youtube('v3').<resource>.<method>({...}) -> { data }`. Dropping the
 * dependency removes ~196 MB of node_modules / packaged weight for what is a
 * handful of plain HTTPS calls.
 *
 * The surface intentionally mirrors googleapis so the call sites in
 * youtube-connector.ts / youtube-live.ts are unchanged apart from the import
 * specifier: methods return `{ data }` and errors carry `err.response.status` /
 * `err.response.data.error` / `err.code`, which the connector's quota + auth
 * classification (getYouTubeQuotaExceededType, describeYouTubeLiveError) reads.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const API_BASE = 'https://www.googleapis.com/youtube/v3'

/** Error shaped like a googleapis/gaxios error so existing classifiers keep working. */
export class YouTubeApiError extends Error {
  readonly code: number
  readonly response: { status: number; data: unknown }

  constructor(status: number, data: unknown) {
    const message =
      (data as { error?: { message?: string } })?.error?.message
      || `YouTube API request failed (${status})`
    super(message)
    this.name = 'YouTubeApiError'
    this.code = status
    this.response = { status, data }
  }
}

export interface OAuthCredentials {
  access_token?: string
  refresh_token?: string
}

/**
 * Drop-in for `google.auth.OAuth2`. Holds credentials and refreshes the access
 * token from the refresh token + client credentials on demand — googleapis did
 * this transparently; here it happens lazily on a 401 (and up front when no
 * access token is present).
 */
export class OAuth2Client {
  private accessToken: string | undefined
  private refreshToken: string | undefined

  constructor(
    private readonly clientId?: string,
    private readonly clientSecret?: string
  ) {}

  setCredentials(credentials: OAuthCredentials): void {
    this.accessToken = credentials.access_token || undefined
    this.refreshToken = credentials.refresh_token || undefined
  }

  getAccessToken(): string | undefined {
    return this.accessToken
  }

  canRefresh(): boolean {
    return Boolean(this.refreshToken && this.clientId && this.clientSecret)
  }

  async refresh(): Promise<string> {
    if (!this.canRefresh()) {
      throw new YouTubeApiError(401, {
        error: {
          message: 'invalid_grant: missing refresh token or client credentials',
          errors: [{ reason: 'authError' }]
        }
      })
    }

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId as string,
        client_secret: this.clientSecret as string,
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken as string
      }).toString()
    })

    const text = await response.text()
    const data = text ? JSON.parse(text) : {}
    if (!response.ok) {
      // Normalize Google's token-endpoint error ({ error, error_description })
      // into the Data-API error shape the classifiers expect.
      const normalized =
        (data as { error?: unknown })?.error && typeof (data as { error?: unknown }).error === 'object'
          ? data
          : {
              error: {
                message: (data as { error_description?: string; error?: string }).error_description
                  || (data as { error?: string }).error
                  || 'token refresh failed',
                errors: [{ reason: 'invalid_grant' }]
              }
            }
      throw new YouTubeApiError(response.status, normalized)
    }

    this.accessToken = (data as { access_token: string }).access_token
    return this.accessToken
  }
}

type Auth = OAuth2Client | string | undefined

function isOAuthClient(auth: Auth): auth is OAuth2Client {
  return auth instanceof OAuth2Client
}

interface RequestOptions {
  params?: Record<string, unknown>
  body?: unknown
}

async function apiRequest(
  auth: Auth,
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  options: RequestOptions
): Promise<unknown> {
  // No access token yet but we can mint one — do it up front to avoid a
  // guaranteed 401 round-trip (common right after an app restart, when the
  // stored access token is empty but the refresh token still authorizes).
  if (isOAuthClient(auth) && !auth.getAccessToken() && auth.canRefresh()) {
    await auth.refresh()
  }

  const buildRequest = (): { url: string; init: RequestInit } => {
    const url = new URL(`${API_BASE}/${path}`)
    for (const [key, value] of Object.entries(options.params ?? {})) {
      if (value === undefined || value === null) continue
      url.searchParams.set(key, Array.isArray(value) ? value.join(',') : String(value))
    }

    const headers: Record<string, string> = {}
    let body: string | undefined
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(options.body)
    }

    if (isOAuthClient(auth)) {
      const token = auth.getAccessToken()
      if (token) headers.Authorization = `Bearer ${token}`
    } else if (typeof auth === 'string' && auth) {
      url.searchParams.set('key', auth)
    }

    return { url: url.toString(), init: { method, headers, body } }
  }

  const send = async (): Promise<Response> => {
    const { url, init } = buildRequest()
    return fetch(url, init)
  }

  let response = await send()
  // Transparent refresh-and-retry on expiry, matching googleapis behavior.
  if (response.status === 401 && isOAuthClient(auth) && auth.canRefresh()) {
    try {
      await auth.refresh()
      response = await send()
    } catch {
      // fall through and surface the original 401 below
    }
  }

  const text = await response.text()
  const data = text ? JSON.parse(text) : {}
  if (!response.ok) {
    throw new YouTubeApiError(response.status, data)
  }
  return data
}

type ListParams = Record<string, unknown>
interface WriteParams {
  part?: string[]
  requestBody?: unknown
  [key: string]: unknown
}

function wrap(data: unknown): { data: unknown } {
  return { data }
}

/** Drop-in for `google.youtube({ version, auth })`, covering the resources used. */
export function youtube(options: { version: string; auth: Auth }): unknown {
  const auth = options.auth
  return {
    channels: {
      list: async (p: ListParams) => wrap(await apiRequest(auth, 'GET', 'channels', { params: p }))
    },
    search: {
      list: async (p: ListParams) => wrap(await apiRequest(auth, 'GET', 'search', { params: p }))
    },
    videos: {
      list: async (p: ListParams) => wrap(await apiRequest(auth, 'GET', 'videos', { params: p })),
      update: async (p: WriteParams) =>
        wrap(await apiRequest(auth, 'PUT', 'videos', { params: { part: p.part }, body: p.requestBody }))
    },
    liveChatMessages: {
      list: async (p: ListParams) =>
        wrap(await apiRequest(auth, 'GET', 'liveChat/messages', { params: p }))
    },
    liveBroadcasts: {
      list: async (p: ListParams) =>
        wrap(await apiRequest(auth, 'GET', 'liveBroadcasts', { params: p })),
      insert: async (p: WriteParams) =>
        wrap(await apiRequest(auth, 'POST', 'liveBroadcasts', { params: { part: p.part }, body: p.requestBody })),
      bind: async (p: WriteParams) =>
        wrap(await apiRequest(auth, 'POST', 'liveBroadcasts/bind', {
          params: { id: p.id, part: p.part, streamId: p.streamId }
        }))
    },
    liveStreams: {
      list: async (p: ListParams) =>
        wrap(await apiRequest(auth, 'GET', 'liveStreams', { params: p })),
      insert: async (p: WriteParams) =>
        wrap(await apiRequest(auth, 'POST', 'liveStreams', { params: { part: p.part }, body: p.requestBody }))
    }
  }
}

/** `google`-shaped namespace so call sites read `const { google } = await import('./youtube-api')`. */
export const google = {
  auth: { OAuth2: OAuth2Client },
  youtube
}
