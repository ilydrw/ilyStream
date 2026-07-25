import { describe, expect, it, vi } from 'vitest'
import {
  buildKickSubscriptionChannels,
  fetchKickChannelInfo,
  fetchKickViewerCount,
  normalizeKickPusherEventName,
  parseKickChannelInfo,
  parseKickViewerCount,
  resolveKickChannel,
  resolveKickViewerCount,
  sanitizeKickSlug,
  type KickFetch
} from './kick-realtime'

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  }
}

describe('parseKickChannelInfo', () => {
  it('reads channel id, chatroom id, and user id from the v2 channel shape', () => {
    const info = parseKickChannelInfo('xqc', {
      id: 668,
      user_id: 676,
      slug: 'xQc',
      chatroom: { id: 836, channel_id: 668 }
    })

    expect(info).toEqual({ slug: 'xQc', channelId: 668, chatroomId: 836, userId: 676 })
  })

  it('falls back to a flat chatroom_id field', () => {
    const info = parseKickChannelInfo('creator', { id: 12, chatroom_id: 34 })
    expect(info).toEqual({ slug: 'creator', channelId: 12, chatroomId: 34, userId: undefined })
  })

  it('returns null when neither id is present', () => {
    expect(parseKickChannelInfo('creator', { foo: 'bar' })).toBeNull()
    expect(parseKickChannelInfo('creator', null)).toBeNull()
  })
})

describe('fetchKickChannelInfo', () => {
  it('resolves from the v2 endpoint on the first try', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ id: 1, chatroom: { id: 2 } })
    ) as unknown as KickFetch

    const info = await fetchKickChannelInfo('creator', fetchImpl)

    expect(info).toEqual({ slug: 'creator', channelId: 1, chatroomId: 2, userId: undefined })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(String((fetchImpl as any).mock.calls[0][0])).toContain('/api/v2/channels/creator')
  })

  it('falls back to the v1 endpoint when v2 fails', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes('/v2/')
        ? jsonResponse({}, false, 403)
        : jsonResponse({ id: 5, chatroom: { id: 9 } })
    ) as unknown as KickFetch

    const info = await fetchKickChannelInfo('creator', fetchImpl)

    expect(info).toEqual({ slug: 'creator', channelId: 5, chatroomId: 9, userId: undefined })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('returns null when every endpoint fails', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false, 403)) as unknown as KickFetch
    expect(await fetchKickChannelInfo('creator', fetchImpl)).toBeNull()
  })
})

describe('parseKickViewerCount', () => {
  it('reads the livestream viewer_count field from Kick channel payloads', () => {
    expect(
      parseKickViewerCount({
        id: 668,
        livestream: { is_live: true, viewer_count: 6316 }
      })
    ).toBe(6316)
  })

  it('returns zero for a valid offline channel', () => {
    expect(parseKickViewerCount({ id: 668, livestream: null })).toBe(0)
    expect(parseKickViewerCount({ id: 668, livestream: { is_live: false } })).toBe(0)
  })

  it('rejects malformed and negative viewer counts', () => {
    expect(parseKickViewerCount({ id: 668 })).toBeNull()
    expect(parseKickViewerCount({ id: 668, livestream: { viewer_count: -1 } })).toBeNull()
    expect(parseKickViewerCount({ id: 668, livestream: { viewer_count: '' } })).toBeNull()
    expect(parseKickViewerCount('<html>Cloudflare challenge</html>')).toBeNull()
  })
})

