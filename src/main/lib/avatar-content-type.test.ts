import { describe, expect, it } from 'vitest'
import { detectAvatarContentType, resolveAvatarContentType } from './avatar-content-type'

describe('avatar content type detection', () => {
  it('recognizes the WebP bytes used by cached TikTok avatars', () => {
    const webp = Buffer.from('52494646040000005745425056503820', 'hex')

    expect(detectAvatarContentType(webp)).toBe('image/webp')
  })

  it('recognizes common non-WebP avatar formats', () => {
    expect(detectAvatarContentType(Buffer.from('ffd8ffe00010', 'hex'))).toBe('image/jpeg')
    expect(detectAvatarContentType(Buffer.from('89504e470d0a1a0a', 'hex'))).toBe('image/png')
    expect(detectAvatarContentType(Buffer.from('<svg viewBox="0 0 1 1"></svg>'))).toBe('image/svg+xml')
  })

  it('uses a sanitized image response type when the bytes are not recognizable', () => {
    expect(resolveAvatarContentType(Buffer.from([1, 2, 3]), 'image/avif; charset=binary')).toBe('image/avif')
    expect(resolveAvatarContentType(Buffer.from([1, 2, 3]), 'text/html')).toBeNull()
  })
})
