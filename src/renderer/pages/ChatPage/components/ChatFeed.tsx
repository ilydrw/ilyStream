import { IconArrowDown, IconMessage2 } from '@tabler/icons-react'
import { IconSearch } from '../../../components/ui/icons'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PlatformLogo } from '../../../components/platforms/PlatformLogo'
import { type ChatMessage } from '../../../stores/chat-store'
import { platforms } from '../constants'
import { ChatMessageItem } from './ChatMessageItem'

interface ChatFeedProps {
  messages: ChatMessage[]
  filteredMessages: ChatMessage[]
  platformFilter: string | null
  searchQuery: string
  platformCounts: Record<string, number>
  onSetPlatformFilter: (p: string | null) => void
  onSetSearchQuery: (q: string) => void
  onRelay: (m: ChatMessage) => void
  onFeature: (m: ChatMessage) => void
}

export function ChatFeed({
  messages,
  filteredMessages,
  platformFilter,
  searchQuery,
  platformCounts,
  onSetPlatformFilter,
  onSetSearchQuery,
  onRelay,
  onFeature
}: ChatFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const lastLengthRef = useRef(0)
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true)
  const [newMessageCount, setNewMessageCount] = useState(0)

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' })
  }, [])

  const updatePinnedState = useCallback(() => {
    const container = chatScrollRef.current
    if (!container) return
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    const pinned = distanceFromBottom < 72
    setIsPinnedToBottom(pinned)
    if (pinned) setNewMessageCount(0)
  }, [])

  useEffect(() => {
    const previousLength = lastLengthRef.current
    const nextLength = filteredMessages.length
    lastLengthRef.current = nextLength

    if (isPinnedToBottom || previousLength === 0) {
      requestAnimationFrame(() => scrollToBottom(previousLength === 0 ? 'auto' : 'smooth'))
      return
    }

    if (nextLength > previousLength) {
      setNewMessageCount((count) => count + nextLength - previousLength)
    }
  }, [filteredMessages.length, isPinnedToBottom, scrollToBottom])

  useEffect(() => {
    lastLengthRef.current = filteredMessages.length
    setNewMessageCount(0)
    setIsPinnedToBottom(true)
    requestAnimationFrame(() => scrollToBottom('auto'))
  }, [platformFilter, searchQuery, scrollToBottom])

  return (
    <section className="app-section-card glass !flex min-h-0 min-w-0 flex-col overflow-hidden !p-0">
      <div className="border-b border-white/[0.05] px-5 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-6 flex-wrap min-w-0">
            {platforms.map((platform) => {
              const active = (platform === 'all' && !platformFilter) || platform === platformFilter
              const count = platform === 'all' ? messages.length : (platformCounts[platform] ?? 0)

              return (
                <button
                  key={platform}
                  onClick={() => onSetPlatformFilter(platform === 'all' ? null : platform)}
                  className={`relative flex items-center gap-2 py-2 text-xs font-semibold tracking-tight transition-all ${ active ? 'text-white' : 'text-white/35 hover:text-white/65' }`}
                >
                  {platform !== 'all' && <PlatformLogo platform={platform} size={12} />}
                  {platform.charAt(0).toUpperCase() + platform.slice(1)}
                  <span className="text-[10px] opacity-45 ml-0.5 tabular-nums">{count}</span>
                  {active && <div className="absolute -bottom-4 left-0 right-0 h-px bg-accent" />}
                </button>
              )
            })}
          </div>
          <div className="relative w-full sm:w-56 shrink-0">
            <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
            <input
              type="text"
              placeholder="Search messages..."
              value={searchQuery}
              onChange={(e) => onSetSearchQuery(e.target.value)}
              className="app-input !h-10 !pl-9 !text-sm w-full"
            />
          </div>
        </div>
      </div>

      <div
        ref={chatScrollRef}
        onScroll={updatePinnedState}
        className="flex-1 relative overflow-y-auto custom-scrollbar bg-black/[0.08]"
      >
        {filteredMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-white/10">
            <IconMessage2 size={48} className="mb-4 opacity-20" />
            <p className="text-sm font-medium">No messages found in this view.</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {filteredMessages.map((message) => (
              <ChatMessageItem 
                key={message.id} 
                message={message} 
                onRelay={onRelay} 
                onFeature={onFeature}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        )}

        {!isPinnedToBottom && (
          <button
            onClick={() => {
              setIsPinnedToBottom(true)
              setNewMessageCount(0)
              scrollToBottom('smooth')
            }}
            className="sticky bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-accent px-4 py-2 text-xs font-semibold tracking-tight text-black shadow-2xl transition-all hover:bg-accent-hover"
          >
            <span className="flex items-center gap-2">
              <IconArrowDown size={14} />
              {newMessageCount > 0 ? `${newMessageCount} new` : 'Jump to newest'}
            </span>
          </button>
        )}
      </div>
    </section>
  )
}
