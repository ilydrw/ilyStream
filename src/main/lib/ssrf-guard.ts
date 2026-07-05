import { lookup } from 'dns/promises'
import { isIP } from 'net'

/**
 * SSRF protection for the outbound avatar/image proxies. Both the `ily-avatar`
 * custom protocol and the overlay server's `/avatar/<b64>` route fetch an
 * arbitrary URL supplied by (potentially untrusted) renderer/LAN clients. Without
 * a guard those become a server-side request forgery primitive: a caller could
 * make the app GET internal hosts (127.0.0.1:<overlay port>, 192.168.x.x/admin,
 * cloud metadata at 169.254.169.254) and read the response back.
 *
 * We block any URL whose host is — or resolves to — a private, loopback,
 * link-local, or otherwise non-public address, and only allow http/https.
 */

/** Max bytes we'll read back from a proxied avatar (defense against huge bodies). */
export const MAX_AVATAR_BYTES = 8 * 1024 * 1024

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let n = 0
  for (const part of parts) {
    const v = Number(part)
    if (!Number.isInteger(v) || v < 0 || v > 255) return null
    n = (n << 8) | v
  }
  return n >>> 0
}

function isPrivateIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip)
  if (n === null) return true // unparseable → treat as unsafe
  const inRange = (base: string, bits: number): boolean => {
    const b = ipv4ToInt(base)
    if (b === null) return false
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
    return (n & mask) === (b & mask)
  }
  return (
    inRange('0.0.0.0', 8) ||        // "this network"
    inRange('10.0.0.0', 8) ||       // private
    inRange('100.64.0.0', 10) ||    // CGNAT
    inRange('127.0.0.0', 8) ||      // loopback
    inRange('169.254.0.0', 16) ||   // link-local (incl. cloud metadata)
    inRange('172.16.0.0', 12) ||    // private
    inRange('192.0.0.0', 24) ||     // IETF protocol assignments
    inRange('192.168.0.0', 16) ||   // private
    inRange('198.18.0.0', 15) ||    // benchmarking
    inRange('255.255.255.255', 32)  // broadcast
  )
}

function isPrivateIPv6(ip: string): boolean {
  const addr = ip.toLowerCase().split('%')[0]
  if (addr === '::1' || addr === '::') return true
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true // ULA fc00::/7
  if (/^fe[89ab]/.test(addr)) return true                          // link-local fe80::/10
  const mapped = addr.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)         // IPv4-mapped
  if (mapped) return isPrivateIPv4(mapped[1])
  return false
}

export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip)
  if (kind === 4) return isPrivateIPv4(ip)
  if (kind === 6) return isPrivateIPv6(ip)
  return true // not a recognizable IP → be conservative
}

/**
 * Resolve and validate a proxy target. Throws if the URL is not http(s) or if it
 * points at (or DNS-resolves to) a non-public address. Returns the parsed URL.
 */
export async function assertSafePublicHttpUrl(rawUrl: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('Invalid URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Blocked non-http(s) protocol: ${url.protocol}`)
  }

  const host = url.hostname.replace(/^\[/, '').replace(/\]$/, '')

  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error(`Blocked private address: ${host}`)
    return url
  }

  const resolved = await lookup(host, { all: true })
  if (!resolved.length) throw new Error(`DNS resolution failed for ${host}`)
  for (const entry of resolved) {
    if (isPrivateAddress(entry.address)) {
      throw new Error(`Blocked host ${host} resolving to private address ${entry.address}`)
    }
  }
  return url
}
