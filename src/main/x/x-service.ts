import { EventEmitter } from 'events'
import log from 'electron-log'
import type { Database } from '../db/database'
import { DEFAULT_X_GO_LIVE_TEMPLATE, type XPostResult, type XStatus } from '../../shared/x-types'
import { initiateXAuth, refreshXTokens, DEFAULT_X_CLIENT_ID } from './x-auth'

const TWEETS_URL = 'https://api.twitter.com/2/tweets'
const ME_URL = 'https://api.twitter.com/2/users/me'
// X counts a tweet by weighted length; 280 is the classic ceiling and a safe
// client-side guard before we spend a POST that the API would reject anyway.
const MAX_TWEET_LENGTH = 280

/**
 * Posts go-live announcements to X (Twitter) on the user's behalf via OAuth2
 * user-context. Modeled on SpotifyService: holds tokens, persists them in DB
 * settings, and refreshes on 401. It does not ingest events — X is a posting
 * target, not a live-chat source.
 */
export class XService extends EventEmitter {
  private connected = false
  private handle: string | null = null
  private userId: string | null = null
  private accessToken: string | null = null
  private refreshToken: string | null = null
  private clientId: string | null = null
  private lastError: string | null = null

  constructor(private db: Database) {
    super()
    this.accessToken = this.readSetting('xAccessToken')
    this.refreshToken = this.readSetting('xRefreshToken')
    this.clientId = this.readSetting('xClientId')
    this.handle = this.readSetting('xHandle')
    this.userId = this.readSetting('xUserId')
  }

  getStatus(): XStatus {
    return {
      connected: this.connected,
      handle: this.handle,
      error: this.lastError
    }
  }

  getTemplate(): string {
    return this.readSetting('xGoLiveTemplate') ?? DEFAULT_X_GO_LIVE_TEMPLATE
  }

  setTemplate(text: string): void {
    this.db.setSetting('xGoLiveTemplate', text)
  }

  /**
   * Authorize X. Reuses stored tokens when present (verifying them, refreshing
   * once on 401); otherwise runs the interactive OAuth flow.
   */
  async connect(clientIdOverride?: string): Promise<XStatus> {
    const clientId = (clientIdOverride?.trim() || this.clientId?.trim() || DEFAULT_X_CLIENT_ID).trim()
    if (!clientId) {
      this.lastError = 'X OAuth client ID is required before connecting.'
      this.emit('status', this.getStatus())
      throw new Error(this.lastError)
    }

    // A new client ID invalidates any stored tokens for the old app.
    if (clientId !== this.clientId) {
      this.clientId = clientId
      this.db.setSetting('xClientId', clientId)
      this.clearTokens()
    }

    this.lastError = null

    try {
      if (this.accessToken) {
        await this.verifyIdentity()
      } else {
        await this.runInteractiveAuth(clientId)
      }
      this.connected = true
      this.emit('status', this.getStatus())
      return this.getStatus()
    } catch (error: any) {
      // Stored token rejected — refresh once, then fall back to fresh auth.
      if (isUnauthorized(error) && this.refreshToken) {
        try {
          await this.refreshAndPersist()
          await this.verifyIdentity()
          this.connected = true
          this.emit('status', this.getStatus())
          return this.getStatus()
        } catch (refreshErr: any) {
          log.warn('[x] Token refresh during connect failed:', refreshErr?.message || refreshErr)
        }
      }

      try {
        await this.runInteractiveAuth(clientId)
        this.connected = true
        this.emit('status', this.getStatus())
        return this.getStatus()
      } catch (authErr: any) {
        this.connected = false
        this.lastError = authErr?.message || 'X authentication failed'
        this.emit('status', this.getStatus())
        throw authErr
      }
    }
  }

  disconnect(): void {
    this.connected = false
    this.handle = null
    this.userId = null
    this.lastError = null
    this.clearTokens()
    this.db.setSetting('xHandle', null)
    this.db.setSetting('xUserId', null)
    this.emit('status', this.getStatus())
  }

