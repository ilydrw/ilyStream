import type { DiscordCallState } from '../../../shared/discord-call'
import type { Database } from '../../db/database'

type DiscordProfileDatabase = Pick<Database, 'getViewerProfileId' | 'getViewerProfile'>

export function resolveDiscordCallProfiles(
  state: DiscordCallState,
  db: DiscordProfileDatabase
): DiscordCallState {
  return {
    ...state,
    participants: state.participants.map((participant) => {
      const profileId = db.getViewerProfileId('discord', participant.username, {
        platformUserId: participant.id
      })
      if (!profileId) return { ...participant, linkedProfileId: null, linkedProfileName: null, linkedAccountUsername: null }

      const profile = db.getViewerProfile(profileId)
      if (!profile) return { ...participant, linkedProfileId: null, linkedProfileName: null, linkedAccountUsername: null }
      const primaryAccount = profile.accounts.find((account) => (
        account.platform === profile.primaryPlatform && account.username === profile.primaryUsername
      ))
      const fallbackAccount = primaryAccount || profile.accounts.find((account) => Boolean(account.profilePictureUrl))
      const discordAccount = profile.accounts.find((account) => (
        account.platform === 'discord' && (
          account.platformUserId === participant.id ||
          account.username.toLowerCase() === participant.username.toLowerCase()
        )
      ))

      return {
        ...participant,
        avatarUrl: profile.profilePictureUrl || fallbackAccount?.profilePictureUrl || participant.avatarUrl,
        linkedProfileId: profile.id,
        linkedProfileName: profile.displayName,
        linkedAccountUsername: discordAccount?.username || participant.username
      }
    })
  }
}
