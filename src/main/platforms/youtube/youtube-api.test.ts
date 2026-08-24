import { afterEach, describe, expect, it, vi } from 'vitest'
import { OAuth2Client, YouTubeApiError, google } from './youtube-api'

interface FakeResponse {
  ok: boolean
  status: number
  text: () => Promise<string>
}

function jsonResponse(status: number, body: unknown): FakeResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body)
  }
}

function mockFetch(responses: FakeResponse[]) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  let i = 0
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const res = responses[Math.min(i, responses.length - 1)]
    i++
    return res as unknown as Response
  })
  vi.stubGlobal('fetch', fn)
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('youtube-api shim', () => {
  it('builds an API-key GET with comma-joined array params and returns { data }', async () => {
    const calls = mockFetch([jsonResponse(200, { items: [{ id: 'x' }] })])
    const yt = google.youtube({ version: 'v3', auth: 'API_KEY' }) as any

    const res = await yt.videos.list({ part: ['snippet', 'liveStreamingDetails'], id: ['abc123'] })

    expect(res).toEqual({ data: { items: [{ id: 'x' }] } })
    const url = new URL(calls[0].url)
    expect(url.pathname).toBe('/youtube/v3/videos')
    expect(url.searchParams.get('part')).toBe('snippet,liveStreamingDetails')
    expect(url.searchParams.get('id')).toBe('abc123')
    expect(url.searchParams.get('key')).toBe('API_KEY')
    expect(calls[0].init.method).toBe('GET')
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('sends a Bearer header for an OAuth client and no key param', async () => {
    const calls = mockFetch([jsonResponse(200, { items: [] })])
    const oauth = new OAuth2Client('cid', 'secret')
    oauth.setCredentials({ access_token: 'TOKEN', refresh_token: 'REFRESH' })
    const yt = google.youtube({ version: 'v3', auth: oauth }) as any

    await yt.liveBroadcasts.list({ part: ['id'], mine: true, broadcastStatus: 'active' })

    const url = new URL(calls[0].url)
    expect(url.searchParams.get('mine')).toBe('true')
    expect(url.searchParams.get('key')).toBeNull()
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer TOKEN')
  })

  it('refreshes up front when there is no access token but a refresh token', async () => {
    const calls = mockFetch([
      jsonResponse(200, { access_token: 'FRESH' }), // token endpoint
      jsonResponse(200, { items: [] }) // actual request
    ])
    const oauth = new OAuth2Client('cid', 'secret')
    oauth.setCredentials({ refresh_token: 'REFRESH' })
    const yt = google.youtube({ version: 'v3', auth: oauth }) as any

    await yt.channels.list({ part: ['id'], forHandle: '@someone' })

    expect(calls[0].url).toContain('oauth2.googleapis.com/token')
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe('Bearer FRESH')
    expect(oauth.getAccessToken()).toBe('FRESH')
  })

  it('refreshes and retries once on a 401', async () => {
    const calls = mockFetch([
      jsonResponse(401, { error: { message: 'expired' } }), // first request
      jsonResponse(200, { access_token: 'FRESH2' }), // refresh
      jsonResponse(200, { items: [{ id: 'ok' }] }) // retry
    ])
    const oauth = new OAuth2Client('cid', 'secret')
    oauth.setCredentials({ access_token: 'STALE', refresh_token: 'REFRESH' })
    const yt = google.youtube({ version: 'v3', auth: oauth }) as any

    const res = await yt.videos.list({ part: ['snippet'], id: ['v'] })

    expect(res).toEqual({ data: { items: [{ id: 'ok' }] } })
    expect(calls).toHaveLength(3)
    expect((calls[2].init.headers as Record<string, string>).Authorization).toBe('Bearer FRESH2')
  })

  it('throws a YouTubeApiError carrying response.status + error body (for quota classification)', async () => {
    mockFetch([
      jsonResponse(403, { error: { message: 'quota exceeded', errors: [{ reason: 'quotaExceeded' }] } })
    ])
    const yt = google.youtube({ version: 'v3', auth: 'API_KEY' }) as any

    let caught: unknown
    try {
      await yt.search.list({ part: ['id'], channelId: 'c', eventType: 'live', type: 'video' })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(YouTubeApiError)
    const err = caught as any
    expect(err.response.status).toBe(403)
    expect(err.code).toBe(403)
    expect(err.response.data.error.errors[0].reason).toBe('quotaExceeded')
  })

  it('POSTs a JSON body with part in the query for inserts', async () => {
    const calls = mockFetch([jsonResponse(200, { id: 'stream1' })])
    const oauth = new OAuth2Client('cid', 'secret')
    oauth.setCredentials({ access_token: 'TOKEN' })
    const yt = google.youtube({ version: 'v3', auth: oauth }) as any

    const requestBody = { snippet: { title: 'ilyStream' }, cdn: { ingestionType: 'rtmp' } }
    const res = await yt.liveStreams.insert({ part: ['snippet', 'cdn', 'contentDetails'], requestBody })

    expect(res).toEqual({ data: { id: 'stream1' } })
    const url = new URL(calls[0].url)
    expect(url.pathname).toBe('/youtube/v3/liveStreams')
    expect(url.searchParams.get('part')).toBe('snippet,cdn,contentDetails')
    expect(calls[0].init.method).toBe('POST')
    expect((calls[0].init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(JSON.parse(calls[0].init.body as string)).toEqual(requestBody)
  })
})
