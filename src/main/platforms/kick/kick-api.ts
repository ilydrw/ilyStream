export const DEFAULT_KICK_EVENT_SUBSCRIPTIONS = [
  'chat.message.sent',
  'channel.followed',
  'channel.subscription.new',
  'channel.subscription.renewal',
  'channel.subscription.gifts',
  'livestream.status.updated',
  'livestream.metadata.updated'
] as const

export interface KickSubscribeEventsInput {
  clientId: string
  clientSecret: string
  accessToken?: string
  broadcasterUserId?: string | number
  channelName?: string
  events?: string[]
}

export interface KickEventSubscriptionResult {
  ok: boolean
  subscriptions: Array<{
    name: string
    version: number
    subscriptionId?: string
    error?: string
  }>
  message?: string
}

type FetchLike = typeof fetch

interface KickTokenResponse {
  access_token?: string
  token_type?: string
  expires_in?: number
  error?: string
  message?: string
}

export async function createKickAppAccessToken(
  input: Pick<KickSubscribeEventsInput, 'clientId' | 'clientSecret'>,
  fetchImpl: FetchLike = fetch
): Promise<string> {
  const clientId = input.clientId.trim()
  const clientSecret = input.clientSecret.trim()
  if (!clientId || !clientSecret) {
    throw new Error('Kick Client ID and Client Secret are required')
  }

  const response = await fetchImpl('https://id.kick.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret
    })
  })
  const payload = await readKickJson<KickTokenResponse>(response)

  if (!response.ok || !payload.access_token) {
    throw new Error(formatKickApiError(payload, response.status, 'Kick app token request failed'))
  }

  return payload.access_token
}

export async function subscribeKickEvents(
  input: KickSubscribeEventsInput,
  fetchImpl: FetchLike = fetch
): Promise<KickEventSubscriptionResult> {
  const explicitBroadcasterUserId = normalizeBroadcasterUserId(input.broadcasterUserId)
  const channelName = sanitizeKickSlug(input.channelName)
  if (!explicitBroadcasterUserId && !channelName) {
    throw new Error('Kick channel name or broadcaster user ID is required for event subscriptions')
  }

  const accessToken = input.accessToken?.trim() || await createKickAppAccessToken(input, fetchImpl)
  const broadcasterUserId = explicitBroadcasterUserId
    ?? await resolveKickBroadcasterUserId(accessToken, channelName, fetchImpl)
  const eventNames = (input.events?.length ? input.events : [...DEFAULT_KICK_EVENT_SUBSCRIPTIONS])
    .map((name) => name.trim())
    .filter(Boolean)

  const response = await fetchImpl('https://api.kick.com/public/v1/events/subscriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      broadcaster_user_id: Math.floor(broadcasterUserId),
      events: eventNames.map((name) => ({ name, version: 1 })),
      method: 'webhook'
    })
  })
  const payload = await readKickJson<{
    data?: Array<{
      name?: string
      version?: number
      subscription_id?: string
      error?: string
    }>
    message?: string
    error?: string
  }>(response)

  if (!response.ok) {
    throw new Error(formatKickApiError(payload, response.status, 'Kick event subscription request failed'))
  }

  const subscriptions = (payload.data || []).map((entry) => ({
    name: entry.name || 'unknown',
    version: Number(entry.version || 1),
    subscriptionId: entry.subscription_id || undefined,
    error: entry.error || undefined
  }))

  return {
    ok: subscriptions.length > 0 && subscriptions.every((entry) => !entry.error),
    subscriptions,
    message: payload.message
  }
}

/**
 * Lists the event names this app is already subscribed to for a broadcaster.
 * Returns null when the lookup fails so callers can fall back to a blind
 * subscribe rather than silently skipping.
 */
export async function listKickSubscribedEventNames(
  accessToken: string,
  broadcasterUserId: number,
  fetchImpl: FetchLike = fetch
): Promise<Set<string> | null> {
  try {
    const response = await fetchImpl('https://api.kick.com/public/v1/events/subscriptions', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    })
    if (!response.ok) return null

    const payload = await readKickJson<{
      data?: Array<{ event?: string; name?: string; broadcaster_user_id?: number }>
    }>(response)

    const names = new Set<string>()
    for (const entry of payload.data || []) {
      if (normalizeBroadcasterUserId(entry.broadcaster_user_id) !== broadcasterUserId) continue
      const name = String(entry.event || entry.name || '').trim()
      if (name) names.add(name)
    }
    return names
  } catch {
    return null
  }
}

/**
 * Idempotent version of {@link subscribeKickEvents}: only subscribes event
 * names that aren't already registered for the broadcaster, so calling it on
 * every connect doesn't stack duplicate webhook deliveries.
 */
export async function ensureKickEventSubscriptions(
  input: KickSubscribeEventsInput,
  fetchImpl: FetchLike = fetch
): Promise<KickEventSubscriptionResult> {
  const accessToken = input.accessToken?.trim() || await createKickAppAccessToken(input, fetchImpl)
  const broadcasterUserId = normalizeBroadcasterUserId(input.broadcasterUserId)
    ?? await resolveKickBroadcasterUserId(accessToken, input.channelName, fetchImpl)

  const wanted = (input.events?.length ? input.events : [...DEFAULT_KICK_EVENT_SUBSCRIPTIONS])
    .map((name) => name.trim())
    .filter(Boolean)
  const existing = await listKickSubscribedEventNames(accessToken, broadcasterUserId, fetchImpl)
  const missing = existing ? wanted.filter((name) => !existing.has(name)) : wanted

  if (missing.length === 0) {
    return {
      ok: true,
      subscriptions: wanted.map((name) => ({ name, version: 1 })),
      message: 'All Kick event subscriptions already active'
    }
  }

  return subscribeKickEvents({ ...input, accessToken, broadcasterUserId, events: missing }, fetchImpl)
}

export async function resolveKickBroadcasterUserId(
  accessToken: string,
  channelName: unknown,
  fetchImpl: FetchLike = fetch
): Promise<number> {
  const slug = sanitizeKickSlug(channelName)
  if (!slug) {
    throw new Error('Kick channel name or broadcaster user ID is required for event subscriptions')
  }

  const response = await fetchImpl(`https://api.kick.com/public/v1/channels?slug=${encodeURIComponent(slug)}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  })
  const payload = await readKickJson<{
    data?: Array<{ broadcaster_user_id?: number }>
    message?: string
    error?: string
  }>(response)

  if (!response.ok) {
    throw new Error(formatKickApiError(payload, response.status, 'Kick channel lookup failed'))
  }

  const id = normalizeBroadcasterUserId(payload.data?.[0]?.broadcaster_user_id)
  if (!id) {
    throw new Error(`Kick channel "${slug}" was not found`)
  }
  return id
}

async function readKickJson<T>(response: Response): Promise<T> {
  try {
    return await response.json() as T
  } catch {
    return {} as T
  }
}

function formatKickApiError(payload: { message?: string; error?: string }, status: number, fallback: string): string {
  return payload.message || payload.error || `${fallback} (${status})`
}

function normalizeBroadcasterUserId(value: unknown): number | null {
  const id = Number(value)
  return Number.isFinite(id) && id > 0 ? Math.floor(id) : null
}

function sanitizeKickSlug(value: unknown): string {
  let channelName = String(value || '').trim()
  if (channelName.includes('kick.com/')) {
    channelName = channelName.split('kick.com/').pop()?.split(/[?#/]/)[0] || channelName
  }
  return channelName.startsWith('@') ? channelName.slice(1) : channelName
}
