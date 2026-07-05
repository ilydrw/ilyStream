/**
 * Quota-free YouTube live chat via the InnerTube ("youtubei") web API — the
 * same endpoints the youtube.com watch page itself calls. Reading chat this
 * way consumes zero Data API quota, which is how third-party chat tools stay
 * connected for hours without exhausting a Google Cloud project's daily units.
 *
 * The Data API remains the write path (sending chat requires OAuth) — this
 * module is read-only.
 */

import type { Emote } from '../types'

const YOUTUBE_ORIGIN = 'https://www.youtube.com'
const FALLBACK_CLIENT_VERSION = '2.20240718.01.00'
const REQUEST_TIMEOUT_MS = 15_000
const DEFAULT_POLL_TIMEOUT_MS = 2_000
const MIN_POLL_TIMEOUT_MS = 800
const MAX_POLL_TIMEOUT_MS = 30_000

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  // Pre-accepted consent keeps EU visitors from being bounced to consent.youtube.com.
  'Cookie': 'CONSENT=YES+cb; SOCS=CAI'
}

export type InnertubeChatItemType =
  | 'text'
  | 'superchat'
  | 'supersticker'
  | 'membership'
  | 'membership-gift'

export interface InnertubeChatItem {
  id: string
  type: InnertubeChatItemType
  authorChannelId: string
  authorName: string
  authorPhotoUrl?: string
  isModerator: boolean
  isOwner: boolean
  isMember: boolean
  isVerified: boolean
  message: string
  emotes: Emote[]
  /** Raw display string for paid items, e.g. "$5.00" or "CA$2.00". */
  purchaseAmountText?: string
  /** Best-effort amount in cents parsed from purchaseAmountText. */
  purchaseAmountCents?: number
  stickerAltText?: string
  /** Number of gifted memberships for membership-gift announcements. */
  giftCount?: number
  timestampMs: number
  raw: any
}

export class InnertubeUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InnertubeUnavailableError'
  }
}

/** The live chat this client was reading has ended (stream over / chat closed). */
export class InnertubeChatEndedError extends Error {
  constructor(message = 'YouTube live chat ended') {
    super(message)
    this.name = 'InnertubeChatEndedError'
  }
}

interface InnertubeSession {
  apiKey: string
  clientVersion: string
  continuation: string
}

/**
 * Resolves the currently-live (or waiting-room) video id for a channel by
 * loading the channel's public /live page. Completely free — no API involved.
 * Returns null when the channel exists but isn't live.
 */
export async function resolveLiveVideoIdFromChannel(input: string): Promise<string | null> {
  const livePath = buildChannelLivePath(input)
  if (!livePath) return null

  const html = await fetchText(`${YOUTUBE_ORIGIN}${livePath}`)
  const player = extractJsonAssignment(html, 'ytInitialPlayerResponse')
  const videoId: string | undefined = player?.videoDetails?.videoId

  if (videoId && isLiveOrUpcoming(player)) return videoId

  // Fallback: the canonical link on a live redirect points at the watch page.
  const canonical = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})"/)
  if (canonical && /"isLive"\s*:\s*true/.test(html)) return canonical[1]

  return null
}

/** Maps a channel handle / id / URL to its /live page path. */
export function buildChannelLivePath(input: string): string | null {
  const trimmed = String(input || '').trim()
  if (!trimmed) return null

  if (/^UC[A-Za-z0-9_-]{22}$/.test(trimmed)) return `/channel/${trimmed}/live`
  if (trimmed.startsWith('@')) return `/${encodeURIComponent(trimmed).replace(/%40/, '@')}/live`

  if (trimmed.includes('youtube.com/')) {
    try {
      const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
      const path = url.pathname.replace(/\/+$/, '')
      const channelMatch = path.match(/^\/(channel\/UC[A-Za-z0-9_-]{22}|@[^/]+|c\/[^/]+|user\/[^/]+)/)
      if (channelMatch) return `/${channelMatch[1]}/live`
      return null
    } catch {
      return null
    }
  }

  // Bare channel names ("SomeChannel") are treated as handles.
  if (/^[A-Za-z0-9._-]{3,}$/.test(trimmed)) return `/@${encodeURIComponent(trimmed)}/live`
  return null
}

/**
 * Streams live chat for one video. Create, then call start(); items arrive via
 * the onItems callback. Call stop() to tear down.
 */
