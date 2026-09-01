import { createHash, randomBytes } from 'crypto'
import { createRequire } from 'module'
import { join, resolve } from 'path'
import { mkdir, readFile, stat, unlink, writeFile, rename } from 'fs/promises'
import { avatarImageKey } from '../../shared/avatar-url'
import { fetchSafePublicHttp, MAX_AVATAR_BYTES } from './ssrf-guard'
import { detectAvatarContentType, resolveAvatarContentType } from './avatar-content-type'

const requireModule = createRequire(import.meta.url)

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

const MAX_TRACKED_IMAGES = 5000
const WARM_RETRY_COOLDOWN_MS = 60_000
export const AVATAR_CACHE_TTL_MS = 5 * 60_000
export const AVATAR_FETCH_TIMEOUT_MS = 8_000
const AVATAR_CACHE_SCHEMA_VERSION = '3'

/** imageKey → most recently seen (freshest-signed) URL for that image. */
const freshestUrlByImageKey = new Map<string, string>()
/** imageKeys with a warm download currently in flight. */
const warmInFlight = new Set<string>()
/** imageKeys confirmed on disk this session (skips repeat stats). */
const warmedImageKeys = new Set<string>()
/** imageKey → last warm attempt, so a failing CDN isn't hammered per event. */
const lastWarmAttemptAt = new Map<string, number>()
/** cacheDir + imageKey → one normal cache/revalidation load in flight. */
const loadInFlight = new Map<string, Promise<CachedAvatar>>()

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
  etag: string
}

interface CachedAvatarEntry extends CachedAvatar {
  stale: boolean
}

export interface LoadAvatarOptions {
  maxAgeMs?: number
  fetchTimeoutMs?: number
}

export function defaultAvatarCacheDir(): string | null {
  try {
    const electron = requireModule('electron')
    const app = electron && typeof electron === 'object' ? electron.app : null
    if (typeof app?.getPath !== 'function') return null
    const userData = app.getPath('userData')
    return userData ? join(userData, 'avatar_cache') : null
  } catch {
    return null
  }
}

/** Cache file name keyed on the stable image identity, not the signed URL. */
export function avatarCacheFileName(url: string): string {
  return createHash('sha256')
    .update(`${AVATAR_CACHE_SCHEMA_VERSION}:${avatarImageKey(url)}`)
    .digest('hex')
}

/** Cache file name used by older builds (full signed URL). */
export function legacyAvatarCacheFileName(url: string): string {
  return createHash('sha256').update(url).digest('hex')
}

/** Cache file name used by v2 builds (stable identity without a schema prefix). */
function legacyStableAvatarCacheFileName(url: string): string {
  return createHash('sha256').update(avatarImageKey(url)).digest('hex')
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

function avatarEtag(data: Buffer): string {
  return `"${createHash('sha256').update(data).digest('base64url')}"`
}

async function readCacheFile(path: string): Promise<{ data: Buffer; mtimeMs: number } | null> {
  try {
    const fileStats = await stat(path)
    if (!fileStats.isFile()) return null
    if (fileStats.size <= 0 || fileStats.size > MAX_AVATAR_BYTES) {
      await unlink(path).catch(() => {})
      return null
    }
    return { data: await readFile(path), mtimeMs: fileStats.mtimeMs }
  } catch {
    return null
  }
}

async function readCachedAvatarEntry(
  cacheDir: string,
  url: string,
  maxAgeMs: number
): Promise<CachedAvatarEntry | null> {
  const currentPath = join(cacheDir, avatarCacheFileName(url))
  const candidates = [
    { path: currentPath, legacy: false },
    { path: join(cacheDir, legacyStableAvatarCacheFileName(url)), legacy: true },
    { path: join(cacheDir, legacyAvatarCacheFileName(url)), legacy: true }
  ]
  const checked = new Set<string>()

  for (const candidate of candidates) {
    if (checked.has(candidate.path)) continue
    checked.add(candidate.path)

    const cached = await readCacheFile(candidate.path)
    if (!cached) continue

    const contentType = detectAvatarContentType(cached.data)
    if (!contentType) {
      // Do not let a partial write, HTML error page, or other corrupt entry
      // become a permanent image. A normal load will refetch after removal.
      await unlink(candidate.path).catch(() => {})
      continue
    }

    return {
      data: cached.data,
      contentType,
      etag: avatarEtag(cached.data),
      // Files created before the v3 cache schema have no trustworthy freshness
      // metadata for this policy, so always revalidate them before migrating.
      stale: candidate.legacy || Date.now() - cached.mtimeMs >= maxAgeMs
    }
  }

  return null
}

export async function readCachedAvatar(cacheDir: string, url: string): Promise<CachedAvatar | null> {
  const cached = await readCachedAvatarEntry(cacheDir, url, AVATAR_CACHE_TTL_MS)
  if (!cached) return null
  const { stale: _stale, ...avatar } = cached
  return avatar
}

async function fetchAvatarOnce(url: string, timeoutMs: number): Promise<CachedAvatar> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(1, timeoutMs))

  try {
    const response = await fetchSafePublicHttp(url, {
      signal: controller.signal,
      maxBytes: MAX_AVATAR_BYTES,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Referer: 'https://www.tiktok.com/'
      }
    })

    if (response.status < 200 || response.status >= 300) {
      throw new AvatarFetchError(`Avatar fetch failed (HTTP ${response.status})`, response.status)
    }

    const buffer = response.data
    if (buffer.byteLength > MAX_AVATAR_BYTES) {
      throw new AvatarFetchError('Avatar too large', 413)
    }

    // Trust the bytes over the declared header: TikTok's CDN sometimes labels
    // real images `application/octet-stream`, which must not fail the request.
    const declaredContentType = Array.isArray(response.headers['content-type'])
      ? response.headers['content-type'][0]
      : response.headers['content-type']
    const contentType = resolveAvatarContentType(buffer, declaredContentType || null)
    if (!contentType) {
      throw new AvatarFetchError('Not an image', 415)
    }

    return { data: buffer, contentType, etag: avatarEtag(buffer) }
  } catch (err) {
    if (err instanceof AvatarFetchError) throw err
    if (controller.signal.aborted) {
      throw new AvatarFetchError('Avatar fetch timed out', 504)
    }
    const message = err instanceof Error ? err.message : String(err)
    if (/^(Invalid URL|Blocked |DNS resolution failed|Too many redirects)/.test(message)) {
      throw new AvatarFetchError(`Blocked avatar URL: ${message}`, 400)
    }
    if (message === 'Response too large') {
      throw new AvatarFetchError('Avatar too large', 413)
    }
    throw new AvatarFetchError(
      `Avatar fetch failed: ${message}`,
      502
    )
  } finally {
    clearTimeout(timeout)
  }
}

