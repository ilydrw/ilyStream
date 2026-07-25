import { createHash } from 'crypto'
import { createRequire } from 'module'
import { join } from 'path'
import { mkdir, readFile, rename, stat, writeFile } from 'fs/promises'
import { avatarImageKey } from '../../shared/avatar-url'
import { assertSafePublicHttpUrl, MAX_AVATAR_BYTES } from './ssrf-guard'
import { detectAvatarContentType, resolveAvatarContentType } from './avatar-content-type'

/**
 * Shared avatar image cache for the `/avatar/<b64>` overlay route and the
 * `ily-avatar` protocol.
 *
 * TikTok avatar URLs are signed and expire (`x-expires`), and the same image is
 * re-signed/host-rotated on every event. `AvatarUrlStabilizer` keeps the URL
 * *string* stable so `<img src>` stops churning, but a stable string is not a
 * fetchable one:
 *
 *  - the pinned URL is only downloadable until its signature expires, so an
 *    overlay that first requests it later (OBS source refresh, viewer entering
 *    the visible top-N, app restart) gets a 403 and falls back to initials —
 *    permanently, because later events keep returning the pinned string;
 *  - a cache keyed on the full signed URL can never be found again once the
 *    same image arrives under a fresh signature.
 *
 * So: cache files are keyed on the stable image identity (`avatarImageKey`),
 * `warmAvatarCache` downloads at event-ingest time while the just-issued
 * signature is still valid, and the freshest signed URL seen per image is
 * remembered so an expired request can be retried with a live signature.
 */

const requireModule = createRequire(import.meta.url)

const MAX_TRACKED_IMAGES = 5000
const WARM_RETRY_COOLDOWN_MS = 60_000

/** imageKey → most recently seen (freshest-signed) URL for that image. */
const freshestUrlByImageKey = new Map<string, string>()
/** imageKeys with a warm download currently in flight. */
const warmInFlight = new Set<string>()
/** imageKeys confirmed on disk this session (skips repeat stats). */
const warmedImageKeys = new Set<string>()
/** imageKey → last warm attempt, so a failing CDN isn't hammered per event. */
const lastWarmAttemptAt = new Map<string, number>()

export class AvatarFetchError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'AvatarFetchError'
  }
}

export interface CachedAvatar {
  data: Buffer
  contentType: string
}

/**
 * Electron is resolved lazily so this module stays importable from plain-Node
 * test runs (where `require('electron')` yields the binary path string).
 */
function getElectron(): any | null {
  try {
    const electron = requireModule('electron')
    return electron && typeof electron === 'object' ? electron : null
  } catch {
    return null
  }
}

export function defaultAvatarCacheDir(): string | null {
  try {
    const app = getElectron()?.app
    if (typeof app?.getPath !== 'function') return null
    const userData = app.getPath('userData')
    return userData ? join(userData, 'avatar_cache') : null
  } catch {
    return null
  }
}

/** Prefer Chromium's network stack (`net.fetch`) — same as the renderer uses. */
function resolveFetchImpl(): (input: string, init?: RequestInit) => Promise<Response> {
  const net = getElectron()?.net
  if (typeof net?.fetch === 'function') {
    return (input, init) => net.fetch(input, init)
  }
  return (input, init) => fetch(input, init)
}

/** Cache file name keyed on the stable image identity, not the signed URL. */
export function avatarCacheFileName(url: string): string {
  return createHash('sha256').update(avatarImageKey(url)).digest('hex')
}

/** Cache file name used by older builds (full signed URL). */
export function legacyAvatarCacheFileName(url: string): string {
  return createHash('sha256').update(url).digest('hex')
}

/** Record the newest signed URL seen for an image so retries can use it. */
export function rememberFreshAvatarUrl(url: string | null | undefined): void {
  const value = String(url ?? '').trim()
  if (!value) return
  const key = avatarImageKey(value)
  if (!key) return
  if (freshestUrlByImageKey.size >= MAX_TRACKED_IMAGES && !freshestUrlByImageKey.has(key)) {
    const oldest = freshestUrlByImageKey.keys().next().value
    if (oldest !== undefined) freshestUrlByImageKey.delete(oldest)
  }
  // Delete + set so refreshes move the key to the back of the eviction order.
  freshestUrlByImageKey.delete(key)
  freshestUrlByImageKey.set(key, value)
}

export function freshestUrlForImage(url: string): string | undefined {
  return freshestUrlByImageKey.get(avatarImageKey(url))
}

async function readCacheFile(path: string): Promise<Buffer | null> {
  try {
    const fileStats = await stat(path)
    if (!fileStats.isFile()) return null
    return await readFile(path)
  } catch {
    return null
  }
}

