import { lookup } from 'dns/promises'
import type { LookupAddress } from 'dns'
import { request as requestHttp } from 'http'
import { request as requestHttps } from 'https'
import { isIP } from 'net'
import type { IncomingHttpHeaders, RequestOptions } from 'http'

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
const MAX_SAFE_REDIRECTS = 5

type PublicHostResolver = (host: string) => Promise<LookupAddress[]>

export interface ResolvedPublicHttpUrl {
  url: URL
  addresses: LookupAddress[]
}

export interface SafeHttpResponse {
  url: URL
  status: number
  headers: IncomingHttpHeaders
  data: Buffer
}

export interface SafeHttpRequestOptions {
  signal?: AbortSignal
  headers?: Record<string, string>
  maxBytes?: number
  maxRedirects?: number
  resolver?: PublicHostResolver
  /** Test seam for exercising redirect and pinning policy without network I/O. */
  requester?: (
    url: URL,
    address: LookupAddress,
    options: { signal?: AbortSignal; headers?: Record<string, string>; maxBytes: number }
  ) => Promise<SafeHttpResponse>
}

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
    inRange('192.0.2.0', 24) ||     // documentation
    inRange('192.88.99.0', 24) ||   // deprecated 6to4 relay anycast
    inRange('192.168.0.0', 16) ||   // private
    inRange('198.18.0.0', 15) ||    // benchmarking
    inRange('198.51.100.0', 24) ||  // documentation
    inRange('203.0.113.0', 24) ||   // documentation
    inRange('224.0.0.0', 4) ||      // multicast
    inRange('240.0.0.0', 4)         // reserved / limited broadcast
  )
}

function isPrivateIPv6(ip: string): boolean {
  const addr = ip.toLowerCase().split('%')[0]
  if (addr === '::1' || addr === '::') return true
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true // ULA fc00::/7
  if (/^fe[89ab]/.test(addr)) return true                          // link-local fe80::/10
  if (/^fe[c-f]/.test(addr)) return true                           // deprecated site-local fec0::/10
  const mapped = addr.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)         // IPv4-mapped
  if (mapped) return isPrivateIPv4(mapped[1])
  const words = parseIPv6Words(addr)
  if (!words) return true
  const embeddedIpv4 = (high: number, low: number) =>
    `${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`
  const firstFiveZero = words.slice(0, 5).every((word) => word === 0)
  if (firstFiveZero && (words[5] === 0xffff || words[5] === 0)) {
    return isPrivateIPv4(embeddedIpv4(words[6], words[7]))
  }
  // 6to4 and NAT64 can route an embedded IPv4 destination after the public
  // IPv6 literal itself has passed validation.
  if (words[0] === 0x2002) return isPrivateIPv4(embeddedIpv4(words[1], words[2]))
  if (words[0] === 0x0064 && words[1] === 0xff9b) return true
  if (words[0] === 0x0100 && words.slice(1, 4).every((word) => word === 0)) return true // discard-only
  if (words[0] === 0x2001 && words[1] === 0x0000) return true // Teredo
  if (words[0] === 0x2001 && words[1] === 0x0002) return true // benchmarking
  if (words[0] === 0x2001 && words[1] === 0x0db8) return true // documentation
  if (words[0] === 0xff00 || (words[0] & 0xff00) === 0xff00) return true // multicast
  return false
}