async function writeAvatarAtomically(cacheDir: string, fileName: string, data: Buffer): Promise<void> {
  await mkdir(cacheDir, { recursive: true })
  const targetPath = join(cacheDir, fileName)
  const tempPath = join(cacheDir, `.${fileName}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`)

  try {
    await writeFile(tempPath, data, { flag: 'wx' })
    await rename(tempPath, targetPath)
  } finally {
    await unlink(tempPath).catch(() => {})
  }
}

export async function fetchAndCacheAvatar(
  cacheDir: string,
  url: string,
  timeoutMs = AVATAR_FETCH_TIMEOUT_MS
): Promise<CachedAvatar> {
  const avatar = await fetchAvatarOnce(url, timeoutMs)
  try {
    await writeAvatarAtomically(cacheDir, avatarCacheFileName(url), avatar.data)
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
async function loadAvatarOnce(
  cacheDir: string,
  url: string,
  options: LoadAvatarOptions
): Promise<CachedAvatar> {
  const maxAgeMs = Math.max(0, options.maxAgeMs ?? AVATAR_CACHE_TTL_MS)
  const timeoutMs = Math.max(1, options.fetchTimeoutMs ?? AVATAR_FETCH_TIMEOUT_MS)
  const cached = await readCachedAvatarEntry(cacheDir, url, maxAgeMs)
  if (cached && !cached.stale) {
    const { stale: _stale, ...avatar } = cached
    return avatar
  }

  let firstError: unknown
  try {
    return await fetchAndCacheAvatar(cacheDir, url, timeoutMs)
  } catch (err) {
    firstError = err
  }

  const freshest = freshestUrlForImage(url)
  if (freshest && freshest !== url) {
    try {
      return await fetchAndCacheAvatar(cacheDir, freshest, timeoutMs)
    } catch {
      // Fall through to the original error.
    }
  }

  if (cached) {
    const { stale: _stale, ...avatar } = cached
    return avatar
  }

  throw firstError
}

export function loadAvatar(
  cacheDir: string,
  url: string,
  options: LoadAvatarOptions = {}
): Promise<CachedAvatar> {
  const key = `${resolve(cacheDir)}\0${avatarImageKey(url)}`
  const existing = loadInFlight.get(key)
  if (existing) return existing

  const pending = loadAvatarOnce(cacheDir, url, options)
  loadInFlight.set(key, pending)
  void pending.finally(() => {
    if (loadInFlight.get(key) === pending) loadInFlight.delete(key)
  }).catch(() => {})
  return pending
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
      await loadAvatar(dir, value)
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
  loadInFlight.clear()
}
