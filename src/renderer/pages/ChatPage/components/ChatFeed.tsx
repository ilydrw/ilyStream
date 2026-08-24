import { IconSearch } from '../../../components/ui/icons'
import { IconArrowDown, IconArrowUp, IconArrowsVertical } from '@tabler/icons-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PlatformLogo } from '../../../components/platforms/PlatformLogo'
import { type ChatKindFilter, type ChatMessage } from '../../../stores/chat-store'
import { PLATFORM_LABELS } from '../../../../shared/chat-relay'
import type { Platform } from '../../../../main/platforms/types'
import { platforms } from '../constants'
import { ChatMessageItem } from './ChatMessageItem'
import { countAppendedChatMessages, getChatScrollState } from './chat-scroll'

const KIND_FILTERS: Array<{ value: ChatKindFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'chat', label: 'Chat' },
  { value: 'events', label: 'Events' }
]

interface ChatFeedProps {
  bufferedCount: number
  filteredMessages: ChatMessage[]
  platformFilter: string | null
  kindFilter: ChatKindFilter
  searchQuery: string
  platformCounts: Record<string, number>
  onSetPlatformFilter: (p: string | null) => void
  onSetKindFilter: (f: ChatKindFilter) => void
  onSetSearchQuery: (q: string) => void
  onRelay: (m: ChatMessage) => void
  onFeature: (m: ChatMessage) => void
}