function parseIPv6Words(ip: string): number[] | null {
  let normalized = ip
  const dottedTail = normalized.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)?.[1]
  if (dottedTail) {
    const value = ipv4ToInt(dottedTail)
    if (value === null) return null
    normalized = normalized.slice(0, -dottedTail.length) +
      `${((value >>> 16) & 0xffff).toString(16)}:${(value & 0xffff).toString(16)}`
  }
  if ((normalized.match(/::/g) || []).length > 1) return null
  const [leftRaw, rightRaw] = normalized.split('::')
  const parseSide = (side: string | undefined): number[] | null => {
    if (!side) return []
    const values = side.split(':').map((part) => Number.parseInt(part, 16))
    return values.every((value) => Number.isInteger(value) && value >= 0 && value <= 0xffff)
      ? values
      : null
  }
  const left = parseSide(leftRaw)
  const right = parseSide(rightRaw)
  if (!left || !right) return null
  if (!normalized.includes('::')) return left.length === 8 ? left : null
  const missing = 8 - left.length - right.length
  return missing >= 1 ? [...left, ...Array(missing).fill(0), ...right] : null
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
export async function resolveSafePublicHttpUrl(
  rawUrl: string,
  resolver: PublicHostResolver = async (host) => lookup(host, { all: true })
): Promise<ResolvedPublicHttpUrl> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('Invalid URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Blocked non-http(s) protocol: ${url.protocol}`)
  }
  if (url.username || url.password) {
    throw new Error('Blocked URL containing credentials')
  }

  const host = url.hostname.replace(/^\[/, '').replace(/\]$/, '')

  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error(`Blocked private address: ${host}`)
    return { url, addresses: [{ address: host, family: isIP(host) as 4 | 6 }] }
  }

  const resolved = await resolver(host)
  if (!resolved.length) throw new Error(`DNS resolution failed for ${host}`)
  for (const entry of resolved) {
    if (isPrivateAddress(entry.address)) {
      throw new Error(`Blocked host ${host} resolving to private address ${entry.address}`)
    }
  }
  return { url, addresses: resolved }
}

export async function assertSafePublicHttpUrl(rawUrl: string): Promise<URL> {
  return (await resolveSafePublicHttpUrl(rawUrl)).url
}

/**
 * Fetch an http(s) resource without a validation-to-use DNS gap. Each request
 * is connected through a lookup callback pinned to an address that was already
 * classified as public. Redirects are handled manually and fully revalidated.
 */
export async function fetchSafePublicHttp(
  rawUrl: string,
  options: SafeHttpRequestOptions = {}
): Promise<SafeHttpResponse> {
  const maxBytes = Math.max(1, options.maxBytes ?? MAX_AVATAR_BYTES)
  const maxRedirects = Math.max(0, options.maxRedirects ?? MAX_SAFE_REDIRECTS)
  let currentUrl = rawUrl

  for (let redirectCount = 0; ; redirectCount += 1) {
    const resolved = await resolveSafePublicHttpUrl(currentUrl, options.resolver)
    const address = resolved.addresses[0]
    const response = await (options.requester ?? requestPinnedUrl)(resolved.url, address, {
      signal: options.signal,
      headers: options.headers,
      maxBytes
    })

    if (!isRedirect(response.status)) return response
    const location = firstHeader(response.headers.location)
    if (!location) return response
    if (redirectCount >= maxRedirects) throw new Error('Too many redirects')
    currentUrl = new URL(location, resolved.url).href
  }
}

function requestPinnedUrl(
  url: URL,
  address: LookupAddress,
  options: Pick<SafeHttpRequestOptions, 'signal' | 'headers'> & { maxBytes: number }
): Promise<SafeHttpResponse> {
  return new Promise((resolve, reject) => {
    const requestOptions: RequestOptions = {
      method: 'GET',
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      headers: options.headers,
      signal: options.signal,
      lookup: (_hostname, _lookupOptions, callback) => {
        callback(null, address.address, address.family)
      }
    }
    const request = (url.protocol === 'https:' ? requestHttps : requestHttp)(requestOptions, (response) => {
      const status = response.statusCode || 0
      const declaredLength = Number(firstHeader(response.headers['content-length']))
      if (Number.isFinite(declaredLength) && declaredLength > options.maxBytes) {
        response.destroy()
        reject(new Error('Response too large'))
        return
      }

      const chunks: Buffer[] = []
      let totalBytes = 0
      response.on('data', (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        totalBytes += buffer.byteLength
        if (totalBytes > options.maxBytes) {
          response.destroy(new Error('Response too large'))
          return
        }
        chunks.push(buffer)
      })
      response.once('error', reject)
      response.once('end', () => {
        resolve({ url, status, headers: response.headers, data: Buffer.concat(chunks) })
      })
    })
    request.once('error', reject)
    request.end()
  })
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}
