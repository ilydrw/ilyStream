import type { ReactNode } from 'react'
import { Avatar } from '../../../components/ui/Avatar'
import { PlatformLogo } from '../../../components/platforms/PlatformLogo'
import { OfficialBadge } from '../../../components/badges/OfficialBadge'
import { type ChatMessage } from '../../../stores/chat-store'
import { platformNames } from '../../../lib/audience-labels'
import { tokenizeTikTokShortcodes } from '../../../lib/tiktok-shortcode-emojis'
import { formatEmoteFallback } from './chat-message-format'

type RoleBadge = {
  key: string
  icon?: ReactNode
  title: string
  imageUrl?: string
}

interface ChatMessageItemProps {
  message: ChatMessage
  onRelay: (message: ChatMessage) => void
  onFeature: (message: ChatMessage) => void
}

interface EventStyle {
  glyph: string
}

/** Match the compact event glyphs used by the DeskThing Companion feed. */
const EVENT_STYLES: Record<string, EventStyle> = {
  gift: { glyph: '🎁' },
  subscription: { glyph: '⭐' },
  follow: { glyph: '➕' },
  raid: { glyph: '🚀' },
  share: { glyph: '🔁' }
}

type RawBadge = NonNullable<ChatMessage['badges']>[number]

function badgeLabel(badge: RawBadge): string {
  return `${badge.id || ''} ${badge.name || ''}`.trim().toLowerCase()
}

function findRawBadge(message: ChatMessage, matcher: (label: string) => boolean): RawBadge | undefined {
  return (message.badges || []).find((badge) => matcher(badgeLabel(badge)))
}

function isSuperFanLabel(label: string): boolean {
  return label.includes('super fan') || label.includes('superfan')
}

function isTikTokFanClubLabel(label: string): boolean {
  return label.includes('fan club') || label.includes('fanclub') || label.includes('subscriber')
}

function isTwitchSubLabel(label: string): boolean {
  return label.includes('subscriber')
}

function isModeratorLabel(label: string): boolean {
  return label === 'mod' || label.includes(' moderator') || label.includes('moderator ') || label.includes('moderator')
}

function getRoleBadges(message: ChatMessage): RoleBadge[] {
  const badges: RoleBadge[] = []

  if (message.isModerator) {
    const rawModerator = findRawBadge(message, isModeratorLabel)
    badges.push({
      key: 'mod',
      icon: <OfficialBadge platform={message.platform} role="mod" size={16} />,
      title: `${platformNames[message.platform]} moderator badge`,
      imageUrl: rawModerator?.imageUrl
    })
  }

  if (message.platform === 'tiktok') {
    const rawSuperFan = findRawBadge(message, isSuperFanLabel)
    const rawFanClub = findRawBadge(message, isTikTokFanClubLabel)
    const isTikTokSuperFan = Boolean(message.isSuperFan || rawSuperFan)
    const isTikTokFanClub = Boolean(isTikTokSuperFan || message.isFanClub || message.isSubscriber || rawFanClub)

    if (isTikTokFanClub) {
      badges.push({
        key: 'tiktok-fan-club',
        icon: <OfficialBadge platform="tiktok" role="member" size={16} />,
        title: 'TikTok Fan Club badge',
        imageUrl: rawFanClub?.imageUrl
      })
    }

    if (isTikTokSuperFan) {
      badges.push({
        key: 'tiktok-superfan',
        icon: <OfficialBadge platform="tiktok" role="superfan" size={16} />,
        title: 'TikTok Super Fan badge',
        imageUrl: rawSuperFan?.imageUrl
      })
    }
  }

  if (message.platform === 'twitch') {
    const rawSub = findRawBadge(message, isTwitchSubLabel)
    if (message.isSubscriber || rawSub) {
      badges.push({
        key: 'twitch-sub',
        icon: <OfficialBadge platform="twitch" role="member" size={16} />,
        title: 'Twitch Sub badge',
        imageUrl: rawSub?.imageUrl
      })
    }
  }

  if (message.platform === 'youtube') {
    const rawSuperFan = findRawBadge(message, isSuperFanLabel)
    if (rawSuperFan) {
      badges.push({
        key: 'youtube-superfan',
        icon: <OfficialBadge platform="youtube" role="superfan" size={16} />,
        title: 'YouTube Super Fan badge',
        imageUrl: rawSuperFan.imageUrl
      })
    }
  }

  return badges
}

function RoleBadgeChip({ badge }: { badge: RoleBadge }) {
  return (
    <span
      title={badge.title}
      aria-label={badge.title}
      className="inline-flex shrink-0 items-center justify-center leading-none"
    >
      {badge.imageUrl ? (
        <img src={badge.imageUrl} alt="" className="block h-4 w-4 object-contain" />
      ) : (
        badge.icon
      )}
    </span>
  )
}

const PLATFORM_ACCENT: Record<string, string> = {
  tiktok: '#fe2c55',
  twitch: '#9146ff',
  youtube: '#ff3b3b',
  kick: '#53fc18'
}

const PLATFORM_BADGE: Record<string, string> = {
  tiktok: 'TT',
  twitch: 'T',
  youtube: 'YT',
  kick: 'K'
}

function renderTextSegment(
  text: string,
  platform: ChatMessage['platform'],
  keyPrefix: string
): ReactNode[] {
  if (platform !== 'tiktok') return text ? [text] : []

  return tokenizeTikTokShortcodes(text).map((token, idx) => {
    if (token.type === 'text') return token.value

    return (
      <span
        key={`${keyPrefix}-tiktok-shortcode-${idx}`}
        title={`[${token.shortcode}]`}
        aria-label={token.shortcode}
        className="mx-0.5 inline-block align-[-0.12em] text-[1.18em] leading-none"
      >
        {token.value}
      </span>
    )
  })
}

