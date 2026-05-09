// src/renderer/pages/ChatPage/hooks/useChatLogic.ts
import { useEffect, useMemo, useState } from 'react';
import type { Platform, PlatformChatCapability, PlatformChatSendResult } from '../../../../main/platforms/types';
import { DEFAULT_APP_SETTINGS, resolveAppSettings, type AppSettings } from '../../../../shared/app-settings';
import { buildRelayText, getRelayTargets, getSendablePlatforms, summarizeSendResults } from '../../../lib/chat-relay';
import { defaultCapabilities } from '../constants';
import { pickRelaySettings } from '../utils';
import { useChatStore, type ChatMessage } from '../../../stores/chat-store';
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
  const searchQuery = useChatStore((s) => s.searchQuery);
  const setPlatformFilter = useChatStore((s) => s.setPlatformFilter);
  const setSearchQuery = useChatStore((s) => s.setSearchQuery);

  // Connection statuses for capability loading
  const statuses = useConnectionStore((s) => s.statuses);

  // Local UI state
  const [capabilities, setCapabilities] = useState<Record<Platform, PlatformChatCapability>>(defaultCapabilities);
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
    void window.api.platform.getChatCapabilities().then((nextCapabilities: any) => {
      if (!active) return;
      setCapabilities(nextCapabilities);
      // Ensure selected targets are still sendable after a capability change
      setSelectedTargets((current) => {
        const nextSendable = getSendablePlatforms(nextCapabilities);
        const filtered = current.filter((p) => nextSendable.includes(p));
        return filtered.length > 0 ? filtered : nextSendable;
      });
    });
    return () => {
      active = false;
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
    if (!capabilities[platform].canSend) return;
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
    searchQuery,
    setPlatformFilter,
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
        messages.filter((msg) => {
          if (platformFilter && msg.platform !== platformFilter) return false;
          if (searchQuery && !msg.message.toLowerCase().includes(searchQuery.toLowerCase())) return false;
          return true;
        }),
      [messages, platformFilter, searchQuery]
    ),
    platformCounts: useMemo(() => {
      const counts: Record<string, number> = {};
      for (const m of messages) {
        counts[m.platform] = (counts[m.platform] ?? 0) + 1;
      }
      return counts;
    }, [messages]),
    // handlers
    handleRelay,
    handleFeatureMessage,
    updateRelaySetting,
    toggleTarget,
    handleSend,
  };
}
