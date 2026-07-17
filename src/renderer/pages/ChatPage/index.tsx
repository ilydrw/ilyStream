import { IconChat } from '../../components/ui/icons'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Platform } from '../../../main/platforms/types'
import { useChatStore } from '../../stores/chat-store'
import { useConnectionStore } from '../../stores/connection-store'
import { useLiveInsightsStore } from '../../stores/live-insights-store'
import { PlatformLogo } from '../../components/platforms/PlatformLogo'
import { PageHeader } from '../../components/layout/PageHeader'

import { ChatFeed } from './components/ChatFeed'
import { AutoRelaySidebar } from './components/AutoRelaySidebar'
import { OutboundSidebar } from './components/OutboundSidebar'
import { LiveInsightsPanel } from './components/LiveInsightsPanel'
import { LiveViewersPanel } from './components/LiveViewersPanel'
import { useChatLogic } from './hooks/useChatLogic'

const CONN_PLATFORMS: Platform[] = ['tiktok', 'twitch', 'youtube', 'kick']
const PLATFORM_LABELS: Record<string, string> = {
  tiktok: 'TikTok',
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick'
}

function HeaderKpi({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="text-right">
      <div className={`text-[19px] font-extrabold leading-none tabular-nums ${accent ? 'text-accent' : 'text-white'}`}>
        {value.toLocaleString()}
      </div>
      <div className="mt-1 text-[9px] font-semibold leading-none text-white/35">{label}</div>
    </div>
  )
}

function ConnectionChip({ platform, status, count }: { platform: Platform; status?: string; count: number }) {
  const connected = status === 'connected'
  const connecting = status === 'connecting'
  const dotClass = connected ? 'bg-success' : connecting ? 'bg-amber-400' : 'bg-white/20'
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors ${connected ? 'border-white/[0.08] bg-white/[0.04]' : 'border-white/[0.04] bg-white/[0.015]'}`}
      title={`${PLATFORM_LABELS[platform]} — ${status ?? 'offline'} · ${count.toLocaleString()} messages`}
    >
      <PlatformLogo platform={platform} size={14} />
      <span className={`text-[11px] font-bold tabular-nums ${connected ? 'text-white/70' : 'text-white/30'}`}>
        {count.toLocaleString()}
      </span>
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass} ${connecting ? 'animate-pulse' : ''}`} />
    </div>
  )
}

export default function ChatPage() {
  const messages = useChatStore((s) => s.messages)
  const platformFilter = useChatStore((s) => s.platformFilter)
  const searchQuery = useChatStore((s) => s.searchQuery)
  const setPlatformFilter = useChatStore((s) => s.setPlatformFilter)
  const setSearchQuery = useChatStore((s) => s.setSearchQuery)

  const {
    capabilities,
    composerText,
    selectedTargets,
    relaySource,
    relaySettings,
    sendFeedback,
    isSending,
    handleRelay,
    handleFeatureMessage,
    updateRelaySetting,
    toggleTarget,
    handleSend,
    setComposerText,
    setRelaySource,
    filteredMessages,
    platformCounts
  } = useChatLogic()

  const composerRef = useRef<HTMLDivElement>(null)

  const statuses = useConnectionStore((s) => s.statuses)
  const viewerCounts = useConnectionStore((s) => s.viewerCounts)
  const recordViewerTotal = useLiveInsightsStore((s) => s.recordViewerTotal)

  // Keep the live KPIs (per-minute rate especially) ticking even while idle.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(timer)
  }, [])

  const totalMessages = messages.length
  const messageRateCutoff = now - 60_000
  const perMinute = messages.reduce((count, m) => (m.timestamp.getTime() >= messageRateCutoff ? count + 1 : count), 0)
  const watching = useMemo(
    () => Object.values(viewerCounts).reduce((sum, c) => sum + (c || 0), 0),
    [viewerCounts]
  )
  useEffect(() => {
    recordViewerTotal(watching)
  }, [recordViewerTotal, watching])

  return (
    <div className="app-page">
      <PageHeader
        title="Chat Hub"
        description="Every platform's chat, viewers, and replies in one place."
        icon={IconChat}
        actions={
          <>
          <div className="flex items-center gap-6">
            <HeaderKpi label="Messages" value={totalMessages} />
            <HeaderKpi label="Per min" value={perMinute} accent />
            <HeaderKpi label="Watching" value={watching} />
          </div>
          <span className="h-9 w-px bg-white/10" />
          <div className="flex items-center gap-1.5">
            {CONN_PLATFORMS.map((p) => (
              <ConnectionChip key={p} platform={p} status={statuses[p]} count={platformCounts[p] ?? 0} />
            ))}
          </div>
          </>
        }
      />

      <div className="grid min-h-0 grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_380px_340px]" style={{ height: 'calc(100vh - 188px)' }}>
        <ChatFeed
          messages={messages}
          filteredMessages={filteredMessages}
          platformFilter={platformFilter}
          searchQuery={searchQuery}
          platformCounts={platformCounts}
          onSetPlatformFilter={setPlatformFilter}
          onSetSearchQuery={setSearchQuery}
          onRelay={(msg) => {
            handleRelay(msg)
            composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          }}
          onFeature={handleFeatureMessage}
        />

        <div className="flex min-h-0 flex-col gap-5 overflow-hidden">
          <LiveInsightsPanel now={now} />
          <div className="min-h-0 flex-1">
            <LiveViewersPanel />
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto custom-scrollbar pr-1">
          <AutoRelaySidebar
            chatAutoRelayEnabled={relaySettings.chatAutoRelayEnabled}
            chatRelayTagMode={relaySettings.chatRelayTagMode}
            chatAutoRelayPlatforms={relaySettings.chatAutoRelayPlatforms}
            onUpdateRelaySetting={updateRelaySetting}
          />

          <div ref={composerRef}>
            <OutboundSidebar
              composerText={composerText}
              selectedTargets={selectedTargets}
              relaySource={relaySource}
              capabilities={capabilities}
              isSending={isSending}
              sendFeedback={sendFeedback}
              onComposerTextChange={setComposerText}
              onToggleTarget={toggleTarget}
              onSend={handleSend}
              onClearRelaySource={() => setRelaySource(null)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}


