export const TIKTOK_NATIVE_REDIRECT_PORT = 8792
export const TIKTOK_NATIVE_REDIRECT_URI = `http://127.0.0.1:${TIKTOK_NATIVE_REDIRECT_PORT}/callback/`
export const TIKTOK_NATIVE_AUTH_TIMEOUT_MS = 5 * 60 * 1000

export type TikTokNativeAuthState =
  | 'unconfigured'
  | 'ready'
  | 'authorizing'
  | 'connected'
  | 'error'

export type TikTokNativeLiveAccess =
  | 'unknown'
  | 'pending'
  | 'approved'
  | 'rtmp-only'
  | 'denied'

export type TikTokNativeAuthPhase =
  | 'opening-browser'
  | 'awaiting-consent'
  | 'exchanging-code'
  | 'connected'

export interface TikTokNativeAuthProgress {
  phase: TikTokNativeAuthPhase
  message: string
  startedAt: number
  expiresAt: number
}

export interface TikTokNativeAccount {
  openId: string
  displayName: string
  avatarUrl?: string
}

export interface TikTokNativeAuthStatus {
  state: TikTokNativeAuthState
  configured: boolean
  redirectUri: string
  liveAccess: TikTokNativeLiveAccess
  account?: TikTokNativeAccount
  message?: string
}

export interface TikTokNativeLiveDestination {
  rtmpUrl: string
  streamKey: string
  liveId?: string
  watchUrl?: string
  title?: string
}
