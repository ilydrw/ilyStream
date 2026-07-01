import { useEffect } from 'react'
import { shouldSuppressStreamEventFromChat } from '../../shared/chat-event-filter'
import { LIKE_LOG_VERBOSE } from '../../shared/debug-flags'
import { useChatStore } from '../stores/chat-store'
import { useConnectionStore } from '../stores/connection-store'
import { useLiveViewersStore } from '../stores/live-viewers-store'
import { createEventLabId, summarizeEventForLab, useEventLabStore } from '../stores/event-lab-store'

const PRESENCE_EVENT_TYPES = new Set(['chat', 'gift', 'follow', 'subscription', 'like', 'share', 'join'])

export function usePlatformEvents(isMounted: boolean) {
  const addMessage = useChatStore((s) => s.addMessage)
  const setStatus = useConnectionStore((s) => s.setStatus)
  const setViewerCount = useConnectionStore((s) => s.setViewerCount)
  const setError = useConnectionStore((s) => s.setError)
  const setReconnectInfo = useConnectionStore((s) => s.setReconnectInfo)
  const addEventDiagnostic = useConnectionStore((s) => s.addEventDiagnostic)
  const addEventLabEntry = useEventLabStore((s) => s.addEntry)
  const recordPresence = useLiveViewersStore((s) => s.recordPresence)

  useEffect(() => {
    if (!window.api?.platform || !isMounted) return

    const cleanups: (() => void)[] = []
    let active = true

    console.log('[usePlatformEvents] Hook initialized. Setting up listeners...')

    // Listen for stream events
    cleanups.push(
      window.api.on('event:stream', (event: any) => {
        if (event.type !== 'like' || LIKE_LOG_VERBOSE) {
          console.log(`[usePlatformEvents] Received ${event.type} event from ${event.platform}:`, event)
        }
        if (event.type === 'gift' && event.isCombo) return
        const suppressFromChat = shouldSuppressStreamEventFromChat(event)
        const labSummary = summarizeEventForLab(event)

        addEventLabEntry({
          id: event.id ?? createEventLabId('stream'),
          kind: 'stream',
          title: labSummary.title,
          detail: labSummary.detail,
          timestamp: event.timestamp ?? new Date().toISOString(),
          platform: event.platform,
          eventType: event.type,
          payload: event,
          replayable: true
        })

        if (!suppressFromChat) {
          addEventDiagnostic({
            id: event.id ?? `${event.platform}:${event.type}:${Date.now()}`,
            platform: event.platform,
            type: event.type,
            summary: summarizeStreamEvent(event),
            timestamp: new Date(event.timestamp ?? Date.now())
          })
        }

        // Track who's active in the stream right now for the live viewers list.
        if (event.user?.username && PRESENCE_EVENT_TYPES.has(event.type)) {
          recordPresence({
            platform: event.platform,
            username: event.user.username,
            displayName: event.user.displayName,
            profilePictureUrl: event.user.profilePictureUrl,
            isModerator: event.user.isModerator,
            isSubscriber: event.user.isSubscriber,
            isVip: event.user.isVip,
            isFanClub: event.user.isFanClubMember,
            isSuperFan: event.user.isSuperFan,
            badges: event.user.badges,
            action: event.type
          })
        }

        if (event.type === 'chat') {
          if (suppressFromChat) return
          // Map Platform ChatEvent to Renderer ChatMessage
          const chatMsg = {
            id: event.id,
            platform: event.platform,
            username: event.user.username,
            displayName: event.user.displayName,
            message: event.message,
            isModerator: event.user.isModerator,
            isSubscriber: event.user.isSubscriber,
            isVip: event.user.isVip,
            isFollower: event.user.isFollower,
            isFanClub: event.user.isFanClubMember,
            isSuperFan: event.user.isSuperFan,
            isTeamMember: event.user.isTeamMember,
            badges: event.user.badges,
            timestamp: new Date(event.timestamp),
            profilePictureUrl: event.user.profilePictureUrl
          }
          console.log('[usePlatformEvents] Adding chat message to store:', chatMsg)
          addMessage(chatMsg)
        }

        if (event.type === 'viewer-count') {
          setViewerCount(event.platform, event.count)
          // The room's top-viewers roster (TikTok) — people present but not
          // necessarily active. Surfaces lurkers in the "in stream" list.
          if (Array.isArray(event.viewers)) {
            for (const viewer of event.viewers) {
              if (!viewer?.username) continue
              recordPresence({
                platform: event.platform,
                username: viewer.username,
                displayName: viewer.displayName,
                profilePictureUrl: viewer.profilePictureUrl,
                isModerator: viewer.isModerator,
                isSubscriber: viewer.isSubscriber,
                isVip: viewer.isVip,
                isFanClub: viewer.isFanClubMember,
                isSuperFan: viewer.isSuperFan,
                badges: viewer.badges,
                action: 'viewing'
              })
            }
          }
        }
      })
    )

    // Listen for status changes
    cleanups.push(
      window.api.on('platform:status-change', (data: any) => {
        setStatus(data.platform, data.status)
      })
    )

    cleanups.push(
      window.api.on('platform:error', (error: any) => {
        setError(error.platform, error.message)
      })
    )

    cleanups.push(
      window.api.on('platform:reconnecting', (data: any) => {
        setReconnectInfo(data.platform, {
          attempt: data.attempt,
          maxAttempts: data.maxAttempts,
          delayMs: data.delayMs
        })
      })
    )

    void window.api.platform.getStatuses().then((statuses) => {
      if (!active) return

      for (const [platform, status] of Object.entries(statuses)) {
        setStatus(
          platform as Parameters<typeof setStatus>[0],
          status as Parameters<typeof setStatus>[1]
        )
      }
    })

    void window.api.platform.getErrors().then((errors) => {
      if (!active) return

      for (const [platform, message] of Object.entries(errors)) {
        setError(platform as Parameters<typeof setError>[0], message as string | null)
      }
    })

    // Delay restoration to prioritize UI paint and responsiveness
    const restoreTimer = setTimeout(() => {
      if (!active) return
      console.log('[usePlatformEvents] Restoring platform connections...')
      window.api.platform.restoreConnections().catch((error) => {
        console.error('Failed to restore platform connections:', error)
      })
    }, 1500)

    return () => {
      active = false
      clearTimeout(restoreTimer)
      cleanups.forEach((fn) => fn())
    }
  }, [isMounted, addEventDiagnostic, addEventLabEntry, addMessage, recordPresence, setError, setReconnectInfo, setStatus, setViewerCount])
}

function summarizeStreamEvent(event: any): string {
  const name = event.user?.displayName || event.user?.username || 'Unknown user'

  switch (event.type) {
    case 'chat':
      return `${name}: ${String(event.message ?? '').slice(0, 90)}`
    case 'gift':
      return `${name} sent ${event.giftCount ?? 1} ${event.giftName ?? 'gift'}`
    case 'follow':
      return `${name} followed`
    case 'like':
      return `${name} liked ${event.likeCount ?? 1}x`
    case 'share':
      return `${name} shared the live`
    case 'join':
      return `${name} joined`
    case 'viewer-count':
      return `${event.count ?? 0} viewers online`
    default:
      return `${name} triggered ${event.type ?? 'event'}`
  }
}
