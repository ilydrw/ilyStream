import { describe, it, expect, vi } from 'vitest'
import {
  isPrivateAddress,
  assertSafePublicHttpUrl,
  fetchSafePublicHttp,
  MAX_AVATAR_BYTES,
  resolveSafePublicHttpUrl
} from './ssrf-guard'

describe('isPrivateAddress', () => {
  it('flags loopback / private / link-local IPv4 as private', () => {
    for (const ip of [
      '127.0.0.1', '10.1.2.3', '192.168.0.5', '172.16.0.1', '172.31.255.255',
      '169.254.169.254', '192.0.2.1', '198.51.100.2', '203.0.113.10', '224.0.0.1',
      '255.255.255.255', '0.0.0.0'
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true)
    }
  })

  it('treats public IPv4 as safe', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '93.184.216.34']) {
      expect(isPrivateAddress(ip), ip).toBe(false)
    }
  })

  it('flags loopback / ULA / link-local IPv6 as private', () => {
    for (const ip of [
      '::1', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:127.0.0.1',
      '::ffff:7f00:1', '2002:7f00:1::', '64:ff9b::7f00:1', '2001:db8::1', 'ff02::1'
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true)
    }
  })

  it('treats public IPv6 as safe and unknown strings as private', () => {
    expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false)
    expect(isPrivateAddress('not-an-ip')).toBe(true)
  })
})

describe('assertSafePublicHttpUrl', () => {
  it('rejects non-http(s) protocols', async () => {
    await expect(assertSafePublicHttpUrl('file:///etc/passwd')).rejects.toThrow()
    await expect(assertSafePublicHttpUrl('ftp://example.com/x')).rejects.toThrow()
  })

  it('rejects private/loopback IP literals without touching DNS', async () => {
    await expect(assertSafePublicHttpUrl('http://127.0.0.1:8080/admin')).rejects.toThrow()
    await expect(assertSafePublicHttpUrl('http://192.168.1.10/')).rejects.toThrow()
    await expect(assertSafePublicHttpUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow()
    await expect(assertSafePublicHttpUrl('http://[::1]/')).rejects.toThrow()
  })

  it('accepts a public IP literal', async () => {
    const url = await assertSafePublicHttpUrl('https://8.8.8.8/avatar.jpg')
    expect(url.hostname).toBe('8.8.8.8')
  })

  it('rejects credentials embedded in otherwise valid URLs', async () => {
    await expect(assertSafePublicHttpUrl('https://user:secret@8.8.8.8/avatar.jpg')).rejects.toThrow(
      'credentials'
    )
  })

  it('rejects a hostname when any DNS answer is private', async () => {
    await expect(resolveSafePublicHttpUrl('https://cdn.example/avatar.jpg', async () => [
      { address: '8.8.8.8', family: 4 },
      { address: '127.0.0.1', family: 4 }
    ])).rejects.toThrow('private address')
  })

  it('returns the exact validated addresses for connection pinning', async () => {
    const resolved = await resolveSafePublicHttpUrl('https://cdn.example/avatar.jpg', async () => [
      { address: '1.1.1.1', family: 4 }
    ])
    expect(resolved.addresses).toEqual([{ address: '1.1.1.1', family: 4 }])
  })
})

describe('fetchSafePublicHttp', () => {
  it('revalidates every redirect target before making the next request', async () => {
    const requester = vi.fn(async (url: URL) => ({
      url,
      status: 302,
      headers: { location: 'http://127.0.0.1/admin' },
      data: Buffer.alloc(0)
    }))

    await expect(fetchSafePublicHttp('https://8.8.8.8/avatar.jpg', { requester }))
      .rejects.toThrow('Blocked private address')
    expect(requester).toHaveBeenCalledTimes(1)
  })

  it('passes the validated DNS answer to the pinned requester', async () => {
    const requester = vi.fn(async (url: URL) => ({
      url,
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
      data: Buffer.from([0xff, 0xd8, 0xff])
    }))
    const resolver = vi.fn(async () => [{ address: '1.1.1.1', family: 4 as const }])

    await fetchSafePublicHttp('https://cdn.example/avatar.jpg', { requester, resolver })

    expect(requester).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: 'cdn.example' }),
      { address: '1.1.1.1', family: 4 },
      expect.objectContaining({ maxBytes: MAX_AVATAR_BYTES })
    )
  })
})