describe('fetchKickViewerCount', () => {
  it('falls back to v1 and keeps only safe source metadata in raw output', async () => {
    const payload = { id: 5, livestream: { is_live: true, viewer_count: '42' } }
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes('/v2/')
        ? jsonResponse({}, false, 403)
        : jsonResponse(payload)
    ) as unknown as KickFetch

    const snapshot = await fetchKickViewerCount('creator', fetchImpl)

    expect(snapshot).toEqual({
      count: 42,
      raw: {
        source: 'kick-channel-api',
        channelId: 5,
        livestreamId: undefined,
        isLive: true
      }
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

describe('resolveKickChannel', () => {
  it('prefers the net (Chromium) transport, priming the session first', async () => {
    const calls: string[] = []
    const netFetch = vi.fn(async (url: string) => {
      calls.push(url)
      // First call is the priming HTML visit; then the API lookup.
      if (!url.includes('/api/')) return jsonResponse('<html></html>')
      return jsonResponse({ id: 1, chatroom: { id: 2 } })
    }) as unknown as KickFetch
    const nodeFetch = vi.fn(async () => jsonResponse({}, false, 500)) as unknown as KickFetch

    const info = await resolveKickChannel('creator', { netFetch, nodeFetch })

    expect(info.chatroomId).toBe(2)
    expect(nodeFetch).not.toHaveBeenCalled()
    expect(calls[0]).toContain('https://kick.com/creator')
  })

  it('falls back to node fetch when the net transport is unavailable', async () => {
    const nodeFetch = vi.fn(async () =>
      jsonResponse({ id: 3, chatroom: { id: 4 } })
    ) as unknown as KickFetch

    const info = await resolveKickChannel('@creator', { netFetch: null, nodeFetch })

    expect(info).toMatchObject({ channelId: 3, chatroomId: 4 })
    expect(nodeFetch).toHaveBeenCalled()
  })

  it('throws (for backoff-driven retry) when the chatroom id cannot be resolved', async () => {
    const nodeFetch = vi.fn(async () => jsonResponse({}, false, 403)) as unknown as KickFetch
    await expect(resolveKickChannel('creator', { netFetch: null, nodeFetch })).rejects.toThrow(
      /Could not resolve Kick channel/
    )
  })

  it('rejects an empty channel name up front', async () => {
    await expect(resolveKickChannel('   ', { netFetch: null })).rejects.toThrow(
      /channel name is required/
    )
  })
})

describe('resolveKickViewerCount', () => {
  it('prefers Electron net and does not touch the Node fallback on success', async () => {
    const netFetch = vi.fn(async () =>
      jsonResponse({ id: 1, livestream: { is_live: true, viewer_count: 25 } })
    ) as unknown as KickFetch
    const nodeFetch = vi.fn(async () => jsonResponse({}, false, 500)) as unknown as KickFetch

    const snapshot = await resolveKickViewerCount('creator', { netFetch, nodeFetch })

    expect(snapshot?.count).toBe(25)
    expect(netFetch).toHaveBeenCalledTimes(1)
    expect(nodeFetch).not.toHaveBeenCalled()
  })

  it('returns null when every transport is blocked', async () => {
    const netFetch = vi.fn(async () => jsonResponse({}, false, 403)) as unknown as KickFetch
    const nodeFetch = vi.fn(async () => jsonResponse({}, false, 403)) as unknown as KickFetch

    expect(await resolveKickViewerCount('creator', { netFetch, nodeFetch })).toBeNull()
    expect(nodeFetch).toHaveBeenCalled()
  })
})

describe('buildKickSubscriptionChannels', () => {
  it('subscribes to both the chatroom and channel Pusher topics', () => {
    const channels = buildKickSubscriptionChannels({
      slug: 'creator',
      channelId: 668,
      chatroomId: 836
    })

    expect(channels).toEqual([
      'chatrooms.836.v2',
      'chatroom_836',
      'channel.668',
      'channel_668'
    ])
  })

  it('omits topics for ids that are missing', () => {
    expect(
      buildKickSubscriptionChannels({ slug: 'creator', channelId: 0, chatroomId: 836 })
    ).toEqual(['chatrooms.836.v2', 'chatroom_836'])
  })
})

describe('normalizeKickPusherEventName', () => {
  it('strips the Laravel event namespace', () => {
    expect(normalizeKickPusherEventName('App\\Events\\ChatMessageEvent')).toBe('ChatMessageEvent')
    expect(normalizeKickPusherEventName('App\\Events\\GiftedSubscriptionsEvent')).toBe(
      'GiftedSubscriptionsEvent'
    )
  })

  it('leaves unnamespaced events untouched', () => {
    expect(normalizeKickPusherEventName('pusher:ping')).toBe('pusher:ping')
    expect(normalizeKickPusherEventName('')).toBe('')
  })
})

describe('sanitizeKickSlug', () => {
  it('strips @ prefixes and kick.com urls', () => {
    expect(sanitizeKickSlug('@creator')).toBe('creator')
    expect(sanitizeKickSlug('https://kick.com/creator?foo=1')).toBe('creator')
    expect(sanitizeKickSlug('  Creator  ')).toBe('Creator')
  })
})
