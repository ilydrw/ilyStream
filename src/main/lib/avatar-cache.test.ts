import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createHash } from 'crypto'

vi.mock('./ssrf-guard', () => ({
  assertSafePublicHttpUrl: vi.fn(async () => {}),
  MAX_AVATAR_BYTES: 64
}))

import {
  AvatarFetchError,
  avatarCacheFileName,
  loadAvatar,
  readCachedAvatar,
  rememberFreshAvatarUrl,
  warmAvatarCache,
  __resetAvatarCacheStateForTests
} from './avatar-cache'

// Same image under two different signatures/shard hosts — the production churn.
const SIG1 =
  'https://p16-common-sign.tiktokcdn-us.com/tos-useast8-avt-0068-tx2/fa1840cf~tplv-tiktokx-cropcenter:100:100.webp?refresh_token=aaa&x-signature=one&x-expires=1'
const SIG2 =
  'https://p19-common-sign.tiktokcdn-us.com/tos-useast8-avt-0068-tx2/fa1840cf~tplv-tiktokx-cropcenter:100:100.webp?refresh_token=bbb&x-signature=two&x-expires=2'

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])

function imageResponse(body: Buffer, contentType: string, status = 200): Response {
  return new Response(new Uint8Array(body), { status, headers: { 'Content-Type': contentType } })
}

describe('avatar-cache', () => {
  let cacheDir: string
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    __resetAvatarCacheStateForTests()
    cacheDir = await mkdtemp(join(tmpdir(), 'ilystream-avatar-cache-'))
    fetchMock = vi.fn(async () => imageResponse(JPEG, 'image/jpeg'))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('caches by stable image identity: a re-signed URL for the same image is a disk hit', async () => {
    const first = await loadAvatar(cacheDir, SIG1)
    expect(first.contentType).toBe('image/jpeg')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Different signature + shard host, same image → must NOT refetch.
    const second = await loadAvatar(cacheDir, SIG2)
    expect(second.data.equals(JPEG)).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('serves real image bytes even when the CDN declares a non-image content type', async () => {
    fetchMock.mockResolvedValueOnce(imageResponse(JPEG, 'application/octet-stream'))
    const avatar = await loadAvatar(cacheDir, SIG1)
    expect(avatar.contentType).toBe('image/jpeg')
  })

  it('rejects bodies that are neither sniffable nor declared as images', async () => {
    fetchMock.mockResolvedValueOnce(imageResponse(Buffer.from('<html>nope</html>'), 'text/html'))
    await expect(loadAvatar(cacheDir, SIG1)).rejects.toMatchObject({ status: 415 })
  })

  it('rejects oversized bodies', async () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(128)])
    fetchMock.mockResolvedValueOnce(imageResponse(big, 'image/jpeg'))
    await expect(loadAvatar(cacheDir, SIG1)).rejects.toMatchObject({ status: 413 })
  })

  it('retries an expired signature with the freshest URL seen for the same image', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('x-signature=one')) {
        return new Response('expired', { status: 403 })
      }
      return imageResponse(JPEG, 'image/jpeg')
    })

    // Ingest recorded a fresher signature for this image at some point.
    rememberFreshAvatarUrl(SIG2)

    // A widget asks for the old pinned URL — dead, but the image must still load.
    const avatar = await loadAvatar(cacheDir, SIG1)
    expect(avatar.data.equals(JPEG)).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // And the retry result is cached under the stable key for next time.
    expect(await readCachedAvatar(cacheDir, SIG1)).not.toBeNull()
  })

  it('propagates the original failure when no fresher URL is known', async () => {
    fetchMock.mockResolvedValue(new Response('expired', { status: 403 }))
    await expect(loadAvatar(cacheDir, SIG1)).rejects.toMatchObject({ status: 403 })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const err = await loadAvatar(cacheDir, SIG1).catch((e) => e)
    expect(err).toBeInstanceOf(AvatarFetchError)
  })

  it('finds and migrates cache files written by older builds (keyed on the full URL)', async () => {
    await mkdir(cacheDir, { recursive: true })
    const legacyPath = join(cacheDir, createHash('sha256').update(SIG1).digest('hex'))
    await writeFile(legacyPath, JPEG)
    fetchMock.mockRejectedValue(new Error('network must not be hit'))

    const avatar = await loadAvatar(cacheDir, SIG1)
    expect(avatar.data.equals(JPEG)).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()

    // Migrated to the stable name, so the re-signed variant hits it too.
    const stablePath = join(cacheDir, avatarCacheFileName(SIG2))
    expect(existsSync(stablePath)).toBe(true)
    expect((await readFile(stablePath)).equals(JPEG)).toBe(true)
  })

  it('warms the cache once per image, deduping re-signed variants', async () => {
    await warmAvatarCache(SIG1, cacheDir)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(await readCachedAvatar(cacheDir, SIG1)).not.toBeNull()

    // Same image, new signature → already warmed, no refetch.
    await warmAvatarCache(SIG2, cacheDir)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('never rejects from warmAvatarCache and cools down after a failed attempt', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 403 }))
    await expect(warmAvatarCache(SIG1, cacheDir)).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Immediate retry for the same image is throttled.
    await warmAvatarCache(SIG1, cacheDir)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('ignores non-http values when warming', async () => {
    await warmAvatarCache('', cacheDir)
    await warmAvatarCache('data:image/png;base64,AAAA', cacheDir)
    await warmAvatarCache(undefined, cacheDir)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
