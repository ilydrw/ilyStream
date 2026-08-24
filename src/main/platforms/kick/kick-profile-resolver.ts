import { createKickAppAccessToken } from './kick-api'
import { refreshKickUserTokens, type KickUserTokens } from './kick-user-auth'
import type { KickConfig } from '../types'

const USERS_URL = 'https://api.kick.com/public/v1/users'
const DEFAULT_BATCH_DELAY_MS = 25
const DEFAULT_REQUEST_TIMEOUT_MS = 1_500
const MAX_BATCH_SIZE = 50
const PROFILE_TTL_MS = 6 * 60 * 60_000
const MISSING_PROFILE_TTL_MS = 5 * 60_000
const APP_TOKEN_TTL_MS = 50 * 60_000
const MAX_FAILURE_BACKOFF_MS = 5 * 60_000

type FetchLike = typeof fetch

export interface KickProfile {
  id: string
  username?: string
  displayName?: string
  profilePictureUrl?: string
}

export interface KickProfileHealth {
  state: 'idle' | 'healthy' | 'degraded'
  lastSuccessAt?: number
  lastFailureAt?: number
  retryAt?: number
  error?: string
}

export interface KickProfileResolverLike {
  resolve(userId: string): Promise<KickProfile | null>
  getHealth(): KickProfileHealth
}

interface KickProfileResolverOptions {
  getConfig: () => KickConfig | null
  fetchImpl?: FetchLike
  createAppToken?: typeof createKickAppAccessToken
  refreshUserTokens?: typeof refreshKickUserTokens
  onTokensRefreshed?: (tokens: KickUserTokens) => void
  onHealthChange?: (health: KickProfileHealth) => void
  now?: () => number
  batchDelayMs?: number
  requestTimeoutMs?: number
}

interface PendingLookup {
  resolve: (profile: KickProfile | null) => void
}

interface CachedProfile {
  profile: KickProfile | null
  expiresAt: number
}

/**
 * Batches and caches official Kick user lookups so chat stays responsive while
 * first-seen users gain the profile metadata omitted by Kick's Pusher frames.
 * Profile failures are deliberately isolated from the real-time connection.
 */
export class KickProfileResolver implements KickProfileResolverLike {
  private readonly fetchImpl: FetchLike
  private readonly createAppToken: typeof createKickAppAccessToken
  private readonly refreshUserTokens: typeof refreshKickUserTokens
  private readonly now: () => number
  private readonly batchDelayMs: number
  private readonly requestTimeoutMs: number
  private readonly pending = new Map<string, PendingLookup[]>()
  private readonly cache = new Map<string, CachedProfile>()
  private batchTimer: ReturnType<typeof setTimeout> | null = null
  private flushing = false
  private appToken: { value: string; expiresAt: number } | null = null
  private tokenRequest: Promise<string> | null = null
  private failureCount = 0
  private blockedUntil = 0
  private health: KickProfileHealth = { state: 'idle' }

  constructor(private readonly options: KickProfileResolverOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.createAppToken = options.createAppToken ?? createKickAppAccessToken
    this.refreshUserTokens = options.refreshUserTokens ?? refreshKickUserTokens
    this.now = options.now ?? Date.now
    this.batchDelayMs = options.batchDelayMs ?? DEFAULT_BATCH_DELAY_MS
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  }

  resolve(userId: string): Promise<KickProfile | null> {
    const id = normalizeKickUserId(userId)
    if (!id) return Promise.resolve(null)

    const now = this.now()
    const cached = this.cache.get(id)
    if (cached && cached.expiresAt > now) return Promise.resolve(cached.profile)
    if (cached?.profile && this.blockedUntil > now) return Promise.resolve(cached.profile)
    if (cached) this.cache.delete(id)
    if (this.blockedUntil > now) return Promise.resolve(null)

    return new Promise((resolve) => {
      const waiters = this.pending.get(id) ?? []
      waiters.push({ resolve })
      this.pending.set(id, waiters)
      this.scheduleBatch()
    })
  }

  getHealth(): KickProfileHealth {
    return { ...this.health }
  }

  private scheduleBatch(): void {
    if (this.batchTimer || this.flushing) return
    this.batchTimer = setTimeout(() => {
      this.batchTimer = null
      void this.flushBatch()
    }, this.batchDelayMs)
  }

  private async flushBatch(): Promise<void> {
    const ids = Array.from(this.pending.keys()).slice(0, MAX_BATCH_SIZE)
    if (ids.length === 0) return
    this.flushing = true

    const waiters = new Map<string, PendingLookup[]>()
    for (const id of ids) {
      waiters.set(id, this.pending.get(id) ?? [])
      this.pending.delete(id)
    }
    let profiles = new Map<string, KickProfile>()
    let succeeded = false
    try {
      profiles = await this.fetchProfiles(ids)
      succeeded = true
      this.markHealthy()
    } catch (error) {
      this.markFailure(error)
    }

    const now = this.now()
    for (const id of ids) {
      const profile = profiles.get(id) ?? null
      if (succeeded) {
        this.cache.set(id, {
          profile,
          expiresAt: now + (profile ? PROFILE_TTL_MS : MISSING_PROFILE_TTL_MS)
        })
      }
      for (const waiter of waiters.get(id) ?? []) waiter.resolve(profile)
    }
    this.flushing = false
    if (this.pending.size > 0) this.scheduleBatch()
  }

