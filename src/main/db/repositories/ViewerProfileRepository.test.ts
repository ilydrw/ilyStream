import { describe, expect, it } from 'vitest'
import { ViewerProfileRepository } from './ViewerProfileRepository'
import type { UserStatRow } from '../database'

interface ProfileRow {
  id: string
  display_name: string
  profile_picture_url: string | null
  notes: string | null
  primary_platform: string | null
  primary_username: string | null
  created_at: string
  updated_at: string
}

interface AccountRow {
  profile_id: string
  platform: string
  username: string
  platform_user_id: string | null
  display_name: string
  profile_picture_url: string | null
  first_seen_at: string
  last_seen_at: string
}

function makeStat(overrides: Partial<UserStatRow> & { platform: string; username: string }): UserStatRow {
  return {
    platform_user_id: null,
    display_name: overrides.username,
    profile_picture_url: null,
    total_likes: 0,
    total_gifts: 0,
    total_gift_value_cents: 0,
    total_subscriptions: 0,
    total_follows: 0,
    total_shares: 0,
    total_raids: 0,
    total_chats: 0,
    total_song_requests: 0,
    total_cohost_calls: 0,
    is_fan_club_member: 0,
    is_super_fan: 0,
    is_moderator: 0,
    moderator_badge_image_url: null,
    tiktok_fan_club_badge_image_url: null,
    tiktok_super_fan_badge_image_url: null,
    twitch_sub_badge_image_url: null,
    youtube_super_fan_badge_image_url: null,
    profile_id: null,
    first_seen_at: '2026-07-01T00:00:00.000Z',
    last_seen_at: '2026-07-01T00:00:00.000Z',
    ...overrides
  }
}

