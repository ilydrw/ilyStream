import { ArrowDown, MessageSquareMore, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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
  const [isAtBottom, setIsAtBottom] = useState(true)

  useEffect(() => {
    const sentinel = bottomRef.current
    const container = chatScrollRef.current
    if (!sentinel || !container) return

    const observer = new IntersectionObserver(
      ([entry]) => setIsAtBottom(entry?.isIntersecting ?? false),
      { root: container, threshold: 0 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [filteredMessages.length, isAtBottom])

  return (
    <section className="app-section-card glass !flex flex-col min-h-[calc(100vh-16rem)] min-w-0">
      <div className="app-section-head !flex-col !items-stretch gap-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-6 flex-wrap min-w-0">
            {platforms.map((platform) => {
              const active = (platform === 'all' && !platformFilter) || platform === platformFilter
              const count = platform === 'all' ? messages.length : (platformCounts[platform] ?? 0)

              return (
                <button
                  key={platform}
                  onClick={() => onSetPlatformFilter(platform === 'all' ? null : platform)}
                  className={`relative flex items-center gap-2 py-2 text-xs font-black tracking-widest transition-all ${
                    active ? 'text-white' : 'text-white/20 hover:text-white/40'
                  }`}
                >
                  {platform !== 'all' && <PlatformLogo platform={platform} size={12} />}
                  {platform.charAt(0).toUpperCase() + platform.slice(1)}
                  {count > 0 && <span className="text-[10px] opacity-40 ml-0.5">{count}</span>}
                  {active && <div className="absolute -bottom-4 left-0 right-0 h-0.5 bg-accent" />}
                </button>
              )
            })}
          </div>
          <div className="relative w-full sm:w-56 shrink-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
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

      <div ref={chatScrollRef} className="flex-1 relative overflow-y-auto custom-scrollbar">
        {filteredMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-white/10">
            <MessageSquareMore size={48} className="mb-4 opacity-20" />
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

        {!isAtBottom && (
          <button
            onClick={() => {
              setIsAtBottom(true)
              bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
            }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white shadow-2xl hover:scale-105 transition-all"
          >
            <span className="flex items-center gap-2">
              <ArrowDown size={14} />
              New Messages
            </span>
          </button>
        )}
      </div>
    </section>
  )
}
