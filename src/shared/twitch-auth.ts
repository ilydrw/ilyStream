export type TwitchAuthPhase =
  | 'requesting-code'
  | 'opening-browser'
  | 'awaiting-consent'
  | 'connecting'
  | 'connected'
  | 'error'

export interface TwitchAuthProgress {
  phase: TwitchAuthPhase
  message: string
  startedAt: number
  expiresAt?: number
  userCode?: string
  verificationUri?: string
}

export interface TwitchAccount {
  userId: string
  login: string
}

export interface TwitchAuthStatus {
  configured: boolean
  connected: boolean
  account: TwitchAccount | null
  streamKeyAvailable: boolean
  message: string
}

export interface TwitchAuthResult extends TwitchAuthStatus {
  streamKeyError?: string
}
