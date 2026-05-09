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
    <article className="group flex items-start gap-4 px-8 py-4 border-white/[0.03] hover:bg-white/[0.015] transition-colors relative">
      <Avatar 
        url={message.profilePictureUrl} 
        name={message.displayName} 
        size="lg" 
        className="ring-accent/10 group-hover:ring-accent/30 transition-all"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold ${message.isModerator ? 'text-success' : 'text-white'}`}>
              {message.displayName}
            </span>
            {message.platform === 'tiktok' && message.isFanClub && (
              <TikTokHeartIcon size={14} className="drop-shadow-[0_0_8px_rgba(255,45,85,0.4)]" />
            )}
          </div>
          <div className="flex items-center gap-1">
            {message.isModerator && <span className="text-[10px] font-black uppercase tracking-tighter bg-success/10 text-success px-1.5 py-0.5 rounded">Moderator</span>}
            {message.isSubscriber && <span className="text-[10px] font-black uppercase tracking-tighter bg-accent/10 text-accent px-1.5 py-0.5 rounded">Subscriber</span>}
            <span className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-tighter border ${platformBadgeColors[message.platform]}`}>
              <PlatformLogo platform={message.platform} size={8} />
              {message.platform}
            </span>
          </div>
          <span className="text-xs text-white/20 font-mono ml-auto">
            {message.timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </span>
        </div>
        <p className="text-sm text-white/60 leading-relaxed break-words pr-24">
          {message.message}
        </p>
      </div>
      <div className="absolute top-4 right-8 opacity-0 group-hover:opacity-100 flex items-center gap-2 transition-all">
        <button
          onClick={() => onFeature(message)}
          className="app-button !h-9 !px-4 text-xs font-black uppercase tracking-widest bg-accent/10 hover:bg-accent/20 border-accent/20"
        >
          Feature
        </button>
        <button
          onClick={() => onRelay(message)}
          className="app-button !h-9 !px-4 text-xs font-black uppercase tracking-widest"
        >
          Relay
        </button>
      </div>
    </article>
  )
}
