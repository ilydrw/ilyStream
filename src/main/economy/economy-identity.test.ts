import { describe, expect, it, vi } from 'vitest'
import { getLoyaltyLevelForXp } from '../../shared/loyalty'
import {
  economyScopeWhere,
  loadEconomyOwnerAggregates,
  resolveEconomyIdentity,
  sameEconomyOwner
} from './economy-identity'

describe('connected-profile economy identity', () => {
  it('uses the ilyStream Profile as owner while retaining the acting account', () => {
    const getViewerProfileId = vi.fn(() => 'profile-queena')
    const korina = resolveEconomyIdentity(
      { getViewerProfileId },
      'beautiful.monsta7',
      'tiktok',
      { platformUserId: 'tt-korina' }
    )
    const queena = resolveEconomyIdentity({ getViewerProfileId }, 'queena.chaos', 'tiktok')

    expect(korina).toMatchObject({
      username: 'beautiful.monsta7',
      platform: 'tiktok',
      profileId: 'profile-queena',
      ownerKey: 'profile:profile-queena'
    })
    expect(sameEconomyOwner(korina, queena)).toBe(true)
    expect(getViewerProfileId).toHaveBeenCalledWith(
      'tiktok',
      'beautiful.monsta7',
      { platformUserId: 'tt-korina' }
    )
  })

  it('builds a case-insensitive scope over every account connected to the profile', () => {
    const getRawDb = () => ({
      prepare: () => ({
        all: () => [
          { platform: 'kick', username: 'queena_chaos' },
          { platform: 'tiktok', username: 'beautiful.monsta7' },
          { platform: 'discord', username: 'korina korina' }
        ]
      })
    })
    const identity = resolveEconomyIdentity(
      { getViewerProfileId: () => 'profile-1', getRawDb },
      'Queena_Chaos',
      'kick'
    )
    const scope = economyScopeWhere(identity, 'economy_users')

    expect(scope.params).toEqual([
      'kick', 'queena_chaos',
      'tiktok', 'beautiful.monsta7'
    ])
    expect(scope.sql).toContain('economy_users.username COLLATE NOCASE = ?')
    expect(identity.members).toHaveLength(2)
  })

  it('combines the existing Korina and Queena rows into one profile total and derived level', () => {
    const profile = {
      resolved_profile_id: '0aaf8b84-67b2-4ca7-af24-14fc660fd90e',
      profile_display_name: 'Queena Chaos',
      primary_platform: 'tiktok',
      primary_username: 'queena.chaos',
      primary_is_member: 1,
      updated_at: '2026-08-14 05:00:00'
    }
    const rows = [
      { ...profile, username: 'beautiful.monsta7', platform: 'tiktok', points: 50_848, xp: 489_167 },
      { ...profile, username: 'queena.chaos', platform: 'tiktok', points: 56_086, xp: 1_281_044 },
      { ...profile, username: 'Queena_chaos', platform: 'kick', points: 0, xp: 87 },
      { ...profile, username: 'QueenaChaos', platform: 'twitch', points: 0, xp: 826 },
      { ...profile, username: 'UCA7ZQ', platform: 'youtube', points: 0, xp: 76 },
      // Connected non-stream identities never participate in the economy.
      { ...profile, username: 'korina korina', platform: 'discord', points: 500, xp: 500 }
    ]
    const raw = {
      prepare: vi.fn(() => ({ all: vi.fn(() => rows) }))
    } as any

    const owners = loadEconomyOwnerAggregates(raw)

    expect(owners).toHaveLength(1)
    expect(owners[0]).toMatchObject({
      username: 'queena.chaos',
      platform: 'tiktok',
      points: 106_934,
      xp: 1_771_200
    })
    expect(owners[0].members).toHaveLength(5)
    expect(getLoyaltyLevelForXp(owners[0].xp)).toBe(134)
  })

  it('keeps same-named unlinked accounts on different platforms separate', () => {
    const rows = [
      {
        username: 'viewer', platform: 'twitch', points: 10, xp: 20,
        updated_at: null, resolved_profile_id: null, profile_display_name: null,
        primary_platform: null, primary_username: null, primary_is_member: 0
      },
      {
        username: 'Viewer', platform: 'youtube', points: 30, xp: 40,
        updated_at: null, resolved_profile_id: null, profile_display_name: null,
        primary_platform: null, primary_username: null, primary_is_member: 0
      }
    ]
    const raw = { prepare: () => ({ all: () => rows }) } as any

    const owners = loadEconomyOwnerAggregates(raw)

    expect(owners.map((owner) => owner.ownerKey).sort()).toEqual([
      'account:twitch:viewer',
      'account:youtube:viewer'
    ])
  })
})
