export type DiscordCallConnectionPhase =
  | 'disconnected'
  | 'connecting'
  | 'authorizing'
  | 'connected'
  | 'error'

export interface DiscordCallParticipant {
  id: string
  username: string
  avatarUrl: string | null
  isSpeaking: boolean
  isMuted: boolean
  isDeafened: boolean
  isCurrentUser: boolean
  linkedProfileId?: string | null
  linkedProfileName?: string | null
  linkedAccountUsername?: string | null
}

export interface DiscordCallState {
  connectionPhase: DiscordCallConnectionPhase
  connectionMessage: string | null
  channelId: string | null
  channelName: string | null
  guildId: string | null
  isConnected: boolean
  participants: DiscordCallParticipant[]
  updatedAt: string
}

export function createEmptyDiscordCallState(
  connectionPhase: DiscordCallConnectionPhase = 'disconnected',
  connectionMessage: string | null = null
): DiscordCallState {
  return {
    connectionPhase,
    connectionMessage,
    channelId: null,
    channelName: null,
    guildId: null,
    isConnected: false,
    participants: [],
    updatedAt: new Date().toISOString()
  }
}
