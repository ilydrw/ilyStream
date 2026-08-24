export interface TikTokSenderStatus {
  isWindowOpen: boolean
  isLoggedIn: boolean
  isChatReady: boolean
  /** The isolated TikTok session contains both cookies required by the LIVE send API. */
  hasSendCredentials: boolean
  isOnTikTok: boolean
  currentUrl?: string
  lastMessageSentAt?: number
  nextSendAvailableAt?: number
  lastError?: string
  statusMessage: string
  maxMessageLength: number
  sendCooldownMs: number
}
