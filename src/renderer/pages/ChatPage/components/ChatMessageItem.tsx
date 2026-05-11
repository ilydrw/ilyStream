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
    <article className="group flex items-start gap-4 px-8 py-5 border-b border-white/[0.03] hover:bg-white/[0.015] transition-all duration-200 relative overflow-hidden">
      <div className="relative shrink-0">
        <Avatar 
          url={message.profilePictureUrl} 
          name={message.displayName} 
          size="lg" 
          className="ring-2 ring-white/[0.05] group-hover:ring-accent/40 transition-all duration-300 shadow-xl"
        />
        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#0a0a0a] border-2 border-[#0a0a0a] flex items-center justify-center">
          <PlatformLogo platform={message.platform} size={10} />
        </div>
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center gap-3 mb-1.5">
          <div className="flex items-center gap-2.5">
            <span className={`text-[13px] font-black tracking-tight ${message.isModerator ? 'text-success' : 'text-white/95'}`}>
              {message.displayName}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {message.isModerator && <span className="text-[9px] font-black uppercase tracking-widest bg-success/20 text-success px-2 py-0.5 rounded-md border border-success/10">Mod</span>}
            {message.isSubscriber && <span className="text-[9px] font-black uppercase tracking-widest bg-accent/20 text-accent px-2 py-0.5 rounded-md border border-accent/10">Sub</span>}
          </div>
          <span className="text-[10px] text-white/15 font-mono ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
            {message.timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </span>
        </div>
        <p className="text-[13px] text-white/70 leading-relaxed break-words pr-28 font-medium">
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
