import type { ReactNode } from 'react'
import { Avatar } from '../../../components/ui/Avatar'
import { PlatformLogo } from '../../../components/platforms/PlatformLogo'
import { OfficialBadge } from '../../../components/badges/OfficialBadge'
import { type ChatMessage } from '../../../stores/chat-store'
import { platformNames } from '../../../lib/audience-labels'
import { tokenizeTikTokShortcodes } from '../../../lib/tiktok-shortcode-emojis'

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

function formatEmoteFallback(name: string): string {
  const label = name.replace(/^:+|:+$/g, '')
  return label ? `:${label}:` : ':emote:'
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

      const fallbackLabel = formatEmoteFallback(emote.name)
      if (emote.imageUrl) {
        elements.push(
          <img
            key={`${emote.id}-${idx}`}
            src={emote.imageUrl}
            alt={emote.name}
            title={emote.name}
            className="mx-0.5 inline-block h-6 max-h-6 object-contain align-middle"
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
  const roleBadges = getRoleBadges(message)
  const accent = PLATFORM_ACCENT[message.platform] ?? 'rgba(255,255,255,0.35)'

  return (
    <article className="group relative flex items-start gap-3 border-b border-white/[0.06] px-5 py-3.5 transition-colors hover:bg-white/[0.03]">
      {/* Platform-accent rail, revealed on hover */}
      <span
        className="pointer-events-none absolute inset-y-2 left-0 w-[2px] rounded-full opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        style={{ background: accent }}
      />

      <div className="relative shrink-0">
        <Avatar url={message.profilePictureUrl} name={message.displayName} size="md" />
        <span
          className="absolute -bottom-1 -right-1 grid h-[17px] w-[17px] place-items-center rounded-full"
          style={{ background: '#0c0d12' }}
        >
          <PlatformLogo platform={message.platform} size={10} />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-[13.5px] font-bold tracking-tight text-white">
            {message.displayName}
          </span>
          {roleBadges.map((badge) => (
            <RoleBadgeChip key={badge.key} badge={badge} />
          ))}
          <span className="truncate text-[11px] font-medium text-white/30">@{message.username}</span>
          <span className="ml-auto shrink-0 pl-2 font-mono text-[10px] tabular-nums text-white/25 transition-opacity group-hover:opacity-0">
            {message.timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </span>
        </div>
        <p className="mt-1 break-words text-[14px] leading-[1.5] text-white/85">
          {renderMessageContent(message.message, message.platform, message.emotes)}
        </p>
      </div>

      {/* Floating action toolbar on hover */}
      <div className="absolute right-4 top-2.5 hidden items-center gap-0.5 rounded-lg border border-white/10 bg-[#15171c]/95 p-1 shadow-xl backdrop-blur-sm group-hover:flex">
        <button
          onClick={() => onFeature(message)}
          className="rounded-md px-2.5 py-1 text-[11px] font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          Feature
        </button>
        <button
          onClick={() => onRelay(message)}
          className="rounded-md px-2.5 py-1 text-[11px] font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          Relay
        </button>
      </div>
    </article>
  )
}
