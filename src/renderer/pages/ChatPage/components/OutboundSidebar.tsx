import { Send, Trash2 } from 'lucide-react'
import { PlatformLogo } from '../../../components/platforms/PlatformLogo'
import { PLATFORM_LABELS } from '../../../../shared/chat-relay'
import type { Platform, PlatformChatCapability } from '../../../../main/platforms/types'
import { type ChatMessage } from '../../../stores/chat-store'

interface OutboundSidebarProps {
  composerText: string
  selectedTargets: Platform[]
  relaySource: ChatMessage | null
  capabilities: Record<Platform, PlatformChatCapability>
  isSending: boolean
  sendFeedback: { tone: 'success' | 'warning' | 'error'; text: string } | null
  onComposerTextChange: (text: string) => void
  onToggleTarget: (platform: Platform) => void
  onSend: () => void
  onClearRelaySource: () => void
}

export function OutboundSidebar({
  composerText,
  selectedTargets,
  relaySource,
  capabilities,
  isSending,
  sendFeedback,
  onComposerTextChange,
  onToggleTarget,
  onSend,
  onClearRelaySource
}: OutboundSidebarProps) {
  return (
    <section className="app-section-card glass">
      <div className="app-section-head">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center text-accent">
            <Send size={32} />
          </div>
          <div>
            <h2>Outbound</h2>
            <p>Compose messages.</p>
          </div>
        </div>
      </div>
      <div className="app-section-content">
        {relaySource && (
          <div className="p-3 rounded-xl bg-accent/5 border border-accent/10 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs text-accent/60 font-bold tracking-widest mb-1">Relaying Message</p>
              <p className="text-sm text-white/80 truncate">@{relaySource.displayName}: {relaySource.message}</p>
            </div>
            <button onClick={onClearRelaySource} className="text-accent hover:text-white transition-colors">
              <Trash2 size={14} />
            </button>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <label className="text-xs font-black tracking-widest text-white/50">Target Channels</label>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(capabilities) as Platform[]).map((p) => {
              const cap = capabilities[p]
              const selected = selectedTargets.includes(p)
              return (
                <button
                  key={`target-${p}`}
                  onClick={() => onToggleTarget(p)}
                  disabled={!cap.canSend}
                  className={`flex items-center gap-2 h-12 px-4 rounded-xl border text-sm font-bold transition-all ${
                    selected ? 'bg-accent/10 border-accent/30 text-accent' : 'bg-white/[0.03] border-white/5 text-white/60 hover:border-white/10 hover:text-white/90'
                  } disabled:opacity-30 disabled:cursor-not-allowed`}
                >
                  <PlatformLogo platform={p} size={14} />
                  {PLATFORM_LABELS[p]}
                </button>
              )
            })}
          </div>
        </div>

        <div className="relative">
          <textarea
            value={composerText}
            onChange={(e) => onComposerTextChange(e.target.value)}
            rows={4}
            placeholder="Type a message to send across platforms..."
            className="app-textarea !text-sm !resize-none"
          />
        </div>

        <button
          onClick={onSend}
          disabled={isSending || !composerText.trim() || selectedTargets.length === 0}
          className="app-button-primary !h-12 w-full font-bold"
        >
          {isSending ? 'Transmitting...' : 'Send Message'}
          <Send size={16} className="ml-2" />
        </button>

        {sendFeedback && (
          <div className={`p-4 rounded-xl text-xs font-bold text-center border ${
            sendFeedback.tone === 'success' ? 'bg-success/10 border-success/20 text-success' : 
            sendFeedback.tone === 'warning' ? 'bg-warning/10 border-warning/20 text-warning' : 
            'bg-danger/10 border-danger/20 text-danger'
          }`}>
            {sendFeedback.text}
          </div>
        )}
      </div>
    </section>
  )
}
