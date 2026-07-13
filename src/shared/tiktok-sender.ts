export interface TikTokSenderStatus {
  isWindowOpen: boolean
  isLoggedIn: boolean
  isChatReady: boolean
  isOnTikTok: boolean
  currentUrl?: string
  lastMessageSentAt?: number
  nextSendAvailableAt?: number
  lastError?: string
  statusMessage: string
  maxMessageLength: number
  sendCooldownMs: number
}
