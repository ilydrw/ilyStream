import { describe, expect, it } from 'vitest'
import { INLINE_AVATAR_RUNTIME_SCRIPT } from './runtime-assets'

function loadRuntime() {
  const body = INLINE_AVATAR_RUNTIME_SCRIPT
    .replace(/^<script[^>]*>/, '')
    .replace(/<\/script>$/, '')
  const windowMock = {
    location: new URL('http://127.0.0.1:8899/overlay/chat-unified')
  } as any
  const execute = new Function('window', 'URL', 'btoa', 'unescape', body)
  execute(
    windowMock,
    URL,
    (value: string) => Buffer.from(value, 'binary').toString('base64'),
    (value: string) => value.replace(/%([0-9a-f]{2})/gi, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
  )
  return windowMock.__ilyAvatar
}

describe('inline avatar runtime', () => {
  it('routes remote images through the local caching proxy', () => {
    const runtime = loadRuntime()
    const proxied = runtime.proxy('https://example.com/avatar.png')

    expect(proxied).toMatch(/^http:\/\/127\.0\.0\.1:8899\/avatar\//)
    expect(proxied).not.toContain('example.com')
  })

  it('keeps same-origin assets local', () => {
    const runtime = loadRuntime()
    expect(runtime.proxy('/assets/avatar.png')).toBe('http://127.0.0.1:8899/assets/avatar.png')
  })

  it('creates an inline fallback without a network request', () => {
    const runtime = loadRuntime()
    const fallback = runtime.resolve('', 'Alice')

    expect(fallback).toMatch(/^data:image\/svg\+xml/)
    expect(decodeURIComponent(fallback)).toContain('>A</text>')
  })
})
