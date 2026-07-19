/**
 * Avatar URL stabilization.
 *
 * TikTok serves the *same* profile image under a URL that changes on every
 * event: the host prefix rotates (`p16-` ↔ `p19-common-sign.tiktokcdn-*.com`)
 * and the query string carries a per-event `refresh_token` / `x-signature`.
 * Persistent-display overlays (latest-gifter, likes leaderboard) key their
 * `<img src>` on the URL, so a churning URL resets the image on every event and
 * — on a busy stream — the avatar reloads faster than it can paint and never
 * settles.
 *
 * `avatarImageKey` collapses those volatile parts to a stable identity so we can
 * tell whether two URLs point at the same image. `AvatarUrlStabilizer` remembers
 * the first URL seen for each viewer+image and hands it back for subsequent
 * events, so downstream consumers see a stable string.
 *
 * The signature IS required to fetch (the bare path 403s), so we keep a real,
 * still-valid signed URL — we just stop it from changing every event.
 */

/** Hosts whose avatar URLs are signed + host-rotated and must be normalized. */
function isTikTokCdnHost(host: string): boolean {
  return /(^|\.)tiktokcdn(-[a-z0-9]+)?\.com$/i.test(host)
}

/**
 * A stable identity for an avatar URL. For TikTok CDN URLs this ignores the
 * rotating `pNN-` host prefix and the (per-event, signature-bearing) query
 * string, keeping only the path — which contains the content hash and is stable
 * for a given image. For every other host the query can be meaningful (e.g.
 * dicebear's `?seed=`), so the full URL is used verbatim.
 */
export function avatarImageKey(url: string | null | undefined): string {
  const value = String(url ?? '').trim()
  if (!value) return ''

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return value
  }

  if (!isTikTokCdnHost(parsed.hostname)) {
    return value
  }

  // Strip a leading `pNN-` / `pNN.` shard prefix so p16/p19 collapse together.
  const host = parsed.hostname.replace(/^p\d+[-.]/i, '')
  return `${host}${parsed.pathname}`
}

/** Whether two avatar URLs point at the same underlying image. */
export function isSameAvatarImage(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const keyA = avatarImageKey(a)
  const keyB = avatarImageKey(b)
  return keyA !== '' && keyA === keyB
}

/**
 * Remembers the first URL seen for each key+image and returns it for later
 * events carrying the same image, so a viewer's avatar URL stops churning.
 */
export class AvatarUrlStabilizer {
  private urlByKey = new Map<string, string>()
  private readonly maxEntries: number

  constructor(maxEntries = 5000) {
    this.maxEntries = Math.max(1, maxEntries)
  }

  /**
   * @param key    Stable per-viewer key (e.g. `platform:userId`).
   * @param url    The avatar URL from the current event (may be empty).
   * @returns      A stable URL: the remembered one when the image is unchanged
   *               (or when `url` is empty), otherwise the fresh `url`.
   */
  stabilize(key: string, url: string | null | undefined): string | undefined {
    const trimmedKey = String(key ?? '').trim()
    const incoming = String(url ?? '').trim()

    if (!trimmedKey) return incoming || undefined

    const previous = this.urlByKey.get(trimmedKey)

    // No usable incoming URL — reuse whatever we last had for this viewer.
    if (!incoming) return previous

    // Same image as last time → keep the stable string we already handed out.
    if (previous && isSameAvatarImage(previous, incoming)) return previous

    // New viewer or genuinely different image → adopt (and remember) it.
    if (this.urlByKey.size >= this.maxEntries && !this.urlByKey.has(trimmedKey)) {
      // Bounded LRU-ish eviction: drop the oldest inserted key.
      const oldest = this.urlByKey.keys().next().value
      if (oldest !== undefined) this.urlByKey.delete(oldest)
    }
    this.urlByKey.set(trimmedKey, incoming)
    return incoming
  }

  reset(): void {
    this.urlByKey.clear()
  }
}
