import { Avatar } from '../../../components/ui/Avatar'
import { TikTokHeartIcon } from '../../../components/ui/TikTokHeartIcon'
import { PlatformLogo } from '../../../components/platforms/PlatformLogo'
import { type ChatMessage } from '../../../stores/chat-store'
import { platformBadgeColors } from '../constants'

interface ChatMessageItemProps {
  message: ChatMessage
  onRelay: (message: ChatMessage) => void
  onFeature: (message: ChatMessage) => void
}

export function ChatMessageItem({ message, onRelay, onFeature }: ChatMessageItemProps) {
  return (
    <article className="group flex items-start gap-3 px-5 py-3 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors relative overflow-hidden">
      <div className="relative shrink-0">
        <Avatar
          url={message.profilePictureUrl}
          name={message.displayName}
          size="md"
          className="transition-colors"
        />
        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-background border-2 border-background flex items-center justify-center">
          <PlatformLogo platform={message.platform} size={9} />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-[13px] font-semibold tracking-tight ${message.isModerator ? 'text-success' : 'text-white'}`}>
            {message.displayName}
          </span>
          <div className="flex items-center gap-1">
            {message.isModerator && <span className="text-[11px] font-medium bg-success/15 text-success px-1.5 py-0 rounded">Mod</span>}
            {message.isSubscriber && <span className="text-[11px] font-medium bg-accent/15 text-accent px-1.5 py-0 rounded">Sub</span>}
          </div>
          <span className="text-[11px] text-white/32 font-mono tabular-nums ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
            {message.timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </span>
        </div>
        <p className="text-[13px] text-white/70 leading-relaxed break-words pr-24">
          {message.message}
        </p>
      </div>
      <div className="absolute top-2.5 right-5 opacity-0 group-hover:opacity-100 flex items-center gap-1.5 transition-opacity">
        <button
          onClick={() => onFeature(message)}
          className="app-button !h-7 !px-2.5 !text-[12px]"
        >
          Feature
        </button>
        <button
          onClick={() => onRelay(message)}
          className="app-button !h-7 !px-2.5 !text-[12px]"
        >
          Relay
        </button>
      </div>
    </article>
  )
}