export class InnertubeLiveChat {
  private session: InnertubeSession | null = null
  private pollTimer: ReturnType<typeof setTimeout> | null = null
  private stopped = false
  private consecutiveErrors = 0

  constructor(
    readonly videoId: string,
    private readonly onItems: (items: InnertubeChatItem[]) => void,
    private readonly onEnded: (error: Error) => void
  ) {}

  async start(): Promise<void> {
    this.session = await this.createSession()
    this.scheduleNextPoll(0)
  }

  stop(): void {
    this.stopped = true
    if (this.pollTimer) {
      clearTimeout(this.pollTimer)
      this.pollTimer = null
    }
  }

  private async createSession(): Promise<InnertubeSession> {
    const html = await fetchText(
      `${YOUTUBE_ORIGIN}/live_chat?is_popout=1&v=${encodeURIComponent(this.videoId)}`
    )

    const apiKey = html.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/)?.[1]
    const clientVersion =
      html.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION"\s*:\s*"([^"]+)"/)?.[1] ||
      html.match(/"clientVersion"\s*:\s*"(2\.[^"]+)"/)?.[1] ||
      FALLBACK_CLIENT_VERSION

    if (!apiKey) {
      throw new InnertubeUnavailableError('Could not read the YouTube chat page (no InnerTube key). YouTube may have changed its markup.')
    }

    const initialData = extractJsonAssignment(html, 'ytInitialData')
    const continuation = readContinuationToken(initialData?.contents?.liveChatRenderer)
    if (!continuation) {
      throw new InnertubeChatEndedError('This video has no active live chat yet.')
    }

    return { apiKey, clientVersion, continuation }
  }

  private scheduleNextPoll(delayMs: number): void {
    if (this.stopped) return
    this.pollTimer = setTimeout(() => {
      void this.poll()
    }, delayMs)
  }

  private async poll(): Promise<void> {
    if (this.stopped || !this.session) return

    try {
      const response = await fetchWithTimeout(
        `${YOUTUBE_ORIGIN}/youtubei/v1/live_chat/get_live_chat?key=${encodeURIComponent(this.session.apiKey)}&prettyPrint=false`,
        {
          method: 'POST',
          headers: {
            ...BROWSER_HEADERS,
            'Content-Type': 'application/json',
            'Origin': YOUTUBE_ORIGIN,
            'Referer': `${YOUTUBE_ORIGIN}/live_chat?is_popout=1&v=${this.videoId}`
          },
          body: JSON.stringify({
            context: {
              client: {
                clientName: 'WEB',
                clientVersion: this.session.clientVersion,
                hl: 'en',
                gl: 'US'
              }
            },
            continuation: this.session.continuation
          })
        }
      )

      if (!response.ok) {
        throw new Error(`InnerTube live chat request failed (${response.status})`)
      }

      const payload: any = await response.json()
      const chat = payload?.continuationContents?.liveChatContinuation
      if (!chat) {
        // No continuation contents = the chat is over.
        this.stop()
        this.onEnded(new InnertubeChatEndedError())
        return
      }

      const { continuation, timeoutMs } = readContinuation(chat)
      if (continuation) this.session.continuation = continuation

      const items = (Array.isArray(chat.actions) ? chat.actions : [])
        .map((action: any) => parseChatAction(action))
        .filter((item: InnertubeChatItem | null): item is InnertubeChatItem => Boolean(item))
      if (items.length > 0) this.onItems(items)

      this.consecutiveErrors = 0
      this.scheduleNextPoll(clampTimeout(timeoutMs))
    } catch (error) {
      if (this.stopped) return
      if (error instanceof InnertubeChatEndedError) {
        this.stop()
        this.onEnded(error)
        return
      }

      this.consecutiveErrors++
      console.warn(`[youtube-innertube] Poll error (attempt ${this.consecutiveErrors}):`, error instanceof Error ? error.message : error)
      if (this.consecutiveErrors >= 5) {
        this.stop()
        this.onEnded(error instanceof Error ? error : new Error(String(error)))
        return
      }
      this.scheduleNextPoll(Math.min(2_000 * this.consecutiveErrors, MAX_POLL_TIMEOUT_MS))
    }
  }
}

// --- Parsing helpers -------------------------------------------------------

function isLiveOrUpcoming(player: any): boolean {
  if (!player) return false
  if (player.videoDetails?.isLive === true) return true
  // Waiting rooms count — their chat is already open.
  return player.playabilityStatus?.liveStreamability != null
    && player.videoDetails?.isUpcoming === true
}

