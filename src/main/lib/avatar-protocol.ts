import { app, net, protocol } from 'electron'
import { createHash } from 'crypto'
import { join } from 'path'
import { mkdir, readFile, stat, writeFile } from 'fs/promises'
import { assertSafePublicHttpUrl, MAX_AVATAR_BYTES } from './ssrf-guard'

function decodeAvatarProxyUrl(requestUrl: string): string | null {
  const url = new URL(requestUrl)
  const encoded = url.hostname === 'proxy'
    ? url.pathname.replace(/^\/+/, '')
    : `${url.hostname}${url.pathname}`.replace(/^\/+/, '')

  if (!encoded) return null

  let b64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
  while (b64.length % 4) b64 += '='

  const decodedUrl = Buffer.from(b64, 'base64').toString('utf-8')
  return decodedUrl.startsWith('http://') || decodedUrl.startsWith('https://') ? decodedUrl : null
}

export function registerAvatarProtocol(): void {
  protocol.handle('ily-avatar', async (request) => {
    try {
      const decodedUrl = decodeAvatarProxyUrl(request.url)
      if (!decodedUrl) {
        return new Response('Invalid avatar URL', { status: 400 })
      }

      // Block SSRF: reject anything pointing at a private/loopback/link-local host.
      try {
        await assertSafePublicHttpUrl(decodedUrl)
      } catch (err) {
        console.warn('[AvatarProtocol] Blocked avatar URL:', err instanceof Error ? err.message : err)
        return new Response('Blocked avatar URL', { status: 400 })
      }

      const avatarCacheDir = join(app.getPath('userData'), 'avatar_cache')
      const hash = createHash('sha256').update(decodedUrl).digest('hex')
      const cachePath = join(avatarCacheDir, hash)

      await mkdir(avatarCacheDir, { recursive: true })

      try {
        const fileStats = await stat(cachePath)
        if (fileStats.isFile()) {
          const data = await readFile(cachePath)
          return new Response(data, {
            status: 200,
            headers: {
              'Cache-Control': 'public, max-age=31536000',
              'Content-Type': 'image/jpeg'
            }
          })
        }
      } catch {
        // Cache miss.
      }

      const response = await net.fetch(decodedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Referer: 'https://www.tiktok.com/'
        }
      })

      if (!response.ok) {
        return new Response('Avatar fetch failed', { status: response.status })
      }

      const contentType = response.headers.get('Content-Type') || 'image/jpeg'
      // Only proxy actual images, and never more than MAX_AVATAR_BYTES — the
      // proxy must not be usable as a general-purpose data exfiltration channel.
      if (!contentType.toLowerCase().startsWith('image/')) {
        return new Response('Not an image', { status: 415 })
      }
      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.byteLength > MAX_AVATAR_BYTES) {
        return new Response('Avatar too large', { status: 413 })
      }
      void writeFile(cachePath, buffer).catch((error) => {
        console.error('[AvatarProtocol] Failed to cache avatar:', error)
      })

      return new Response(buffer, {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=31536000',
          'Content-Type': contentType
        }
      })
    } catch (error) {
      console.error('[AvatarProtocol] Error:', error)
      return new Response('Internal avatar proxy error', { status: 500 })
    }
  })
}
