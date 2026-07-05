import { describe, it, expect } from 'vitest'
import { isPrivateAddress, assertSafePublicHttpUrl } from './ssrf-guard'

describe('isPrivateAddress', () => {
  it('flags loopback / private / link-local IPv4 as private', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.5', '172.16.0.1', '172.31.255.255', '169.254.169.254', '0.0.0.0']) {
      expect(isPrivateAddress(ip), ip).toBe(true)
    }
  })

  it('treats public IPv4 as safe', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '203.0.113.10']) {
      expect(isPrivateAddress(ip), ip).toBe(false)
    }
  })

  it('flags loopback / ULA / link-local IPv6 as private', () => {
    for (const ip of ['::1', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:127.0.0.1']) {
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
})