  /** Post a tweet, refreshing the token once if the first attempt is rejected. */
  async postTweet(text: string): Promise<XPostResult> {
    const body = text.trim()
    if (!body) throw new Error('Cannot post an empty tweet.')
    if (body.length > MAX_TWEET_LENGTH) {
      throw new Error(`Tweet is ${body.length} characters — X allows at most ${MAX_TWEET_LENGTH}.`)
    }
    if (!this.accessToken) throw new Error('Connect X before posting.')

    try {
      return await this.sendTweet(body)
    } catch (error: any) {
      if (isUnauthorized(error) && this.refreshToken && this.clientId) {
        await this.refreshAndPersist()
        return this.sendTweet(body)
      }
      this.lastError = error?.message || 'Failed to post to X'
      this.emit('status', this.getStatus())
      throw error
    }
  }

  private async sendTweet(text: string): Promise<XPostResult> {
    const response = await fetch(TWEETS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
    })

    if (!response.ok) {
      const detail = await response.text()
      throw new XHttpError(response.status, formatXPostError(response.status, detail))
    }

    const data = (await response.json()) as { data?: { id?: string } }
    const id = data?.data?.id
    if (!id) throw new Error('X post succeeded but returned no tweet ID.')

    this.lastError = null
    const handle = this.handle ?? 'i'
    return { id, url: `https://x.com/${handle}/status/${id}` }
  }

  private async runInteractiveAuth(clientId: string): Promise<void> {
    const tokens = await initiateXAuth(clientId)
    this.accessToken = tokens.accessToken
    this.refreshToken = tokens.refreshToken
    this.persistTokens()
    await this.verifyIdentity()
  }

  private async refreshAndPersist(): Promise<void> {
    if (!this.clientId || !this.refreshToken) throw new Error('Missing X credentials to refresh.')
    const tokens = await refreshXTokens(this.clientId, this.refreshToken)
    this.accessToken = tokens.accessToken
    this.refreshToken = tokens.refreshToken
    this.persistTokens()
  }

  /** Confirm the access token works and cache the authorized @handle. */
  private async verifyIdentity(): Promise<void> {
    const response = await fetch(ME_URL, {
      headers: { Authorization: `Bearer ${this.accessToken}` }
    })

    if (!response.ok) {
      const detail = await response.text()
      throw new XHttpError(response.status, `X identity check failed (${response.status}): ${detail}`)
    }

    const data = (await response.json()) as { data?: { id?: string; username?: string } }
    this.userId = data?.data?.id ?? null
    this.handle = data?.data?.username ?? null
    this.db.setSetting('xUserId', this.userId)
    this.db.setSetting('xHandle', this.handle)
  }

  private persistTokens(): void {
    this.db.setSetting('xAccessToken', this.accessToken)
    this.db.setSetting('xRefreshToken', this.refreshToken)
  }

  private clearTokens(): void {
    this.accessToken = null
    this.refreshToken = null
    this.db.setSetting('xAccessToken', null)
    this.db.setSetting('xRefreshToken', null)
  }

  private readSetting(key: string): string | null {
    const value = this.db.getSetting(key)
    return typeof value === 'string' && value.trim().length > 0 ? value : null
  }
}

class XHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'XHttpError'
  }
}

function formatXPostError(status: number, detail: string): string {
  const parsed = parseXErrorDetail(detail)
  if (status === 402 && parsed?.title === 'CreditsDepleted') {
    return 'X API credits are depleted for this developer account. Your X account is linked, but X will not accept API posts until the project has credits again. Use the manual composer fallback or update billing/plan in the X Developer Portal.'
  }

  if (parsed?.detail) {
    return `X post failed (${status}): ${parsed.detail}`
  }

  return `X post failed (${status}): ${detail}`
}

function parseXErrorDetail(detail: string): { title?: string; detail?: string; type?: string } | null {
  try {
    const parsed = JSON.parse(detail)
    return typeof parsed === 'object' && parsed !== null ? parsed : null
  } catch {
    return null
  }
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof XHttpError && (error.status === 401 || error.status === 403)
}
