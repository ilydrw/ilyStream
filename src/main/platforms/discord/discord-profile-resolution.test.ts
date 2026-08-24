import { describe, expect, it } from 'vitest'
import type { DiscordCallState } from '../../../shared/discord-call'
import { resolveDiscordCallProfiles } from './discord-profile-resolution'

describe('resolveDiscordCallProfiles', () => {
  it('uses the linked profile picture while preserving the Discord account name', () => {
    const state: DiscordCallState = {
      connectionPhase: 'connected',
      connectionMessage: null,
      channelId: 'voice-1',
      channelName: 'Stream Room',
      guildId: 'guild-1',
      isConnected: true,
      updatedAt: new Date(0).toISOString(),
      participants: [{
        id: 'discord-123',
        username: 'discord_name',
        avatarUrl: 'https://cdn.discordapp.com/discord.webp',
        isSpeaking: true,
        isMuted: false,
        isDeafened: false,
        isCurrentUser: false
      }]
    }
    const db = {
      getViewerProfileId: () => 'profile-1',
      getViewerProfile: () => ({
        id: 'profile-1',
        displayName: 'Leaderboard Name',
        profilePictureUrl: 'https://profiles.example/leaderboard.webp',
        notes: '',
        primaryPlatform: 'tiktok',
        primaryUsername: 'liked_name',
        createdAt: '',
        updatedAt: '',
        accounts: [{
          profileId: 'profile-1',
          platform: 'discord',
          username: 'old_discord_name',
          platformUserId: 'discord-123',
          displayName: 'Discord Name',
          profilePictureUrl: null,
          firstSeenAt: '',
          lastSeenAt: ''
        }]
      })
    }

    const resolved = resolveDiscordCallProfiles(state, db as any)

    expect(resolved.participants[0]).toMatchObject({
      username: 'discord_name',
      avatarUrl: 'https://profiles.example/leaderboard.webp',
      linkedProfileId: 'profile-1',
      linkedProfileName: 'Leaderboard Name',
      linkedAccountUsername: 'old_discord_name'
    })
  })
})