function readContinuation(chat: any): { continuation: string | null; timeoutMs: number } {
  const entry = Array.isArray(chat?.continuations) ? chat.continuations[0] : null
  const data =
    entry?.invalidationContinuationData ||
    entry?.timedContinuationData ||
    entry?.reloadContinuationData ||
    entry?.liveChatReplayContinuationData
  return {
    continuation: data?.continuation || null,
    timeoutMs: Number(data?.timeoutMs) || DEFAULT_POLL_TIMEOUT_MS
  }
}

function readContinuationToken(liveChatRenderer: any): string | null {
  return readContinuation(liveChatRenderer).continuation
}

function clampTimeout(timeoutMs: number): number {
  return Math.max(MIN_POLL_TIMEOUT_MS, Math.min(MAX_POLL_TIMEOUT_MS, timeoutMs))
}

function parseChatAction(action: any): InnertubeChatItem | null {
  const item = action?.addChatItemAction?.item
  if (!item) return null

  const text = item.liveChatTextMessageRenderer
  if (text) return parseRenderer(text, 'text')

  const paid = item.liveChatPaidMessageRenderer
  if (paid) return parseRenderer(paid, 'superchat')

  const sticker = item.liveChatPaidStickerRenderer
  if (sticker) {
    const parsed = parseRenderer(sticker, 'supersticker')
    if (parsed) parsed.stickerAltText = sticker.sticker?.accessibility?.accessibilityData?.label || 'Super Sticker'
    return parsed
  }

  const membership = item.liveChatMembershipItemRenderer
  if (membership) {
    const parsed = parseRenderer(membership, 'membership')
    if (parsed && !parsed.message) {
      parsed.message = readRuns(membership.headerSubtext || membership.headerPrimaryText).message
    }
    return parsed
  }

  const gift = item.liveChatSponsorshipsGiftPurchaseAnnouncementRenderer
  if (gift) {
    const header = gift.header?.liveChatSponsorshipsHeaderRenderer
    const headerText = readRuns(header?.primaryText).message
    const parsed: InnertubeChatItem = {
      id: gift.id || cryptoRandomId(),
      type: 'membership-gift',
      authorChannelId: gift.authorExternalChannelId || '',
      authorName: readSimpleText(header?.authorName) || 'Unknown',
      authorPhotoUrl: readThumbnail(header?.authorPhoto),
      isModerator: false,
      isOwner: false,
      isMember: true,
      isVerified: false,
      message: headerText,
      emotes: [],
      giftCount: parseGiftCount(headerText),
      timestampMs: readTimestampMs(gift),
      raw: item
    }
    return parsed
  }

  return null
}

function parseRenderer(renderer: any, type: InnertubeChatItemType): InnertubeChatItem | null {
  if (!renderer) return null
  const badges = readBadges(renderer.authorBadges)
  const { message, emotes } = readRuns(renderer.message)
  const purchaseAmountText = readSimpleText(renderer.purchaseAmountText) || undefined

  return {
    id: renderer.id || cryptoRandomId(),
    type,
    authorChannelId: renderer.authorExternalChannelId || '',
    authorName: readSimpleText(renderer.authorName) || 'Unknown',
    authorPhotoUrl: readThumbnail(renderer.authorPhoto),
    isModerator: badges.isModerator,
    isOwner: badges.isOwner,
    isMember: badges.isMember,
    isVerified: badges.isVerified,
    message,
    emotes,
    purchaseAmountText,
    purchaseAmountCents: purchaseAmountText ? parseAmountCents(purchaseAmountText) : undefined,
    timestampMs: readTimestampMs(renderer),
    raw: renderer
  }
}

function readBadges(authorBadges: any): { isModerator: boolean; isOwner: boolean; isMember: boolean; isVerified: boolean } {
  const result = { isModerator: false, isOwner: false, isMember: false, isVerified: false }
  for (const badge of Array.isArray(authorBadges) ? authorBadges : []) {
    const renderer = badge?.liveChatAuthorBadgeRenderer
    const iconType = String(renderer?.icon?.iconType || '').toUpperCase()
    if (iconType === 'MODERATOR') result.isModerator = true
    if (iconType === 'OWNER') result.isOwner = true
    if (iconType === 'VERIFIED') result.isVerified = true
    // Channel memberships use a custom thumbnail badge instead of an icon type.
    if (renderer?.customThumbnail) result.isMember = true
  }
  return result
}

