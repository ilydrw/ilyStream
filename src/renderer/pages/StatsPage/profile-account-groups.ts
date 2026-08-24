import { isStreamPlatform } from '../../../main/platforms/types'
import type { UserIdentity, UserStat, ViewerAccount } from '../../../shared/stats'

export type ProfileConnection = ViewerAccount | UserStat

/**
 * Keeps engagement-bearing streaming accounts separate from identities that are
 * only connected to the ilyStream profile. The fallback for non-stream entries
 * in `accounts` makes older/cached payloads safe to render too.
 */
export function groupProfileAccounts(
  identity: Pick<UserIdentity, 'accounts' | 'profileConnections'>
): { streamingAccounts: UserStat[]; profileConnections: ProfileConnection[] } {
  const streamingAccounts = identity.accounts.filter((account) => isStreamPlatform(account.platform))
  const profileConnections: ProfileConnection[] = []
  const seen = new Set<string>()

  for (const account of [
    ...(identity.profileConnections || []),
    ...identity.accounts.filter((candidate) => !isStreamPlatform(candidate.platform))
  ]) {
    const key = `${account.platform}:${account.platformUserId || account.username}`
    if (seen.has(key)) continue
    seen.add(key)
    profileConnections.push(account)
  }

  return { streamingAccounts, profileConnections }
}
