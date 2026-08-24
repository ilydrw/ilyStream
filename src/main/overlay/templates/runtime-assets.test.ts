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

function loadRuntimeWithImage() {
  const instances: any[] = []
  class MockImage {
    complete = false
    naturalWidth = 0
    decoding = ''
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    src = ''

    constructor() {
      instances.push(this)
    }
  }
  const body = INLINE_AVATAR_RUNTIME_SCRIPT
    .replace(/^<script[^>]*>/, '')
    .replace(/<\/script>$/, '')
  const windowMock = {
    location: new URL('http://127.0.0.1:8899/overlay/now-playing'),
    Image: MockImage
  } as any
  const execute = new Function('window', 'URL', 'btoa', 'unescape', 'setTimeout', 'clearTimeout', 'Promise', body)
  execute(
    windowMock,
    URL,
    (value: string) => Buffer.from(value, 'binary').toString('base64'),
    (value: string) => value.replace(/%([0-9a-f]{2})/gi, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16))),
    setTimeout,
    clearTimeout,
    Promise
  )
  return { runtime: windowMock.__ilyAvatar, instances }
}

describe('inline avatar runtime', () => {
  it('routes remote images through the local caching proxy', () => {
    const runtime = loadRuntime()
    const proxied = runtime.proxy('https://example.com/avatar.png')

    expect(proxied).toMatch(/^http:\/\/127\.0\.0\.1:8899\/avatar\//)
    expect(proxied).not.toContain('example.com')
    expect(new URL(proxied).searchParams.get('v')).toBe('3')
    expect(new URL(proxied).searchParams.get('r')).toBeTruthy()
  })

  it('keeps same-origin assets local while giving each render a fresh identity', () => {
    const runtime = loadRuntime()
    const resolved = new URL(runtime.proxy('/assets/avatar.png', 'alert-42'))

    expect(resolved.origin + resolved.pathname).toBe('http://127.0.0.1:8899/assets/avatar.png')
    expect(resolved.searchParams.get('v')).toBe('3')
    expect(resolved.searchParams.get('r')).toBe('alert-42')
  })

  it('uses explicit revisions to prevent stale media across long-lived OBS sources', () => {
    const runtime = loadRuntime()
    const first = runtime.proxy('https://example.com/cover.jpg', 'track-a')
    const second = runtime.proxy('https://example.com/cover.jpg', 'track-b')

    expect(first).not.toBe(second)
    expect(new URL(first).searchParams.get('r')).toBe('track-a')
    expect(new URL(second).searchParams.get('r')).toBe('track-b')
  })

  it('creates an inline fallback without a network request', () => {
    const runtime = loadRuntime()
    const fallback = runtime.resolve('', 'Alice')

    expect(fallback).toMatch(/^data:image\/svg\+xml/)
    expect(decodeURIComponent(fallback)).toContain('>A</text>')
  })

  it('commits only the latest successfully loaded background image', async () => {
    const { runtime, instances } = loadRuntimeWithImage()
    const element = { style: { backgroundImage: '' } } as any

    const first = runtime.applyBackground(element, 'https://example.com/old.jpg', 'track-a')
    const second = runtime.applyBackground(element, 'https://example.com/new.jpg', 'track-b')
    instances[1].onload()
    await second
    const committed = element.style.backgroundImage

    instances[0].onload()
    await first

    expect(committed).toContain('r=track-b')
    expect(element.style.backgroundImage).toBe(committed)
    expect(element.style.backgroundImage).not.toContain('r=track-a')
  })

  it('clears stale background art while a replacement is loading or fails', async () => {
    const { runtime, instances } = loadRuntimeWithImage()
    const element = { style: { backgroundImage: 'url("stale")' } } as any

    const result = runtime.applyBackground(element, 'https://example.com/new.jpg', 'track-c')
    expect(element.style.backgroundImage).toBe('')

    instances[0].onerror()
    await expect(result).resolves.toBe(false)
    expect(element.style.backgroundImage).toBe('')
  })
})