function appendTextSegment(
  elements: ReactNode[],
  text: string,
  platform: ChatMessage['platform'],
  keyPrefix: string
) {
  elements.push(...renderTextSegment(text, platform, keyPrefix))
}

function renderMessageContent(
  messageText: string,
  platform: ChatMessage['platform'],
  emotes?: ChatMessage['emotes']
): ReactNode | ReactNode[] {
  if (!emotes || emotes.length === 0) {
    return renderTextSegment(messageText, platform, 'message')
  }

  const sortedEmotes = [...emotes].sort((a, b) => a.startIndex - b.startIndex)
  const elements: ReactNode[] = []
  let lastIndex = 0

  sortedEmotes.forEach((emote, idx) => {
    if (emote.startIndex >= lastIndex) {
      if (emote.startIndex > lastIndex) {
        appendTextSegment(
          elements,
          messageText.substring(lastIndex, emote.startIndex),
          platform,
          `text-${idx}`
        )
      }

      const fallbackLabel = formatEmoteFallback(emote.name, platform)
      if (emote.imageUrl) {
        elements.push(
          <img
            key={`${emote.id}-${idx}`}
            src={emote.imageUrl}
            alt={emote.name}
            title={emote.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="mx-0.5 -my-1 inline-block h-6 max-h-6 object-contain align-middle"
            onError={(e) => {
              e.currentTarget.replaceWith(document.createTextNode(fallbackLabel))
            }}
          />
        )
      } else {
        appendTextSegment(elements, fallbackLabel, platform, `emote-fallback-${idx}`)
      }

      lastIndex = emote.endIndex + 1
    }
  })

  if (lastIndex < messageText.length) {
    appendTextSegment(elements, messageText.substring(lastIndex), platform, 'text-end')
  }

  return elements
}

export function ChatMessageItem({ message, onRelay, onFeature }: ChatMessageItemProps) {
  const kind = message.kind ?? 'chat'
  const isChat = kind === 'chat'
  const eventStyle = isChat ? undefined : EVENT_STYLES[kind]
  const roleBadges = getRoleBadges(message)
  const accent = PLATFORM_ACCENT[message.platform] ?? 'rgba(255,255,255,0.65)'
  const timestamp = message.timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  return (
    <article
      className={`chat-hub-message-card group relative flex min-w-0 shrink-0 items-start gap-2.5 overflow-hidden rounded-xl border transition-colors ${
        isChat ? '' : 'chat-hub-message-card--event'
      }`}
      title={`${platformNames[message.platform]} · @${message.username} · ${timestamp}`}
    >
      <span
        className="absolute bottom-2.5 left-0 top-2.5 w-1 rounded-r-full opacity-70 transition-opacity group-hover:opacity-100"
        style={{ backgroundColor: accent }}
        aria-hidden
      />

      <div className="relative mt-0.5 h-10 w-10 shrink-0 rounded-full" style={{ boxShadow: `0 0 0 1px ${accent}66` }}>
        <Avatar
          url={message.profilePictureUrl}
          name={message.displayName}
          size="lg"
          className="!h-10 !w-10 !border-white/15 !bg-white/[0.06] !text-xs"
        />
      </div>

      <div className="min-w-0 flex-1 break-words pr-16">
        <div className="flex min-w-0 items-center gap-2 pr-8 leading-none">
          <span
            className="inline-flex h-5 min-w-[26px] shrink-0 items-center justify-center rounded-md border px-1 font-mono text-[8px] font-extrabold"
            style={{ borderColor: `${accent}88`, color: accent, backgroundColor: `${accent}12` }}
            aria-label={platformNames[message.platform]}
            title={platformNames[message.platform]}
          >
            {PLATFORM_BADGE[message.platform] ?? <PlatformLogo platform={message.platform} size={10} />}
          </span>
          <span className="truncate text-[14px] font-extrabold tracking-[-0.01em]" style={{ color: accent }}>
            {message.displayName}
          </span>
          {roleBadges.map((badge) => (
            <RoleBadgeChip key={badge.key} badge={badge} />
          ))}
        </div>

        <div className={`mt-1 text-[15px] leading-[1.35] tracking-[-0.01em] ${isChat ? 'font-semibold text-white/90' : 'font-semibold text-white/75'}`}>
          {eventStyle && <span className="mr-2" aria-hidden>{eventStyle.glyph}</span>}
          {isChat ? renderMessageContent(message.message, message.platform, message.emotes) : message.message}
          {message.meta && <span className="ml-2 font-extrabold tabular-nums text-warning">{message.meta}</span>}
        </div>
      </div>

      <time
        dateTime={message.timestamp.toISOString()}
        className="absolute right-4 top-3 text-[9px] font-bold tabular-nums text-white/30 transition-opacity group-hover:opacity-0 group-focus-within:opacity-0"
      >
        {timestamp}
      </time>

      {isChat && (
        <div className="chat-hub-message-actions absolute right-3 top-2 z-10 flex items-center gap-0.5 rounded-lg border p-0.5 opacity-0 shadow-xl backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            onClick={() => onFeature(message)}
            className="rounded px-2 py-1 text-[10px] font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            Feature
          </button>
          <button
            onClick={() => onRelay(message)}
            className="rounded px-2 py-1 text-[10px] font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            Relay
          </button>
        </div>
      )}
    </article>
  )
}
