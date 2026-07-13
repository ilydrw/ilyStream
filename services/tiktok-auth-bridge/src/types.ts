export type TikTokLiveAccess = 'unknown' | 'pending' | 'approved' | 'rtmp-only' | 'denied'

export interface TikTokAccount {
  openId: string
  displayName: string
  avatarUrl?: string
}

export interface TikTokTokenBundle {
  accessToken: string
  refreshToken: string
  openId: string
  scope: string
  accessExpiresAt: number
  refreshExpiresAt: number
}

export interface StoredTikTokSession {
  account: TikTokAccount
  tokens: TikTokTokenBundle
  createdAt: number
  expiresAt: number
}

export interface TikTokSessionStore {
  get(tokenHash: string): Promise<StoredTikTokSession | undefined>
  set(tokenHash: string, session: StoredTikTokSession): Promise<void>
  delete(tokenHash: string): Promise<void>
}

export interface TikTokOAuthClient {
  exchangeAuthorizationCode(input: {
    code: string
    codeVerifier: string
    redirectUri: string
  }): Promise<TikTokTokenBundle>
  refreshAccessToken(refreshToken: string): Promise<TikTokTokenBundle>
  revokeAccessToken(accessToken: string): Promise<void>
  getBasicUser(accessToken: string): Promise<TikTokAccount>
}

export interface TikTokLiveDestination {
  rtmpUrl: string
  streamKey: string
  liveId?: string
  watchUrl?: string
  title?: string
}

export interface TikTokLiveProvider {
  getAccess(account: TikTokAccount): Promise<{ access: TikTokLiveAccess; message?: string }>
  prepare(
    session: StoredTikTokSession,
    input: { title?: string; orientation?: 'portrait' | 'landscape' }
  ): Promise<TikTokLiveDestination>
  complete(session: StoredTikTokSession): Promise<void>
}

export class BridgeHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'BridgeHttpError'
  }
}