  private async fetchProfiles(ids: string[]): Promise<Map<string, KickProfile>> {
    let token = await this.getAccessToken(false)
    let response = await this.fetchUsers(ids, token)

    if (response.status === 401 || response.status === 403) {
      this.appToken = null
      token = await this.getAccessToken(true)
      response = await this.fetchUsers(ids, token)
    }

    if (!response.ok) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'), this.now())
      if (retryAfterMs > 0) this.blockedUntil = Math.max(this.blockedUntil, this.now() + retryAfterMs)
      throw new Error(`Kick profile lookup failed (${response.status})`)
    }

    const payload = await response.json().catch(() => ({})) as { data?: unknown[] }
    const profiles = new Map<string, KickProfile>()
    for (const item of Array.isArray(payload.data) ? payload.data : []) {
      if (!item || typeof item !== 'object') continue
      const record = item as Record<string, unknown>
      const id = normalizeKickUserId(record.user_id ?? record.id)
      if (!id) continue

      const username = firstString(record.username, record.channel_slug)
      const displayName = firstString(record.name, record.display_name, username)
      const profilePictureUrl = normalizeHttpUrl(
        firstString(record.profile_picture, record.profile_picture_url, record.profilePictureUrl)
      )
      profiles.set(id, {
        id,
        username: username || undefined,
        displayName: displayName || undefined,
        profilePictureUrl: profilePictureUrl || undefined
      })
    }
    return profiles
  }

  private async fetchUsers(ids: string[], token: string): Promise<Response> {
    const url = new URL(USERS_URL)
    for (const id of ids) url.searchParams.append('id', id)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs)
    try {
      return await this.fetchImpl(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        },
        signal: controller.signal
      })
    } finally {
      clearTimeout(timeout)
    }
  }

  private getAccessToken(forceRefresh: boolean): Promise<string> {
    if (!forceRefresh && this.tokenRequest) return this.tokenRequest

    const request = this.loadAccessToken(forceRefresh)
    if (!forceRefresh) {
      const tracked = request.finally(() => {
        if (this.tokenRequest === tracked) this.tokenRequest = null
      })
      this.tokenRequest = tracked
      return this.tokenRequest
    }
    return request
  }

  private async loadAccessToken(forceRefresh: boolean): Promise<string> {
    const config = this.options.getConfig()
    if (!config) throw new Error('Kick profile lookup has no active configuration')

    const now = this.now()
    const userAccessToken = String(config.userAccessToken || '').trim()
    const userRefreshToken = String(config.userRefreshToken || '').trim()
    const clientId = String(config.clientId || '').trim()
    const clientSecret = String(config.clientSecret || '').trim()
    const scopes = String(config.userScopes || '').split(/[\s,]+/).filter(Boolean)
    const userTokenCanRead = scopes.length === 0 || scopes.includes('user:read')
    const userTokenValid = userAccessToken && (
      !config.userTokenExpiresAt || Number(config.userTokenExpiresAt) - now > 60_000
    )

    if (!forceRefresh && userTokenCanRead && userTokenValid) return userAccessToken

    if (userTokenCanRead && userRefreshToken && clientId && clientSecret) {
      try {
        const refreshed = await this.refreshUserTokens(clientId, clientSecret, userRefreshToken)
        const merged: KickUserTokens = {
          ...refreshed,
          refreshToken: refreshed.refreshToken || userRefreshToken,
          scopes: refreshed.scopes || String(config.userScopes || '')
        }
        config.userAccessToken = merged.accessToken
        config.userRefreshToken = merged.refreshToken
        config.userTokenExpiresAt = merged.expiresAt
        config.userScopes = merged.scopes
        this.options.onTokensRefreshed?.(merged)
        return merged.accessToken
      } catch {
        // App access is a valid fallback for public user metadata.
      }
    }

    if (!clientId || !clientSecret) {
      throw new Error('Kick profile lookup requires a connected account or app credentials')
    }
    if (!forceRefresh && this.appToken && this.appToken.expiresAt > now) {
      return this.appToken.value
    }

    const value = await this.createAppToken({ clientId, clientSecret }, this.fetchImpl)
    this.appToken = { value, expiresAt: now + APP_TOKEN_TTL_MS }
    return value
  }

  private markHealthy(): void {
    const recovered = this.health.state === 'degraded'
    this.failureCount = 0
    this.blockedUntil = 0
    this.health = { state: 'healthy', lastSuccessAt: this.now() }
    this.options.onHealthChange?.({ ...this.health })
    if (recovered) console.log('[kick] Profile enrichment recovered')
  }

  private markFailure(error: unknown): void {
    this.failureCount++
    const delay = Math.min(5_000 * Math.pow(2, Math.min(this.failureCount - 1, 6)), MAX_FAILURE_BACKOFF_MS)
    this.blockedUntil = Math.max(this.blockedUntil, this.now() + delay)
    const message = formatError(error)
    const firstFailure = this.health.state !== 'degraded'
    this.health = {
      state: 'degraded',
      lastFailureAt: this.now(),
      retryAt: this.blockedUntil,
      error: message
    }
    this.options.onHealthChange?.({ ...this.health })
    if (firstFailure) {
      console.warn(`[kick] Profile enrichment unavailable; real-time events remain connected: ${message}`)
    }
  }
}

function normalizeKickUserId(value: unknown): string | null {
  const raw = String(value ?? '').trim()
  if (!/^\d+$/.test(raw)) return null
  const id = Number(raw)
  return Number.isSafeInteger(id) && id > 0 ? String(id) : null
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function normalizeHttpUrl(value: string): string {
  if (!value) return ''
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : ''
  } catch {
    return ''
  }
}

function parseRetryAfterMs(value: string | null, now: number): number {
  if (!value) return 0
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const at = Date.parse(value)
  return Number.isFinite(at) ? Math.max(0, at - now) : 0
}

function formatError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return typeof error === 'string' && error.trim() ? error.trim() : 'Unknown Kick profile error'
}
