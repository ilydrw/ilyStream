export type TikTokShortcodeToken =
  | { type: 'text'; value: string }
  | { type: 'emoji'; value: string; shortcode: string }

const u = (...codepoints: string[]) =>
  String.fromCodePoint(...codepoints.map((codepoint) => Number.parseInt(codepoint, 16)))

export const TIKTOK_SHORTCODE_PAIRS: Array<[string, string]> = [
  ['smile', u('1f642')],
  ['happy', u('1f604')],
  ['angry', u('1f620')],
  ['cry', u('1f622')],
  ['embarrassed', u('1f633')],
  ['surprised', u('1f62e')],
  ['wronged', u('1f97a')],
  ['shout', u('1f624')],
  ['flushed', u('1f633')],
  ['yummy', u('1f60b')],
  ['complacent', u('1f60e')],
  ['drool', u('1f924')],
  ['scream', u('1f631')],
  ['weep', u('1f62d')],
  ['speechless', u('1f636')],
  ['funnyface', u('1f61c')],
  ['laughwithtears', u('1f602')],
  ['wicked', u('1f608')],
  ['facewithrollingeyes', u('1f644')],
  ['sulk', u('1f612')],
  ['thinking', u('1f914')],
  ['lovely', u('1f618')],
  ['greedy', u('1f911')],
  ['wow', u('1f62e')],
  ['joyful', u('1f601')],
  ['hehe', u('1f92d')],
  ['slap', u('1f635')],
  ['tears', u('1f62d')],
  ['stun', u('1f635')],
  ['cute', u('1f97a')],
  ['blink', u('1f609')],
  ['disdain', u('1f612')],
  ['astonish', u('1f632')],
  ['rage', u('1f621')],
  ['cool', u('1f60e')],
  ['excited', u('1f929')],
  ['proud', u('1f60f')],
  ['smileface', u('1f642')],
  ['evil', u('1f47f')],
  ['angel', u('1f607')],
  ['laugh', u('1f923')],
  ['pride', u('1f60f')],
  ['nap', u('1f634')],
  ['loveface', u('1f60d')],
  ['awkward', u('1f605')],
  ['shock', u('1f631')],
  ['love', u('1f60d')],
  ['hi', u('1f44b')],
  ['laugh cry', u('1f602')],
  ['laughcry', u('1f602')],
  ['laugh with tears', u('1f602')],
  ['cry laugh', u('1f602')],
  ['cry laughing', u('1f602')],
  ['rocky cool', u('1f60e')],
  ['rockycool', u('1f60e')],
  ['rocky love', u('1f60d')],
  ['rockylove', u('1f60d')],
  ['cool guy', u('1f60e')]
]

const TIKTOK_SHORTCODE_EMOJIS = TIKTOK_SHORTCODE_PAIRS.reduce<Record<string, string>>(
  (acc, [shortcode, emoji]) => {
    const normalized = normalizeTikTokShortcode(shortcode)
    acc[normalized] = emoji
    acc[normalized.replace(/\s+/g, '')] = emoji
    return acc
  },
  {}
)

const SHORTCODE_RE = /\[([^[\]\r\n]{1,48})\]/g

export function resolveTikTokShortcodeEmoji(shortcode: string): string | null {
  const normalized = normalizeTikTokShortcode(shortcode)
  if (!normalized) return null

  const compact = normalized.replace(/\s+/g, '')
  const direct = TIKTOK_SHORTCODE_EMOJIS[normalized] ?? TIKTOK_SHORTCODE_EMOJIS[compact]
  if (direct) return direct

  const withoutRockyPrefix = normalized.replace(/^rocky\s+/, '')
  if (withoutRockyPrefix !== normalized) {
    return (
      TIKTOK_SHORTCODE_EMOJIS[withoutRockyPrefix] ??
      TIKTOK_SHORTCODE_EMOJIS[withoutRockyPrefix.replace(/\s+/g, '')] ??
      null
    )
  }

  return null
}

export function tokenizeTikTokShortcodes(text: string): TikTokShortcodeToken[] {
  if (!text) return []

  const tokens: TikTokShortcodeToken[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  SHORTCODE_RE.lastIndex = 0
  while ((match = SHORTCODE_RE.exec(text)) !== null) {
    const emoji = resolveTikTokShortcodeEmoji(match[1])
    if (!emoji) continue

    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    }

    tokens.push({ type: 'emoji', value: emoji, shortcode: match[1].trim() })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex === 0) return [{ type: 'text', value: text }]
  if (lastIndex < text.length) tokens.push({ type: 'text', value: text.slice(lastIndex) })
  return tokens
}

function normalizeTikTokShortcode(shortcode: string): string {
  return shortcode
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}