function makeFakeDb() {
  const profiles = new Map<string, ProfileRow>()
  const accounts = new Map<string, AccountRow>()
  const stats = new Map<string, UserStatRow>()
  const settings = new Map<string, string>()
  let clock = 0

  const rowKey = (platform: string, username: string) => `${platform}:${username.toLowerCase()}`
  const now = () => `2026-07-01T00:00:${String(clock++).padStart(2, '0')}.000Z`
  const accountRows = () => [...accounts.values()]
  const statRows = () => [...stats.values()]

  const getUserStat = (platform: string, username: string) => stats.get(rowKey(platform, username)) ?? null
  const seedStat = (row: UserStatRow) => stats.set(rowKey(row.platform, row.username), row)

  const db = {
    prepare(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()

      return {
        get(...args: any[]) {
          if (normalized === 'select * from viewer_profiles where id = ?') {
            return profiles.get(args[0])
          }

          if (normalized === 'select primary_platform, primary_username from viewer_profiles where id = ?') {
            const row = profiles.get(args[0])
            return row && { primary_platform: row.primary_platform, primary_username: row.primary_username }
          }

          if (normalized === 'select value_json from settings where key = ?') {
            const stored = settings.get(args[0])
            return stored === undefined ? undefined : { value_json: stored }
          }

          if (normalized.includes('select profile_id from viewer_accounts where platform = ? and platform_user_id = ?')) {
            const [platform, platformUserId] = args
            return accountRows().find((row) => row.platform === platform && row.platform_user_id === platformUserId)
          }

          if (normalized.includes('select profile_id from user_stats where platform = ? and platform_user_id = ?')) {
            const [platform, platformUserId] = args
            return statRows().find((row) => row.platform === platform && row.platform_user_id === platformUserId && row.profile_id)
          }

          if (normalized.includes('select profile_id from viewer_accounts where platform = ? and username = ?')) {
            const [platform, username] = args
            return accountRows().find((row) => row.platform === platform && row.username === username)
          }

          if (normalized.includes('select profile_id from user_stats where platform = ? and lower(username) = ?')) {
            const [platform, username] = args
            return statRows().find((row) => (
              row.platform === platform &&
              row.profile_id &&
              row.username.toLowerCase() === username
            ))
          }

          if (normalized.includes('select profile_id from viewer_accounts where platform_user_id = ?')) {
            const [platformUserId] = args
            return accountRows().find((row) => row.platform_user_id === platformUserId)
          }

          if (normalized.includes('select profile_id from user_stats where platform_user_id = ?')) {
            const [platformUserId] = args
            return statRows().find((row) => row.platform_user_id === platformUserId && row.profile_id)
          }

          if (normalized.includes('select profile_id from viewer_accounts where username = ?')) {
            const [username] = args
            return accountRows().find((row) => row.username === username)
          }

          if (normalized.includes('select profile_id from user_stats where lower(username) = ?')) {
            const [username] = args
            return statRows().find((row) => (
              row.profile_id &&
              row.username.toLowerCase() === username
            ))
          }

          throw new Error(`Unhandled fake get SQL: ${normalized}`)
        },

        all(...args: any[]) {
          if (normalized.includes('select * from viewer_accounts where profile_id = ?')) {
            const [profileId] = args
            return accountRows()
              .filter((row) => row.profile_id === profileId)
              .sort((a, b) => (
                b.last_seen_at.localeCompare(a.last_seen_at) ||
                a.platform.localeCompare(b.platform) ||
                a.username.localeCompare(b.username)
              ))
          }

          if (normalized.includes('select id from viewer_profiles')) {
            return [...profiles.values()]
              .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.display_name.localeCompare(b.display_name))
              .slice(0, args[args.length - 1])
              .map((row) => ({ id: row.id }))
          }

          if (normalized.includes('select platform, username, display_name, profile_picture_url, profile_id from user_stats')) {
            const [profileId] = args
            return statRows()
              .filter((row) => !row.profile_id || row.profile_id !== profileId)
              .map((row) => ({
                platform: row.platform,
                username: row.username,
                display_name: row.display_name,
                profile_picture_url: row.profile_picture_url,
                profile_id: row.profile_id
              }))
          }

          throw new Error(`Unhandled fake all SQL: ${normalized}`)
        },

        run(...args: any[]) {
          if (normalized.includes('insert or replace into settings')) {
            settings.set(args[0], args[1])
            return { changes: 1 }
          }

          if (normalized.includes('insert into viewer_profiles (id, display_name, profile_picture_url, notes, primary_platform')) {
            const [id, displayName, profilePictureUrl, notes, primaryPlatform, primaryUsername] = args
            profiles.set(id, {
              id,
              display_name: displayName,
              profile_picture_url: profilePictureUrl,
              notes,
              primary_platform: primaryPlatform,
              primary_username: primaryUsername,
              created_at: now(),
              updated_at: now()
            })
            return { changes: 1 }
          }

          if (normalized.includes('insert or ignore into viewer_profiles')) {
            const [id, displayName, primaryPlatform] = args
            if (!profiles.has(id)) {
              profiles.set(id, {
                id,
                display_name: displayName,
                profile_picture_url: null,
                notes: '',
                primary_platform: primaryPlatform,
                primary_username: null,
                created_at: now(),
                updated_at: now()
              })
            }
            return { changes: 1 }
          }

          if (normalized.includes('insert into viewer_accounts')) {
            const [profileId, platform, username, platformUserId, displayName, profilePictureUrl] = args
            const key = rowKey(platform, username)
            const existing = accounts.get(key)
            accounts.set(key, {
              profile_id: profileId,
              platform,
              username,
              platform_user_id: platformUserId ?? existing?.platform_user_id ?? null,
              display_name: displayName || existing?.display_name || username,
              profile_picture_url: profilePictureUrl ?? existing?.profile_picture_url ?? null,
              first_seen_at: existing?.first_seen_at ?? now(),
              last_seen_at: now()
            })
            return { changes: 1 }
          }

          if (normalized.includes('update user_stats set profile_id = ? where platform = ? and lower(username) = ?')) {
            const [profileId, platform, username] = args
            const row = stats.get(rowKey(platform, username))
            if (row) row.profile_id = profileId
            return { changes: row ? 1 : 0 }
          }

          if (normalized.includes('update user_stats set profile_id = ? where profile_id = ?')) {
            const [targetProfileId, sourceProfileId] = args
            let changes = 0
            for (const row of stats.values()) {
              if (row.profile_id === sourceProfileId) {
                row.profile_id = targetProfileId
                changes++
              }
            }
            return { changes }
          }

          if (normalized.includes('update viewer_profiles set primary_platform = null, primary_username = null')) {
            const [profileId] = args
            const row = profiles.get(profileId)
            if (row) {
              row.primary_platform = null
              row.primary_username = null
              row.updated_at = now()
            }
            return { changes: row ? 1 : 0 }
          }

          if (normalized.includes('update viewer_profiles set primary_platform = ?, primary_username = ?')) {
            const [primaryPlatform, primaryUsername, profileId] = args
            const row = profiles.get(profileId)
            if (row) {
              row.primary_platform = primaryPlatform
              row.primary_username = primaryUsername
              row.updated_at = now()
            }
            return { changes: row ? 1 : 0 }
          }

          if (normalized.includes('update viewer_profiles set updated_at = current_timestamp where id = ?')) {
            const [profileId] = args
            const row = profiles.get(profileId)
            if (row) row.updated_at = now()
            return { changes: row ? 1 : 0 }
          }

          if (normalized.includes('delete from viewer_accounts where profile_id = ?')) {
            const [profileId] = args
            for (const [key, row] of accounts) {
              if (row.profile_id === profileId) accounts.delete(key)
            }
            return { changes: 1 }
          }

          if (normalized.includes('delete from viewer_profiles where id = ?')) {
            return { changes: profiles.delete(args[0]) ? 1 : 0 }
          }

          if (normalized.includes('delete from viewer_accounts where platform = ? and username = ?')) {
            const [platform, username] = args
            return { changes: accounts.delete(rowKey(platform, username)) ? 1 : 0 }
          }

          throw new Error(`Unhandled fake run SQL: ${normalized}`)
        }
      }
    },

    transaction<TArgs extends any[]>(fn: (...args: TArgs) => void) {
      return (...args: TArgs) => fn(...args)
    }
  }

  return {
    db,
    profiles,
    accounts,
    stats,
    getUserStat,
    seedStat,
    setSetting: (key: string, value: unknown) => settings.set(key, JSON.stringify(value)),
    getSetting: (key: string) => {
      const stored = settings.get(key)
      return stored === undefined ? undefined : JSON.parse(stored)
    }
  }
}

