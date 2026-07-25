import { app, protocol } from 'electron'
import { join } from 'path'
import { AvatarFetchError, loadAvatar } from './avatar-cache'

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

      // Cache-first by stable image identity, with SSRF guarding and an
      // expired-signature retry inside loadAvatar. See lib/avatar-cache.ts.
      const cacheDir = join(app.getPath('userData'), 'avatar_cache')
      const avatar = await loadAvatar(cacheDir, decodedUrl)
      return new Response(new Uint8Array(avatar.data), {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=31536000',
          'Content-Type': avatar.contentType
        }
      })
    } catch (error) {
      if (error instanceof AvatarFetchError) {
        if (error.status === 400) {
          console.warn('[AvatarProtocol]', error.message)
        }
        return new Response(error.message, { status: error.status })
      }
      console.error('[AvatarProtocol] Error:', error)
      return new Response('Internal avatar proxy error', { status: 500 })
    }
  })
}
