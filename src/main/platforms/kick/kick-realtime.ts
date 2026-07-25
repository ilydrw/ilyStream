/**
 * Kick real-time (Pusher) transport helpers.
 *
 * Kick's *official* event delivery is webhook-only: Kick's servers POST to a
 * public URL. A desktop app has no public URL, so those webhooks never reach a
 * 127.0.0.1 receiver — which is exactly why Kick events were being missed.
 *
 * Every zero-config Kick chat integration (StreamElements included) instead
 * reads Kick's real-time data over Pusher: an *outbound* WebSocket that works
 * from behind NAT with no public endpoint and no OAuth. This module resolves
 * the channel/chatroom ids needed to subscribe and centralizes the Pusher
 * protocol constants so the connector stays focused on event mapping.
 */

// Kick's public Pusher app. This key/cluster has been stable for years and is
// the same one kick.com's own web client uses for live chat.
const KICK_PUSHER_APP_KEY = '32cbd69e4b950bf97679'
const KICK_PUSHER_CLUSTER = 'us2'
const KICK_PUSHER_CLIENT_VERSION = '8.4.0'

export const KICK_PUSHER_WS_URL =
  `wss://ws-${KICK_PUSHER_CLUSTER}.pusher.com/app/${KICK_PUSHER_APP_KEY}` +
  `?protocol=7&client=js&version=${KICK_PUSHER_CLIENT_VERSION}&flash=false`

/** Pusher's default inactivity window (seconds) when the handshake omits one. */
export const KICK_PUSHER_DEFAULT_ACTIVITY_TIMEOUT_S = 120

// Realistic Chrome headers. Kick's channel API sits behind Cloudflare, which
// bot-blocks datacenter/undici requests; a browser-shaped request from
// Chromium's own network stack (Electron `net`) passes far more often.
export const KICK_BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://kick.com/',
  Origin: 'https://kick.com',
  'Sec-Ch-Ua': '"Google Chrome";v="126", "Not:A-Brand";v="8", "Chromium";v="126"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache'
}

export interface KickChannelInfo {
  slug: string
  /** Numeric channel id — the `channel.{id}` Pusher channel (subs, follows, live). */
  channelId: number
  /** Numeric chatroom id — the `chatrooms.{id}.v2` Pusher channel (chat). */
  chatroomId: number
  userId?: number
}

export interface KickViewerCountSnapshot {
  count: number
  raw: unknown
}

export type KickFetch = (url: string, init?: Record<string, unknown>) => Promise<{
  ok: boolean
  status: number
  json: () => Promise<unknown>
  text?: () => Promise<string>
}>

export interface ResolveKickChannelDeps {
  /** Chromium-stack fetch (Electron `net`). Preferred; best Cloudflare posture. */
  netFetch?: KickFetch | null
  /** Node/global fetch fallback. */
  nodeFetch?: KickFetch
}

/** The Pusher channel names carrying a channel's chat and events. */
export function buildKickSubscriptionChannels(info: KickChannelInfo): string[] {
  const channels: string[] = []
  if (info.chatroomId > 0) {
    channels.push(`chatrooms.${info.chatroomId}.v2`, `chatroom_${info.chatroomId}`)
  }
  if (info.channelId > 0) {
    channels.push(`channel.${info.channelId}`, `channel_${info.channelId}`)
  }
  return Array.from(new Set(channels))
}

/** Strips Pusher/Laravel event namespaces: `App\Events\ChatMessageEvent` → `ChatMessageEvent`. */
export function normalizeKickPusherEventName(eventName: unknown): string {
  const raw = String(eventName || '').trim()
  if (!raw) return ''
  const lastSlash = raw.lastIndexOf('\\')
  return lastSlash >= 0 ? raw.slice(lastSlash + 1) : raw
}

