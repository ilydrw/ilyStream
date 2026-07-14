import type { KickConfig } from '../types'
import type { StreamCategory } from '../../../shared/stream-info'
import { createKickAppAccessToken } from './kick-api'
import { refreshKickUserTokens, type KickUserTokens } from './kick-user-auth'

/**
 * Kick stream title/category via the official public API. Category search
 * works with an app (client-credentials) token, but PATCHing the channel
 * needs a user token with channel:write from the kick-user-auth flow.
 */

const CATEGORIES_URL = 'https://api.kick.com/public/v1/categories'
const CHANNELS_URL = 'https://api.kick.com/public/v1/channels'

/** Called with refreshed tokens so they get persisted back into the config. */
export type PersistKickTokens = (tokens: KickUserTokens) => void

export function isKickUserConnected(config: KickConfig | null | undefined): boolean {
  return Boolean(config?.userAccessToken?.trim() || config?.userRefreshToken?.trim())
}

async function ensureKickUserToken(
  config: KickConfig | null | undefined,
  persistTokens?: PersistKickTokens
): Promise<string> {
  const accessToken = config?.userAccessToken?.trim() || ''
  const refreshToken = config?.userRefreshToken?.trim() || ''
  if (!accessToken && !refreshToken) {
    throw new Error('Kick account is not connected. Use "Connect Kick account" on the Kick page first.')
  }

  const expiresAt = Number(config?.userTokenExpiresAt || 0)
  const stillValid = accessToken && (!expiresAt || expiresAt - Date.now() > 60_000)
  if (stillValid) return accessToken

  if (!refreshToken) {
    throw new Error('Kick session expired. Reconnect your Kick account on the Kick page.')
  }
  const refreshed = await refreshKickUserTokens(
    config?.clientId || '',
    config?.clientSecret || '',
    refreshToken
  )
  persistTokens?.(refreshed)
  return refreshed.accessToken
}

export async function searchKickCategories(
  config: KickConfig | null | undefined,
  query: string
): Promise<StreamCategory[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  // Prefer the user token when present; otherwise the app token covers search.
  let token: string
  if (isKickUserConnected(config)) {
    token = await ensureKickUserToken(config)
  } else {
    const clientId = config?.clientId?.trim()
    const clientSecret = config?.clientSecret?.trim()
    if (!clientId || !clientSecret) {
      throw new Error('Add your Kick Client ID and Client Secret on the Kick page first.')
    }
    token = await createKickAppAccessToken({ clientId, clientSecret })
  }

  const response = await fetch(`${CATEGORIES_URL}?q=${encodeURIComponent(trimmed)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  })
  const payload: any = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.message || `Kick category search failed (${response.status})`)
  }

  const items: any[] = Array.isArray(payload?.data) ? payload.data : []
  return items.slice(0, 15).map((item) => ({
    id: String(item?.id ?? ''),
    name: String(item?.name ?? ''),
    boxArtUrl: String(item?.thumbnail ?? '')
  })).filter((item) => item.id && item.name)
}

export async function updateKickStreamInfo(
  config: KickConfig | null | undefined,
  input: { title?: string; categoryId?: string },
  persistTokens?: PersistKickTokens
): Promise<void> {
  const title = input.title?.trim()
  const categoryId = Number(input.categoryId?.trim() || '')
  const hasCategory = Number.isFinite(categoryId) && categoryId > 0
  if (!title && !hasCategory) {
    throw new Error('Nothing to update — set a title or category first.')
  }

  const token = await ensureKickUserToken(config, persistTokens)
  const response = await fetch(CHANNELS_URL, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      ...(title ? { stream_title: title } : {}),
      ...(hasCategory ? { category_id: Math.floor(categoryId) } : {})
    })
  })

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      'Kick rejected the update — the connected account is missing the channel:write scope. Reconnect your Kick account on the Kick page.'
    )
  }
  if (!response.ok) {
    const payload: any = await response.json().catch(() => ({}))
    throw new Error(payload?.message || `Kick channel update failed (${response.status})`)
  }
}