function readRuns(message: any): { message: string; emotes: Emote[] } {
  const runs = message?.runs
  if (!Array.isArray(runs)) return { message: readSimpleText(message), emotes: [] }

  let text = ''
  const emotes: Emote[] = []

  for (const run of runs) {
    if (typeof run?.text === 'string') {
      text += run.text
      continue
    }
    const emoji = run?.emoji
    if (emoji) {
      const label: string = emoji.shortcuts?.[0] || emoji.searchTerms?.[0] || emoji.emojiId || ':emoji:'
      const startIndex = text.length
      text += label
      // Only surface custom channel emojis as overlay emotes — unicode emoji
      // render fine as text.
      if (emoji.isCustomEmoji) {
        const thumbnails = emoji.image?.thumbnails
        emotes.push({
          id: String(emoji.emojiId || label),
          name: label.replace(/^:|:$/g, ''),
          imageUrl: Array.isArray(thumbnails) ? thumbnails[thumbnails.length - 1]?.url : undefined,
          startIndex,
          endIndex: text.length - 1
        })
      }
    }
  }

  return { message: text, emotes }
}

function readSimpleText(node: any): string {
  if (!node) return ''
  if (typeof node === 'string') return node
  if (typeof node.simpleText === 'string') return node.simpleText
  if (Array.isArray(node.runs)) return node.runs.map((run: any) => run?.text || '').join('')
  return ''
}

function readThumbnail(photo: any): string | undefined {
  const thumbnails = photo?.thumbnails
  if (!Array.isArray(thumbnails) || thumbnails.length === 0) return undefined
  return thumbnails[thumbnails.length - 1]?.url
}

function readTimestampMs(renderer: any): number {
  const usec = Number(renderer?.timestampUsec)
  if (Number.isFinite(usec) && usec > 0) return Math.floor(usec / 1000)
  return Date.now()
}

/**
 * Best-effort currency parse ("$5.00" → 500). YouTube localizes these strings,
 * so unknown formats just yield the numeric part in cents.
 */
export function parseAmountCents(value: string): number {
  const numeric = value.replace(/[^0-9.,]/g, '')
  if (!numeric) return 0
  // Treat the last separator as the decimal point ("1.234,56" / "1,234.56").
  const lastComma = numeric.lastIndexOf(',')
  const lastDot = numeric.lastIndexOf('.')
  const decimalIndex = Math.max(lastComma, lastDot)
  let normalized: string
  if (decimalIndex >= 0 && numeric.length - decimalIndex - 1 <= 2) {
    normalized = numeric.slice(0, decimalIndex).replace(/[.,]/g, '') + '.' + numeric.slice(decimalIndex + 1)
  } else {
    normalized = numeric.replace(/[.,]/g, '')
  }
  const amount = Number(normalized)
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0
}

function parseGiftCount(headerText: string): number {
  const match = headerText.match(/(\d+)/)
  return match ? Number(match[1]) : 1
}

function cryptoRandomId(): string {
  return `innertube-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

function extractJsonAssignment(html: string, variableName: string): any {
  const patterns = [
    new RegExp(`window\\s*\\[\\s*["']${variableName}["']\\s*\\]\\s*=\\s*`),
    new RegExp(`var\\s+${variableName}\\s*=\\s*`),
    new RegExp(`${variableName}\\s*=\\s*`)
  ]

  for (const pattern of patterns) {
    const match = pattern.exec(html)
    if (!match) continue
    const start = match.index + match[0].length
    if (html[start] !== '{') continue
    const json = readBalancedJson(html, start)
    if (!json) continue
    try {
      return JSON.parse(json)
    } catch {
      continue
    }
  }
  return null
}

/** Reads a balanced {...} block starting at `start`, respecting string literals. */
function readBalancedJson(source: string, start: number): string | null {
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < source.length; i++) {
    const char = source[i]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }
    if (char === '"') {
      inString = true
    } else if (char === '{') {
      depth++
    } else if (char === '}') {
      depth--
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  return null
}

async function fetchText(url: string): Promise<string> {
  const response = await fetchWithTimeout(url, { headers: BROWSER_HEADERS })
  if (!response.ok) {
    throw new InnertubeUnavailableError(`YouTube page request failed (${response.status}) for ${url}`)
  }
  return response.text()
}

function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
}