describe('ViewerProfileRepository', () => {
  it('creates profiles with normalized accounts and syncs user_stats profile ids', () => {
    const fake = makeFakeDb()
    fake.seedStat(makeStat({
      platform: 'twitch',
      username: 'alice',
      platform_user_id: 'tw-1',
      display_name: 'Alice Live',
      profile_picture_url: 'https://example.test/alice.png'
    }))

    const repo = new ViewerProfileRepository(fake.db as any, fake.getUserStat)
    const profile = repo.createViewerProfile({
      displayName: '  Alice   Crew  ',
      notes: 'founder',
      primaryPlatform: 'twitch',
      accounts: [{ platform: 'twitch', username: '@Alice' }]
    })

    expect(profile.displayName).toBe('Alice Crew')
    expect(profile.primaryPlatform).toBe('twitch')
    expect(profile.accounts).toHaveLength(1)
    expect(profile.accounts[0]).toMatchObject({
      platform: 'twitch',
      username: 'alice',
      platformUserId: 'tw-1',
      profilePictureUrl: 'https://example.test/alice.png'
    })
    expect(fake.stats.get('twitch:alice')?.profile_id).toBe(profile.id)
  })

  it('keeps Discord as a non-streaming connection instead of making it primary', () => {
    const fake = makeFakeDb()
    fake.seedStat(makeStat({
      platform: 'twitch',
      username: 'alice',
      platform_user_id: 'tw-1',
      display_name: 'Alice Live'
    }))

    const repo = new ViewerProfileRepository(fake.db as any, fake.getUserStat)
    const profile = repo.createViewerProfile({
      displayName: 'Alice',
      primaryPlatform: 'twitch',
      primaryUsername: 'alice',
      accounts: [{ platform: 'twitch', username: 'alice' }]
    })

    const linked = repo.addAccountToProfile(profile.id, {
      platform: 'discord',
      username: 'alice_on_discord',
      platformUserId: 'discord-42',
      displayName: 'Alice'
    })

    expect(linked?.primaryPlatform).toBe('twitch')
    expect(linked?.primaryUsername).toBe('alice')
    expect(linked?.accounts).toEqual(expect.arrayContaining([
      expect.objectContaining({ platform: 'twitch', username: 'alice' }),
      expect.objectContaining({ platform: 'discord', username: 'alice_on_discord' })
    ]))
  })

  it('links accounts into one profile and resolves renamed accounts by platform user id', () => {
    const fake = makeFakeDb()
    fake.seedStat(makeStat({
      platform: 'twitch',
      username: 'snapandinu',
      platform_user_id: 'tw-103',
      display_name: 'Snap'
    }))
    fake.seedStat(makeStat({
      platform: 'youtube',
      username: 'snap_live',
      platform_user_id: 'yt-77',
      display_name: 'Snap Live'
    }))

    const repo = new ViewerProfileRepository(fake.db as any, fake.getUserStat)
    const profile = repo.linkAccounts('twitch', 'SnapAndInu', 'youtube', '@snap_live')

    expect(profile?.accounts.map((account) => `${account.platform}:${account.username}`).sort()).toEqual([
      'twitch:snapandinu',
      'youtube:snap_live'
    ])
    expect(fake.stats.get('twitch:snapandinu')?.profile_id).toBe(profile?.id)
    expect(fake.stats.get('youtube:snap_live')?.profile_id).toBe(profile?.id)
    expect(repo.getViewerProfileId('twitch', 'old_twitch_name', { platformUserId: 'tw-103' })).toBe(profile?.id)
  })

  it('does not merge different accounts that copy another account display name', () => {
    const fake = makeFakeDb()
    fake.seedStat(makeStat({
      platform: 'tiktok',
      username: 'restlesstinyspirit',
      platform_user_id: 'real-tiktok-id',
      display_name: 'Restlesstinyspirit'
    }))

    const repo = new ViewerProfileRepository(fake.db as any, fake.getUserStat)
    const restless = repo.createViewerProfile({
      displayName: 'Restlesstinyspirit',
      accounts: [{ platform: 'tiktok', username: 'restlesstinyspirit' }]
    })

    expect(repo.getViewerProfileId('tiktok', 'mateovbqle5', {
      platformUserId: 'different-tiktok-id',
      displayName: 'Restlesstinyspirit'
    })).toBeNull()
    expect(repo.getViewerProfileId('tiktok', 'restlesstinyspirit', {
      platformUserId: 'real-tiktok-id',
      displayName: 'Restlesstinyspirit'
    })).toBe(restless.id)
  })

  it('re-points viewer voice rules and join sounds onto the surviving profile when merging', () => {
    const fake = makeFakeDb()
    fake.seedStat(makeStat({ platform: 'tiktok', username: 'mainacct', display_name: 'Main' }))
    fake.seedStat(makeStat({ platform: 'tiktok', username: 'altacct', display_name: 'Alt' }))

    const repo = new ViewerProfileRepository(fake.db as any, fake.getUserStat)
    const main = repo.createViewerProfile({ displayName: 'Main', accounts: [{ platform: 'tiktok', username: 'mainacct' }] })
    const alt = repo.createViewerProfile({ displayName: 'Alt', accounts: [{ platform: 'tiktok', username: 'altacct' }] })

    fake.setSetting('ttsUserVoiceOverrides', [
      { id: 'rule-main', viewerProfileId: main.id, voiceProfileId: 'voice-main' },
      { id: 'rule-alt', viewerProfileId: alt.id, voiceProfileId: 'voice-alt' },
      { id: 'rule-username', viewerProfileId: '', username: 'someoneelse' }
    ])
    fake.setSetting('viewerJoinSounds', [
      { id: 'join-alt', viewerProfileId: alt.id, soundId: 'join/alt.mp3', volume: 0.5 }
    ])

    // Linking the alt into the main profile deletes the alt's profile row.
    repo.addAccountToProfile(main.id, { platform: 'tiktok', username: 'altacct' })

    expect(fake.profiles.has(alt.id)).toBe(false)
    expect(fake.getSetting('ttsUserVoiceOverrides')).toEqual([
      { id: 'rule-main', viewerProfileId: main.id, voiceProfileId: 'voice-main' },
      { id: 'rule-alt', viewerProfileId: main.id, voiceProfileId: 'voice-alt' },
      { id: 'rule-username', viewerProfileId: '', username: 'someoneelse' }
    ])
    expect(fake.getSetting('viewerJoinSounds')).toEqual([
      { id: 'join-alt', viewerProfileId: main.id, soundId: 'join/alt.mp3', volume: 0.5 }
    ])
  })

  it('prunes voice rules and join sounds left pointing at deleted profiles', () => {
    const fake = makeFakeDb()
    fake.seedStat(makeStat({ platform: 'tiktok', username: 'mainacct', display_name: 'Main' }))

    const repo = new ViewerProfileRepository(fake.db as any, fake.getUserStat)
    const main = repo.createViewerProfile({ displayName: 'Main', accounts: [{ platform: 'tiktok', username: 'mainacct' }] })

    fake.setSetting('ttsUserVoiceOverrides', [
      { id: 'rule-live', viewerProfileId: main.id },
      { id: 'rule-dead', viewerProfileId: 'a-profile-that-was-merged-away' },
      { id: 'rule-username', viewerProfileId: '', username: 'someoneelse' }
    ])
    fake.setSetting('viewerJoinSounds', [
      { id: 'join-dead', viewerProfileId: 'a-profile-that-was-merged-away', soundId: 'join/gone.mp3' }
    ])

    expect(repo.pruneOrphanedViewerScopedSettings()).toBe(2)
    expect(fake.getSetting('ttsUserVoiceOverrides')).toEqual([
      { id: 'rule-live', viewerProfileId: main.id },
      { id: 'rule-username', viewerProfileId: '', username: 'someoneelse' }
    ])
    expect(fake.getSetting('viewerJoinSounds')).toEqual([])
  })

  it('leaves viewer-scoped settings untouched when nothing is orphaned', () => {
    const fake = makeFakeDb()
    fake.seedStat(makeStat({ platform: 'tiktok', username: 'mainacct', display_name: 'Main' }))

    const repo = new ViewerProfileRepository(fake.db as any, fake.getUserStat)
    const main = repo.createViewerProfile({ displayName: 'Main', accounts: [{ platform: 'tiktok', username: 'mainacct' }] })
    fake.setSetting('viewerJoinSounds', [{ id: 'join-live', viewerProfileId: main.id, soundId: 'join/keep.mp3' }])

    expect(repo.pruneOrphanedViewerScopedSettings()).toBe(0)
    expect(fake.getSetting('viewerJoinSounds')).toEqual([
      { id: 'join-live', viewerProfileId: main.id, soundId: 'join/keep.mp3' }
    ])
  })

  it('keeps the surviving profile\'s join sound when both sides of a merge have one', () => {
    const fake = makeFakeDb()
    fake.seedStat(makeStat({ platform: 'tiktok', username: 'mainacct', display_name: 'Main' }))
    fake.seedStat(makeStat({ platform: 'tiktok', username: 'altacct', display_name: 'Alt' }))

    const repo = new ViewerProfileRepository(fake.db as any, fake.getUserStat)
    const main = repo.createViewerProfile({ displayName: 'Main', accounts: [{ platform: 'tiktok', username: 'mainacct' }] })
    const alt = repo.createViewerProfile({ displayName: 'Alt', accounts: [{ platform: 'tiktok', username: 'altacct' }] })

    fake.setSetting('viewerJoinSounds', [
      { id: 'join-main', viewerProfileId: main.id, soundId: 'join/main.mp3' },
      { id: 'join-alt', viewerProfileId: alt.id, soundId: 'join/alt.mp3' }
    ])

    repo.addAccountToProfile(main.id, { platform: 'tiktok', username: 'altacct' })

    expect(fake.getSetting('viewerJoinSounds')).toEqual([
      { id: 'join-main', viewerProfileId: main.id, soundId: 'join/main.mp3' }
    ])
  })
})
