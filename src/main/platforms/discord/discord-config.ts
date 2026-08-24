import type { DiscordConfig } from '../types'

/**
 * Discord RPC access tokens are bound to the application that issued them.
 * Keep the saved token for ordinary reconnects, but never carry it across an
 * application/client ID change.
 */
export function prepareDiscordConfigForSave(
  existing: DiscordConfig | null,
  incoming: DiscordConfig
): DiscordConfig {
  if (!existing) return incoming

  const existingClientId = existing.clientId?.trim() || ''
  const incomingClientId = incoming.clientId?.trim() || ''
  if (existingClientId === incomingClientId) {
    if (incoming.accessToken?.trim() || !existing.accessToken?.trim()) return incoming
    return { ...incoming, accessToken: existing.accessToken }
  }

  const next = { ...incoming }
  delete next.accessToken
  return next
}
