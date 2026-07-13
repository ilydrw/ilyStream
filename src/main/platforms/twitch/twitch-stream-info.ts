import type { TwitchConfig } from '../types'
import type { TwitchCategory } from '../../../shared/stream-info'

/**
 * Standalone Helix helpers for stream title/category, mirroring the
 * youtube-live.ts pattern: build a short-lived client from the saved config so
 * this works whether or not the chat connector is currently connected. The
 * saved access token stays fresh while the connector runs (refreshed tokens
 * are persisted through PlatformManager.persistRefreshedPlatformToken).
 */

const UPDATE_SCOPE = 'channel:manage:broadcast'

interface TwitchTokenIdentity {
  userId: string
  login: string
  scopes: string[]
}

function requireCredentials(config: TwitchConfig | null | undefined): { clientId: string; accessToken: string } {
  const clientId = config?.clientId?.trim()
  const accessToken = config?.accessToken?.trim()
  if (!clientId || !accessToken) {
    throw new Error('Twitch is not connected. Open the Twitch page and add your credentials first.')
  }
  return { clientId, accessToken }
}

async function validateToken(accessToken: string): Promise<TwitchTokenIdentity> {
  const res = await fetch('https://id.twitch.tv/oauth2/validate', {
    headers: { Authorization: `OAuth ${accessToken}` }
  })
  const data: any = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error('Twitch access token is expired or invalid. Reconnect Twitch and try again.')
  }
  return {
    userId: String(data.user_id || ''),
    login: String(data.login || ''),
    scopes: Array.isArray(data.scopes) ? data.scopes.map(String) : []
  }
}

async function createApiClient(config: TwitchConfig | null | undefined) {
  const { clientId, accessToken } = requireCredentials(config)
  const identity = await validateToken(accessToken)
  const { StaticAuthProvider } = await import('@twurple/auth')
  const { ApiClient } = await import('@twurple/api')
  const authProvider = new StaticAuthProvider(clientId, accessToken, identity.scopes)
  return { apiClient: new ApiClient({ authProvider }), identity }
}

export async function searchTwitchCategories(
  config: TwitchConfig | null | undefined,
  query: string
): Promise<TwitchCategory[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const { apiClient } = await createApiClient(config)
  const result = await apiClient.search.searchCategories(trimmed, { limit: 15 })
  return result.data.map((game: any) => ({
    id: String(game.id),
    name: String(game.name),
    boxArtUrl: String(game.boxArtUrl || '')
  }))
}

export async function updateTwitchStreamInfo(
  config: TwitchConfig | null | undefined,
  input: { title?: string; categoryId?: string }
): Promise<{ channel: string }> {
  const title = input.title?.trim()
  const gameId = input.categoryId?.trim()
  if (!title && !gameId) {
    throw new Error('Nothing to update — set a title or category first.')
  }

  const { apiClient, identity } = await createApiClient(config)
  if (!identity.scopes.includes(UPDATE_SCOPE)) {
    throw new Error(
      `Twitch token is missing the ${UPDATE_SCOPE} scope. Re-authorize Twitch with that scope to set the title and category.`
    )
  }

  await apiClient.channels.updateChannelInfo(identity.userId, {
    ...(title ? { title } : {}),
    ...(gameId ? { gameId } : {})
  })
  return { channel: identity.login }
}
