import {IconMessages, IconTrash} from '@tabler/icons-react'
import { useMemo, useRef } from 'react'
import type { Platform } from '../../../main/platforms/types'
import { useChatStore } from '../../stores/chat-store'

import { ChatFeed } from './components/ChatFeed'
import { AutoRelaySidebar } from './components/AutoRelaySidebar'
import { OutboundSidebar } from './components/OutboundSidebar'
import { useAICoHost } from '../../hooks/useAICoHost'
import { useChatLogic } from './hooks/useChatLogic'

export default function ChatPage() {
  useAICoHost()
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

  return (
    <div className="app-page">
      <header className="app-page-header">
        <div className="flex items-center gap-6">
          <div className="flex items-center justify-center">
            <IconMessages size={32} className="text-accent" />
          </div>
          <div>
            <h1>Unified Chat</h1>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 2xl:grid-cols-[1fr_400px] gap-16 h-[calc(100vh-280px)]">
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

        <div className="flex flex-col gap-16">
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
