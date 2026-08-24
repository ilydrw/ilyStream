// src/renderer/pages/ChatPage/hooks/useChatLogic.ts
import { useEffect, useMemo, useState } from 'react';
import type { Platform, PlatformChatCapability, PlatformChatSendResult } from '../../../../main/platforms/types';
import { DEFAULT_APP_SETTINGS, resolveAppSettings, type AppSettings } from '../../../../shared/app-settings';
import { buildRelayText, getRelayTargets, getSendablePlatforms, summarizeSendResults } from '../../../lib/chat-relay';
import { defaultCapabilities } from '../constants';
import { pickRelaySettings } from '../utils';
import { matchesKindFilter, useChatStore, type ChatMessage } from '../../../stores/chat-store';
import { useConnectionStore } from '../../../stores/connection-store';


/**
 * Centralised logic for the ChatPage component.
 * This hook isolates state handling, side‑effects and helper functions
 * so the component can focus on rendering only.
 */
export function useChatLogic() {
  // Basic chat store values
  const messages = useChatStore((s) => s.messages);
  const platformFilter = useChatStore((s) => s.platformFilter);
  const kindFilter = useChatStore((s) => s.kindFilter);
  const searchQuery = useChatStore((s) => s.searchQuery);
  const setPlatformFilter = useChatStore((s) => s.setPlatformFilter);
  const setKindFilter = useChatStore((s) => s.setKindFilter);
  const setSearchQuery = useChatStore((s) => s.setSearchQuery);

  // Feed items surviving the All/Chat/Events filter; platform tabs count within this view.
  const kindFilteredMessages = useMemo(
    () => messages.filter((msg) => matchesKindFilter(msg, kindFilter)),
    [messages, kindFilter]
  );

  // Connection statuses for capability loading
  const statuses = useConnectionStore((s) => s.statuses);

  // Local UI state
  const [capabilities, setCapabilities] = useState<Partial<Record<Platform, PlatformChatCapability>>>(defaultCapabilities);
  const [composerText, setComposerText] = useState('');
  const [selectedTargets, setSelectedTargets] = useState<Platform[]>([]);
  const [relaySource, setRelaySource] = useState<ChatMessage | null>(null);
  const [relaySettings, setRelaySettings] = useState(() => pickRelaySettings(DEFAULT_APP_SETTINGS));
  const [sendFeedback, setSendFeedback] = useState<{ tone: 'success' | 'warning' | 'error'; text: string } | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Load platform capabilities when any platform status changes
  useEffect(() => {
    if (!window.api?.platform) return;
    let active = true;
    const refreshCapabilities = () => void window.api.platform.getChatCapabilities().then((nextCapabilities: any) => {
      if (!active) return;
      setCapabilities(nextCapabilities);
      // Ensure selected targets are still sendable after a capability change
      setSelectedTargets((current) => {
        const nextSendable = getSendablePlatforms(nextCapabilities);
        const filtered = current.filter((p) => nextSendable.includes(p));
        return filtered.length > 0 ? filtered : nextSendable;
      });
    });
    refreshCapabilities();
    const interval = window.setInterval(refreshCapabilities, 2000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [statuses.tiktok, statuses.twitch, statuses.youtube, statuses.kick]);

  // Sync relay settings from the persisted app settings store
  useEffect(() => {
    if (!window.api?.settings) return;
    let active = true;
    void window.api.settings.getAll().then((settings: any) => {
      if (!active) return;
      setRelaySettings(pickRelaySettings(resolveAppSettings(settings)));
    });
    const unsubscribe = window.api.on('settings:changed', (settings: unknown) => {
      setRelaySettings(pickRelaySettings(resolveAppSettings(settings as Record<string, unknown>)));
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Handlers used by the UI components
  const handleRelay = (message: ChatMessage) => {
    const relayTargets = getRelayTargets(capabilities, message.platform);
    setRelaySource(message);
    setComposerText(buildRelayText(message, relaySettings.chatRelayTagMode));
    setSelectedTargets(relayTargets);
    setSendFeedback(
      relayTargets.length > 0
        ? null
        : { tone: 'warning', text: 'No other connected platforms are ready for outbound chat.' }
    );
  };

  const handleFeatureMessage = (message: ChatMessage) => {
    void window.api.overlay.sendDeckAction({
      type: 'FEATURE_MESSAGE',
      payload: message,
    });
  };

  const updateRelaySetting = async <K extends keyof ReturnType<typeof pickRelaySettings>>(
    key: K,
    value: any
  ) => {
    setRelaySettings((cur) => ({ ...cur, [key]: value }));
    try {
      await window.api.settings.set(key, value);
    } catch (error) {
      console.error('Failed to update setting', error);
    }
  };

  const toggleTarget = (platform: Platform) => {
    if (!capabilities[platform]?.canSend) {
      setSendFeedback({
        tone: 'warning',
        text: `${platformLabel(platform)} is not ready for outbound chat: ${capabilities[platform]?.reason || 'Not connected'}`
      });
      return;
    }
    setSendFeedback(null);
    setSelectedTargets((curr) =>
      curr.includes(platform) ? curr.filter((p) => p !== platform) : [...curr, platform]
    );
  };

  const handleSend = async () => {
    const text = composerText.trim();
    if (!text || selectedTargets.length === 0) return;
    setIsSending(true);
    try {
      const results = (await window.api.platform.sendChatMessage({
        platforms: selectedTargets,
        text,
      })) as PlatformChatSendResult[];
      const summary = summarizeSendResults(results);
      setSendFeedback(summary);
      const failed = results.filter((r) => !r.ok).map((r) => r.platform);
      if (failed.length === 0) {
        setComposerText('');
        setRelaySource(null);
      } else {
        setSelectedTargets(failed);
      }
    } catch (error) {
      setSendFeedback({
        tone: 'error',
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsSending(false);
    }
  };

  return {
    // store values
    messages,
    platformFilter,
    kindFilter,
    searchQuery,
    setPlatformFilter,
    setKindFilter,
    setSearchQuery,
    // UI state
    capabilities,
    composerText,
    setComposerText,
    selectedTargets,
    setSelectedTargets,
    relaySource,
    setRelaySource,
    relaySettings,
    setRelaySettings,
    sendFeedback,
    setSendFeedback,
    isSending,
    setIsSending,
    // derived data
    filteredMessages: useMemo(
      () =>
        kindFilteredMessages.filter((msg) => {
          if (platformFilter && msg.platform !== platformFilter) return false;
          if (searchQuery) {
            const query = searchQuery.toLowerCase().trim();
            const haystack = `${msg.message} ${msg.displayName} ${msg.username} ${msg.platform}`.toLowerCase();
            if (!haystack.includes(query)) return false;
          }
          return true;
        }),
      [kindFilteredMessages, platformFilter, searchQuery]
    ),
    platformCounts: useMemo(() => {
      const counts: Record<string, number> = {};
      for (const m of kindFilteredMessages) {
        counts[m.platform] = (counts[m.platform] ?? 0) + 1;
      }
      return counts;
    }, [kindFilteredMessages]),
    // handlers
    handleRelay,
    handleFeatureMessage,
    updateRelaySetting,
    toggleTarget,
    handleSend,
  };
}

function platformLabel(platform: Platform): string {
  switch (platform) {
    case 'tiktok':
      return 'TikTok'
    case 'twitch':
      return 'Twitch'
    case 'youtube':
      return 'YouTube'
    case 'kick':
      return 'Kick'
    default:
      return platform
  }
}
