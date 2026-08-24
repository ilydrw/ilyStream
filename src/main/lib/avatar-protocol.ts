import { app, protocol } from 'electron'
import { join } from 'path'
import { AvatarFetchError, loadAvatar } from './avatar-cache'

const AVATAR_REVALIDATION_HEADERS = {
  'Cache-Control': 'no-cache, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
  'X-Content-Type-Options': 'nosniff'
}

const AVATAR_ERROR_HEADERS = {
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
  Expires: '0',
  'Content-Type': 'text/plain; charset=utf-8',
  'X-Content-Type-Options': 'nosniff'
}

function avatarErrorResponse(message: string, status: number): Response {
  return new Response(message, { status, headers: AVATAR_ERROR_HEADERS })
}

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
        return avatarErrorResponse('Invalid avatar URL', 400)
      }

      // Cache-first by stable image identity, with SSRF guarding and an
      // expired-signature retry inside loadAvatar. See lib/avatar-cache.ts.
      const cacheDir = join(app.getPath('userData'), 'avatar_cache')
      const avatar = await loadAvatar(cacheDir, decodedUrl)
      const headers = {
        ...AVATAR_REVALIDATION_HEADERS,
        'Content-Type': avatar.contentType,
        ETag: avatar.etag
      }
      if (request.headers.get('If-None-Match') === avatar.etag) {
        return new Response(null, { status: 304, headers })
      }
      return new Response(new Uint8Array(avatar.data), {
        status: 200,
        headers
      })
    } catch (error) {
      if (error instanceof AvatarFetchError) {
        if (error.status === 400) {
          console.warn('[AvatarProtocol]', error.message)
        }
        return avatarErrorResponse(error.message, error.status)
      }
      console.error('[AvatarProtocol] Error:', error)
      return avatarErrorResponse('Internal avatar proxy error', 500)
    }
  })
}