export async function readCachedAvatar(cacheDir: string, url: string): Promise<CachedAvatar | null> {
  const stablePath = join(cacheDir, avatarCacheFileName(url))
  let data = await readCacheFile(stablePath)

  if (!data) {
    const legacyPath = join(cacheDir, legacyAvatarCacheFileName(url))
    if (legacyPath !== stablePath) {
      data = await readCacheFile(legacyPath)
      // Migrate to the stable name so re-signed URLs find this file too.
      if (data) await rename(legacyPath, stablePath).catch(() => {})
    }
  }

  if (!data) return null
  return { data, contentType: detectAvatarContentType(data) || 'application/octet-stream' }
}

async function fetchAvatarOnce(url: string): Promise<CachedAvatar> {
  try {
    await assertSafePublicHttpUrl(url)
  } catch (err) {
    throw new AvatarFetchError(
      `Blocked avatar URL: ${err instanceof Error ? err.message : String(err)}`,
      400
    )
  }

  const fetchImpl = resolveFetchImpl()
  const response = await fetchImpl(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Referer: 'https://www.tiktok.com/'
    }
  })

  if (!response.ok) {
    throw new AvatarFetchError(`Avatar fetch failed (HTTP ${response.status})`, response.status)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.byteLength > MAX_AVATAR_BYTES) {
    throw new AvatarFetchError('Avatar too large', 413)
  }

  // Trust the bytes over the declared header: TikTok's CDN sometimes labels
  // real images `application/octet-stream`, which must not fail the request.
  const contentType = resolveAvatarContentType(buffer, response.headers.get('Content-Type'))
  if (!contentType) {
    throw new AvatarFetchError('Not an image', 415)
  }

  return { data: buffer, contentType }
}

export async function fetchAndCacheAvatar(cacheDir: string, url: string): Promise<CachedAvatar> {
  const avatar = await fetchAvatarOnce(url)
  try {
    await mkdir(cacheDir, { recursive: true })
    await writeFile(join(cacheDir, avatarCacheFileName(url)), avatar.data)
  } catch (err) {
    console.error('[AvatarCache] Failed to cache avatar:', err)
  }
  return avatar
}

/**
 * Cache-first load: stable-key disk hit → fetch the requested URL → retry with
 * the freshest signed URL seen for the same image (the requested signature may
 * have expired between the event and this request).
 */
export async function loadAvatar(cacheDir: string, url: string): Promise<CachedAvatar> {
  const cached = await readCachedAvatar(cacheDir, url)
  if (cached) return cached

  let firstError: unknown
  try {
    return await fetchAndCacheAvatar(cacheDir, url)
  } catch (err) {
    firstError = err
  }

  const freshest = freshestUrlForImage(url)
  if (freshest && freshest !== url) {
    try {
      return await fetchAndCacheAvatar(cacheDir, freshest)
    } catch {
      // Fall through to the original error.
    }
  }

  throw firstError
}

/**
 * Fire-and-forget download at event-ingest time, deduped per image, so the
 * bytes land on disk while the signature is guaranteed valid. Never rejects.
 */
export function warmAvatarCache(url: string | null | undefined, cacheDir?: string | null): Promise<void> {
  const value = String(url ?? '').trim()
  if (!/^https?:\/\//i.test(value)) return Promise.resolve()

  rememberFreshAvatarUrl(value)

  const key = avatarImageKey(value)
  if (!key || warmedImageKeys.has(key) || warmInFlight.has(key)) return Promise.resolve()

  const lastAttempt = lastWarmAttemptAt.get(key)
  const now = Date.now()
  if (lastAttempt !== undefined && now - lastAttempt < WARM_RETRY_COOLDOWN_MS) {
    return Promise.resolve()
  }

  const dir = cacheDir ?? defaultAvatarCacheDir()
  if (!dir) return Promise.resolve()

  if (lastWarmAttemptAt.size >= MAX_TRACKED_IMAGES) lastWarmAttemptAt.clear()
  lastWarmAttemptAt.set(key, now)
  warmInFlight.add(key)

  return (async () => {
    try {
      if (!(await readCachedAvatar(dir, value))) {
        await fetchAndCacheAvatar(dir, value)
      }
      if (warmedImageKeys.size >= MAX_TRACKED_IMAGES) warmedImageKeys.clear()
      warmedImageKeys.add(key)
    } catch {
      // Best-effort: the proxy retries on demand with the freshest URL.
    } finally {
      warmInFlight.delete(key)
    }
  })()
}

/** Test hook: clears all module-level state. */
export function __resetAvatarCacheStateForTests(): void {
  freshestUrlByImageKey.clear()
  warmInFlight.clear()
  warmedImageKeys.clear()
  lastWarmAttemptAt.clear()
}
