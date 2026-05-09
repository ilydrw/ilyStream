import { TTSAudiencePermission, TTSUserVoiceOverridePlatform } from '../../../shared/app-settings'

export const previewFallbackText = 'Testing voice quality.'

export type VoiceRoutingKey =
  | 'ttsChatVoiceProfileId'
  | 'ttsSubscriptionVoiceProfileId'

export const voiceRoutingFields: Array<{ key: VoiceRoutingKey; label: string; hint: string }> = [
  { key: 'ttsChatVoiceProfileId', label: 'Chat', hint: 'Normal chat messages' },
  {
    key: 'ttsSubscriptionVoiceProfileId',
    label: 'Subs',
    hint: 'Subscription callouts'
  }
]

export const userVoicePlatformOptions: Array<{ value: TTSUserVoiceOverridePlatform; label: string }> = [
  { value: 'tiktok', label: 'TikTok' },
  { value: 'twitch', label: 'Twitch' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'kick', label: 'Kick' },
  { value: 'all', label: 'All' }
]

export const commandPrefixOptions = [
  { value: '.', label: 'Dot' },
  { value: '/', label: 'Slash' },
  { value: '!', label: 'Bang' }
]

export const audiencePermissionOptions: Array<{
  value: TTSAudiencePermission
  label: string
  hint: string
}> = [
  { value: 'everyone', label: 'All users', hint: 'Any chat message can trigger TTS.' },
  { value: 'followers', label: 'Followers', hint: 'TikTok follow role or follower badges.' },
  { value: 'fanClub', label: 'Fan club', hint: 'Fan club, member, sponsor, or super-fan badges.' },
  { value: 'subscribers', label: 'Subscribers', hint: 'Subs, members, sponsors, and similar roles.' },
  { value: 'moderators', label: 'Moderators', hint: 'Mod badges and platform moderator flags.' },
  { value: 'teamMembers', label: 'Team members', hint: 'Staff, owner, or team-member style badges.' },
  { value: 'vips', label: 'VIPs / owner', hint: 'VIP, owner, broadcaster, or channel-owner roles.' }
]
