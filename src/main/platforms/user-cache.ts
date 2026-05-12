import type { UserInfo, Platform } from './types'

export interface CachedUser extends UserInfo {
  expiresAt: number
}

export class UserCache {
  private cache = new Map<string, CachedUser>()
  private ttlMs: number

  constructor(ttlMs: number = 60 * 60 * 1000) {
    this.ttlMs = ttlMs
  }

  get(platform: Platform, id?: string, username?: string): CachedUser | null {
    const lookupKey = this.getLookupKey(platform, id, username)
    if (!lookupKey) return null

    const cached = this.cache.get(lookupKey)
    if (cached && cached.expiresAt > Date.now()) return cached
    
    if (cached) this.cache.delete(lookupKey)
    return null
  }

  set(platform: Platform, user: UserInfo): void {
    const cachedUser: CachedUser = {
      ...user,
      expiresAt: Date.now() + this.ttlMs
    }

    if (user.id) {
      this.cache.set(`id:${platform}:${user.id}`, cachedUser)
    }
    if (user.username) {
      this.cache.set(`name:${platform}:${user.username.toLowerCase()}`, cachedUser)
    }
  }

  private getLookupKey(platform: Platform, id?: string, username?: string): string | null {
    if (id) return `id:${platform}:${id}`
    if (username) return `name:${platform}:${username.toLowerCase()}`
    return null
  }

  clear(): void {
    this.cache.clear()
  }
}