export function parseKickChannelInfo(slug: string, json: unknown): KickChannelInfo | null {
  if (!json || typeof json !== 'object') return null
  const record = json as Record<string, any>
  const chatroom = record.chatroom && typeof record.chatroom === 'object' ? record.chatroom : {}

  const channelId = toPositiveInt(record.id ?? record.channel_id ?? chatroom.channel_id)
  const chatroomId = toPositiveInt(chatroom.id ?? record.chatroom_id ?? chatroom.chatroom_id)
  const userId = toPositiveInt(record.user_id ?? record.user?.id)

  if (!chatroomId && !channelId) return null

  return {
    slug: typeof record.slug === 'string' && record.slug.trim() ? record.slug.trim() : slug,
    channelId: channelId ?? 0,
    chatroomId: chatroomId ?? 0,
    userId: userId ?? undefined
  }
}

/**
 * Reads the live audience from Kick's internal channel payload. A valid channel
 * with no livestream is an authoritative zero; an unrecognized payload remains
 * null so Cloudflare/error documents never clear a real count accidentally.
 */
export function parseKickViewerCount(json: unknown): number | null {
  if (!json || typeof json !== 'object') return null
  const record = json as Record<string, any>
  const livestream = Object.prototype.hasOwnProperty.call(record, 'livestream')
    ? record.livestream
    : record.live_stream

  if (livestream === null && toPositiveInt(record.id ?? record.channel_id)) {
    return 0
  }
  if (!livestream || typeof livestream !== 'object') return null

  const count = toNonNegativeInt(
    livestream.viewer_count ??
    livestream.viewerCount ??
    livestream.viewers ??
    record.viewer_count ??
    record.viewerCount
  )
  if (count !== null) return count

  return livestream.is_live === false ? 0 : null
}

/** Single-endpoint channel lookup, trying the v2 then v1 internal API. */
export async function fetchKickChannelInfo(
  slug: string,
  fetchImpl: KickFetch
): Promise<KickChannelInfo | null> {
  return fetchKickChannelValue(slug, fetchImpl, (json) => parseKickChannelInfo(slug, json))
}

/** Fetches one viewer-count snapshot with a specific network transport. */
export async function fetchKickViewerCount(
  slug: string,
  fetchImpl: KickFetch
): Promise<KickViewerCountSnapshot | null> {
  return fetchKickChannelValue(slug, fetchImpl, (json) => {
    const count = parseKickViewerCount(json)
    return count === null ? null : { count, raw: summarizeKickViewerCountPayload(json) }
  })
}

/**
 * Resolves a channel's `{ channelId, chatroomId }` for Pusher subscription,
 * trying Chromium's network stack first (defeats most Cloudflare blocks) then
 * falling back to Node fetch. Throws on total failure so the connector's
 * exponential-backoff reconnect retries — transient Cloudflare blocks clear.
 */
export async function resolveKickChannel(
  slug: string,
  deps: ResolveKickChannelDeps = {}
): Promise<KickChannelInfo> {
  const cleanedSlug = sanitizeKickSlug(slug)
  if (!cleanedSlug) throw new Error('Kick channel name is required')

  const netFetch = deps.netFetch === undefined ? await loadElectronNetFetch() : deps.netFetch
  const nodeFetch = deps.nodeFetch ?? defaultNodeFetch

  const transports: KickFetch[] = []
  if (netFetch) {
    await primeKickSession(netFetch, cleanedSlug)
    transports.push(netFetch)
  }
  transports.push(nodeFetch)

  for (const transport of transports) {
    const info = await fetchKickChannelInfo(cleanedSlug, transport)
    // The chatroom id is what carries chat; require it before declaring success.
    if (info && info.chatroomId > 0) return info
  }

  throw new Error(
    `Could not resolve Kick channel "${cleanedSlug}". Kick's channel API may be temporarily blocking the lookup — retrying automatically.`
  )
}

/**
 * Best-effort viewer-count lookup using the same Cloudflare-tolerant transport
 * order as channel resolution. Returns null instead of throwing so telemetry
 * failures never affect the real-time event socket.
 */
