import { describe, expect, it } from 'vitest'
import type { UserIdentity, UserStat, ViewerAccount } from '../../../shared/stats'
import { groupProfileAccounts } from './profile-account-groups'

function stat(platform: UserStat['platform'], username: string): UserStat {
  return { platform, username, platformUserId: null } as UserStat
}

function connection(platform: ViewerAccount['platform'], username: string): ViewerAccount {
  return { platform, username, platformUserId: `${platform}-id` } as ViewerAccount
}

describe('groupProfileAccounts', () => {
  it('keeps Discord out of streaming accounts and exposes it as a profile connection', () => {
    const grouped = groupProfileAccounts({
      accounts: [stat('twitch', 'alice')],
      profileConnections: [connection('discord', 'alice_on_discord')]
    })

    expect(grouped.streamingAccounts.map((account) => account.platform)).toEqual(['twitch'])
    expect(grouped.profileConnections).toEqual([
      expect.objectContaining({ platform: 'discord', username: 'alice_on_discord' })
    ])
  })

  it('moves a legacy Discord stat-shaped account into profile connections without duplicating it', () => {
    const legacyDiscord = stat('discord', 'alice_on_discord')
    const grouped = groupProfileAccounts({
      accounts: [stat('youtube', 'alice'), legacyDiscord],
      profileConnections: [
        { ...connection('discord', 'alice_on_discord'), platformUserId: null }
      ]
    } as Pick<UserIdentity, 'accounts' | 'profileConnections'>)

    expect(grouped.streamingAccounts.map((account) => account.platform)).toEqual(['youtube'])
    expect(grouped.profileConnections).toHaveLength(1)
    expect(grouped.profileConnections[0].platform).toBe('discord')
  })
})
