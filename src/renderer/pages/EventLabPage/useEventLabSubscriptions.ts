import { useEffect } from 'react'
import { createEventLabId, type EventLabEntry } from '../../stores/event-lab-store'
import { stripHtml, summarizePayload } from './EventLabPage.utils'

export function useEventLabSubscriptions(addEntry: (entry: EventLabEntry) => void) {
  useEffect(() => {
    if (!window.api?.on) return

    const cleanups = [
      window.api.on('event:overlay-broadcast', (payload: any) => {
        addEntry({
          id: createEventLabId('overlay'),
          kind: 'overlay',
          title: `Overlay channel: ${payload.channel}`,
          detail: summarizePayload(payload.payload),
          timestamp: payload.at ?? new Date().toISOString(),
          channel: payload.channel,
          payload
        })
      }),
      window.api.on('event:overlay-performance', (payload: any) => {
        addEntry({
          id: createEventLabId('overlay-performance'),
          kind: 'performance',
          title: `Overlay first paint: ${payload.channel}`,
          detail: `${Math.round(payload.paintMs ?? 0)}ms to paint · ${Math.round(payload.deliveryMs ?? 0)}ms delivery · ${payload.transport ?? 'unknown transport'}`,
          timestamp: payload.acknowledgedAt ?? new Date().toISOString(),
          channel: payload.channel,
          eventType: payload.widgetType,
          payload
        })
      }),
      window.api.on('event:device-broadcast', (payload: any) => {
        addEntry({
          id: createEventLabId('device'),
          kind: 'device',
          title: `DeskThing packet: ${payload.type}`,
          detail: `${payload.clientCount ?? 0} connected device(s)`,
          timestamp: payload.at ?? new Date().toISOString(),
          eventType: payload.type,
          payload
        })
      }),
      window.api.on('automation:run-receipt', (payload: any) => {
        addEntry({
          id: payload.id ?? createEventLabId('automation'),
          kind: 'automation',
          title: `Automation receipt: ${payload.matchedRules}/${payload.ruleCount} matched`,
          detail: `${payload.actionsRan ?? 0} ran, ${payload.actionsSkipped ?? 0} skipped, ${payload.actionsFailed ?? 0} failed in ${payload.durationMs ?? 0}ms`,
          timestamp: payload.finishedAt ?? new Date().toISOString(),
          platform: payload.platform,
          eventType: payload.eventType,
          payload,
          replayable: Boolean(payload.testPayload)
        })
      }),
      window.api.on('action:show-alert', (payload: any) => {
        addEntry({
          id: createEventLabId('alert'),
          kind: 'alert',
          title: 'Alert visual queued',
          detail: stripHtml(payload.html || payload.template || 'Overlay alert payload'),
          timestamp: new Date().toISOString(),
          payload
        })
      }),
      window.api.on('action:play-sound', (payload: any) => {
        addEntry({
          id: createEventLabId('sound'),
          kind: 'sound',
          title: 'Sound playback requested',
          detail: `${payload.filePath ?? 'Unknown file'} at ${Math.round((payload.volume ?? 1) * 100)}%`,
          timestamp: new Date().toISOString(),
          payload
        })
      }),
      window.api.on('action:stop-all-sounds', () => {
        addEntry({
          id: createEventLabId('sound-stop'),
          kind: 'sound',
          title: 'All sounds stopped',
          detail: 'Renderer audio panic stop received',
          timestamp: new Date().toISOString()
        })
      }),
      window.api.on('tts:speak', (payload: any) => {
        addEntry({
          id: createEventLabId('tts'),
          kind: 'tts',
          title: `TTS queued for ${payload.username ?? 'viewer'}`,
          detail: String(payload.text ?? '').slice(0, 180),
          timestamp: new Date().toISOString(),
          payload
        })
      }),
      window.api.on('spotify:queue-update', (queue: any[]) => {
        addEntry({
          id: createEventLabId('spotify-queue'),
          kind: 'spotify',
          title: 'Spotify queue updated',
          detail: `${Array.isArray(queue) ? queue.length : 0} request(s) in app queue`,
          timestamp: new Date().toISOString(),
          payload: queue
        })
      }),
      window.api.on('spotify:status-changed', (payload: any) => {
        addEntry({
          id: createEventLabId('spotify-status'),
          kind: 'spotify',
          title: 'Spotify status changed',
          detail: payload?.connected ? 'Connected' : payload?.error || 'Disconnected',
          timestamp: new Date().toISOString(),
          payload
        })
      }),
      window.api.on('platform:status-change', (payload: any) => {
        addEntry({
          id: createEventLabId('platform-status'),
          kind: 'status',
          title: `${payload.platform} status`,
          detail: String(payload.status ?? 'unknown'),
          timestamp: new Date().toISOString(),
          platform: payload.platform,
          payload
        })
      }),
      window.api.on('platform:error', (payload: any) => {
        addEntry({
          id: createEventLabId('platform-error'),
          kind: 'status',
          title: `${payload.platform ?? 'Platform'} error`,
          detail: String(payload.message ?? 'Unknown error'),
          timestamp: payload.timestamp ?? new Date().toISOString(),
          platform: payload.platform,
          payload
        })
      })
    ]

    void window.api.overlay?.getStatus?.().then((status: any) => {
      addEntry({
        id: createEventLabId('overlay-status'),
        kind: 'status',
        title: 'Overlay server status',
        detail: status?.running ? `Running on ${status.port}` : status?.lastError || 'Offline',
        timestamp: new Date().toISOString(),
        payload: status
      })
    })

    return () => cleanups.forEach((cleanup) => cleanup())
  }, [addEntry])
}