export function ChatFeed({
  bufferedCount,
  filteredMessages,
  platformFilter,
  kindFilter,
  searchQuery,
  platformCounts,
  onSetPlatformFilter,
  onSetKindFilter,
  onSetSearchQuery,
  onRelay,
  onFeature
}: ChatFeedProps) {
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const lastLengthRef = useRef(0)
  const lastTailIdRef = useRef<string | null>(null)
  const scrollFrameRef = useRef<number | null>(null)
  const forceScrollRef = useRef(false)
  const pinnedRef = useRef(true)
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true)
  const [atTop, setAtTop] = useState(false)
  const [scrollPercent, setScrollPercent] = useState(100)
  const [newMessageCount, setNewMessageCount] = useState(0)

  const scheduleScrollToBottom = useCallback((force = false) => {
    if (!force && !pinnedRef.current) return

    forceScrollRef.current = forceScrollRef.current || force
    if (scrollFrameRef.current !== null) return

    scrollFrameRef.current = requestAnimationFrame(() => {
      const shouldScroll = forceScrollRef.current || pinnedRef.current
      scrollFrameRef.current = null
      forceScrollRef.current = false

      const container = chatScrollRef.current
      if (container && shouldScroll) {
        container.scrollTop = container.scrollHeight
      }
    })
  }, [])

  const updatePinnedState = useCallback(() => {
    const container = chatScrollRef.current
    if (!container) return
    const state = getChatScrollState(container)
    pinnedRef.current = state.isPinnedToBottom
    setIsPinnedToBottom(state.isPinnedToBottom)
    setAtTop(state.atTop)
    setScrollPercent(state.scrollPercent)
    if (state.isPinnedToBottom) setNewMessageCount(0)
  }, [])

  useEffect(() => {
    const previousLength = lastLengthRef.current
    const previousTailId = lastTailIdRef.current
    const nextLength = filteredMessages.length
    const nextTailId = filteredMessages.at(-1)?.id ?? null
    const appendedCount = countAppendedChatMessages(previousTailId, previousLength, filteredMessages)
    lastLengthRef.current = nextLength
    lastTailIdRef.current = nextTailId

    const feedChanged = previousLength !== nextLength || previousTailId !== nextTailId
    if (!feedChanged) return

    if (pinnedRef.current || previousLength === 0) {
      scheduleScrollToBottom(previousLength === 0)
      return
    }

    if (appendedCount > 0) {
      setNewMessageCount((count) => count + appendedCount)
    }
  }, [filteredMessages, scheduleScrollToBottom])

  useEffect(() => {
    lastLengthRef.current = filteredMessages.length
    setNewMessageCount(0)
    pinnedRef.current = true
    setIsPinnedToBottom(true)
    scheduleScrollToBottom(true)
  }, [platformFilter, kindFilter, searchQuery, scheduleScrollToBottom])

  useEffect(() => {
    const container = chatScrollRef.current
    if (!container) return

    const handleResize = () => scheduleScrollToBottom()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(handleResize)
    observer?.observe(container)
    window.addEventListener('resize', handleResize, { passive: true })

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', handleResize)
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current)
        scrollFrameRef.current = null
      }
    }
  }, [scheduleScrollToBottom])

  const allCount = Object.values(platformCounts).reduce((sum, count) => sum + count, 0)
  const historyLabel = isPinnedToBottom ? 'LIVE' : atTop ? 'OLDEST' : `${scrollPercent}%`
  const emptyMessage =
    bufferedCount === 0
      ? 'Waiting for audience messages and events.'
      : kindFilter === 'events'
        ? 'No stream events in the recent history.'
        : 'Nothing matches this view.'

  const scrollToOldest = () => {
    const container = chatScrollRef.current
    if (!container) return
    pinnedRef.current = false
    setIsPinnedToBottom(false)
    container.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const scrollToLive = () => {
    pinnedRef.current = true
    setIsPinnedToBottom(true)
    setNewMessageCount(0)
    scheduleScrollToBottom(true)
  }

  return (
    <section className="chat-hub-feed app-section-card glass !flex min-h-[520px] min-w-0 flex-col overflow-hidden !p-0 2xl:min-h-0">
      {/* DeskThing-style toolbar: title + counts, kind filters, live position */}
      <div className="chat-hub-feed__toolbar flex items-center justify-between gap-4 border-b border-white/[0.08] px-4 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="truncate text-[13px] font-bold tracking-tight text-white">Unified chat</div>
          <div className="truncate text-[10px] font-semibold text-white/35">
            {filteredMessages.length.toLocaleString()} shown · {bufferedCount.toLocaleString()} buffered
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {KIND_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => onSetKindFilter(value)}
              className={`rounded-lg border px-4 py-2 text-[11px] font-bold tracking-tight transition-colors ${
                kindFilter === value
                  ? 'chat-hub-filter--active text-white'
                  : 'border-transparent text-white/45 hover:bg-white/[0.035] hover:text-white/80'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className="hidden h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-black/10 px-2.5 font-mono text-[9px] font-bold text-white/45 xl:inline-flex"
            title="Mouse-wheel history navigation"
          >
            <IconArrowsVertical size={12} className="text-accent" />
            WHEEL
          </span>
          <button
            onClick={scrollToLive}
            className={`inline-flex h-8 min-w-[58px] items-center justify-center rounded-lg border px-2.5 font-mono text-[9px] font-extrabold uppercase tabular-nums transition-colors ${
              isPinnedToBottom
                ? 'border-success/45 bg-success/[0.06] text-success'
                : 'border-white/10 bg-white/[0.03] text-white/45 hover:text-white/75'
            }`}
            title="Jump to the newest message"
          >
            {historyLabel}
          </button>
          <button
            onClick={scrollToOldest}
            disabled={atTop}
            className="chat-hub-history-button"
            title="Jump to oldest"
            aria-label="Jump to oldest message"
          >
            <IconArrowUp size={15} />
          </button>
          <button
            onClick={scrollToLive}
            disabled={isPinnedToBottom}
            className="chat-hub-history-button"
            title="Jump to newest"
            aria-label="Jump to newest message"
          >
            <IconArrowDown size={15} />
          </button>
        </div>
      </div>

      <div className="chat-hub-feed__filters border-b border-white/[0.08] px-4 py-2">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-6 flex-wrap min-w-0">
            {platforms.map((platform) => {
              const active = (platform === 'all' && !platformFilter) || platform === platformFilter
              const count = platform === 'all' ? allCount : (platformCounts[platform] ?? 0)

              return (
                <button
                  key={platform}
                  onClick={() => onSetPlatformFilter(platform === 'all' ? null : platform)}
                  className={`relative flex items-center gap-2 py-2 text-xs font-semibold tracking-tight transition-all ${ active ? 'text-white' : 'text-white/35 hover:text-white/65' }`}
                >
                  {platform !== 'all' && <PlatformLogo platform={platform} size={12} />}
                  {platform === 'all' ? 'All' : PLATFORM_LABELS[platform as Platform] ?? platform.charAt(0).toUpperCase() + platform.slice(1)}
                  <span className="text-[10px] opacity-45 ml-0.5 tabular-nums">{count}</span>
                  {active && <div className="absolute -bottom-2 left-0 right-0 h-px bg-accent" />}
                </button>
              )
            })}
          </div>
          <div className="relative w-full sm:w-56 shrink-0">
            <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
            <input
              type="text"
              placeholder="Search messages & events..."
              value={searchQuery}
              onChange={(e) => onSetSearchQuery(e.target.value)}
              className="app-input !h-8 !pl-9 !text-xs w-full"
            />
          </div>
        </div>
      </div>

      <div
        ref={chatScrollRef}
        onScroll={updatePinnedState}
        className="chat-hub-feed__viewport relative flex flex-1 flex-col overflow-y-scroll custom-scrollbar"
        style={{ overscrollBehaviorY: 'contain', touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
      >
        {filteredMessages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
            <span className="select-none pb-2 text-[34px] leading-none text-accent/40">◌</span>
            <p className="text-sm font-semibold text-white/50">{emptyMessage}</p>
            <p className="text-[11px] font-medium text-white/25">
              Chat and events from every connected platform land here.
            </p>
          </div>
        ) : (
          // The auto margin pins a short history to the bottom while keeping
          // scrollback reachable (justify-end would strand overflow above the
          // scroll container). It needs the bang: base.css's unlayered
          // `* { margin: 0 }` outranks Tailwind's layered margin utilities.
          <div className="flex shrink-0 flex-col gap-2 !mt-auto px-3 py-3">
            {filteredMessages.map((message) => (
              <ChatMessageItem
                key={message.id}
                message={message}
                onRelay={onRelay}
                onFeature={onFeature}
              />
            ))}
          </div>
        )}

        {!isPinnedToBottom && (
          <div className="pointer-events-none sticky bottom-4 z-20 flex justify-end pr-4">
            <button
              onClick={() => {
                scrollToLive()
              }}
              className="chat-hub-live-button pointer-events-auto flex items-center gap-2 rounded-lg border px-4 py-2 shadow-xl backdrop-blur-sm transition-colors"
            >
              <span className="text-[10px] font-bold text-white/50">
                {newMessageCount > 0 ? `${newMessageCount} new` : 'Back to'}
              </span>
              <span className="text-[11px] font-extrabold tracking-wide text-accent">LIVE ↓</span>
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