export async function resolveKickViewerCount(
  slug: string,
  deps: ResolveKickChannelDeps = {}
): Promise<KickViewerCountSnapshot | null> {
  const cleanedSlug = sanitizeKickSlug(slug)
  if (!cleanedSlug) return null

  const netFetch = deps.netFetch === undefined ? await loadElectronNetFetch() : deps.netFetch
  const nodeFetch = deps.nodeFetch ?? defaultNodeFetch

  if (netFetch) {
    const snapshot = await fetchKickViewerCount(cleanedSlug, netFetch)
    if (snapshot) return snapshot

    // A stale/missing Cloudflare session is the common failure mode. Prime only
    // after a failed API attempt so successful polls stay to one request.
    await primeKickSession(netFetch, cleanedSlug)
    const primedSnapshot = await fetchKickViewerCount(cleanedSlug, netFetch)
    if (primedSnapshot) return primedSnapshot
  }

  return fetchKickViewerCount(cleanedSlug, nodeFetch)
}

export function sanitizeKickSlug(value: unknown): string {
  let channelName = String(value || '').trim()
  if (channelName.includes('kick.com/')) {
    channelName = channelName.split('kick.com/').pop()?.split(/[?#/]/)[0] || channelName
  }
  return (channelName.startsWith('@') ? channelName.slice(1) : channelName).trim()
}

/**
 * Best-effort visit to the channel's public page so Cloudflare issues a
 * `cf_clearance` cookie into the shared Electron session before the API call.
 * Failures are swallowed — the API attempt runs regardless.
 */
async function primeKickSession(netFetch: KickFetch, slug: string): Promise<void> {
  try {
    await netFetch(`https://kick.com/${encodeURIComponent(slug)}`, {
      method: 'GET',
      headers: {
        ...KICK_BROWSER_HEADERS,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate'
      }
    })
  } catch {
    // Priming is optional.
  }
}

async function loadElectronNetFetch(): Promise<KickFetch | null> {
  try {
    const electron: any = await import('electron')
    const net = electron?.net ?? electron?.default?.net
    if (net && typeof net.fetch === 'function') {
      return (url, init) => net.fetch(url, init)
    }
  } catch {
    // Not running under Electron (e.g. unit tests) — fall back to Node fetch.
  }
  return null
}

const defaultNodeFetch: KickFetch = (url, init) =>
  fetch(url, init as RequestInit) as unknown as ReturnType<KickFetch>

async function fetchKickChannelValue<T>(
  slug: string,
  fetchImpl: KickFetch,
  parse: (json: unknown) => T | null
): Promise<T | null> {
  for (const version of ['v2', 'v1'] as const) {
    try {
      const response = await fetchImpl(
        `https://kick.com/api/${version}/channels/${encodeURIComponent(slug)}`,
        { method: 'GET', headers: KICK_BROWSER_HEADERS }
      )
      if (!response.ok) continue
      const json = await response.json().catch(() => null)
      const value = parse(json)
      if (value !== null) return value
    } catch {
      // Try the next endpoint/transport.
    }
  }
  return null
}

function toPositiveInt(value: unknown): number | null {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : null
}

function toNonNegativeInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) && num >= 0 ? Math.floor(num) : null
}

function summarizeKickViewerCountPayload(json: unknown): Record<string, unknown> {
  const record = json && typeof json === 'object' ? json as Record<string, any> : {}
  const livestream = Object.prototype.hasOwnProperty.call(record, 'livestream')
    ? record.livestream
    : record.live_stream

  return {
    source: 'kick-channel-api',
    channelId: toPositiveInt(record.id ?? record.channel_id) ?? undefined,
    livestreamId: livestream && typeof livestream === 'object'
      ? toPositiveInt(livestream.id) ?? undefined
      : undefined,
    isLive: Boolean(livestream && typeof livestream === 'object' && livestream.is_live !== false)
  }
}
