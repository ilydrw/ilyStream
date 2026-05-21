import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  IconActivity,
  IconAlertTriangle,
  IconBell,
  IconBook2,
  IconBolt,
  IconCircleCheck,
  IconClock,
  IconCopy,
  IconDeviceDesktop,
  IconFileImport,
  IconFilter,
  IconGift,
  IconHeart,
  IconMessage,
  IconMusic,
  IconPlayerPlay,
  IconPlayerStop,
  IconPlayerTrackNext,
  IconRefresh,
  IconReportAnalytics,
  IconSend,
  IconShare,
  IconTrash,
  IconUserPlus,
  IconUsers
} from '@tabler/icons-react'
import { PageHeader } from '../../components/layout/PageHeader'
import {
  createEventLabId,
  type EventLabEntry,
  type EventLabEntryKind,
  useEventLabStore
} from '../../stores/event-lab-store'
import type { EventLabSimulationPayload, EventLabTestEventType } from '../../../shared/event-lab'
import type { Platform } from '../../../main/platforms/types'
import {
  eventLabPayloadToSimulation,
  formatReplayDuration,
  normalizeReplayPayload,
  normalizeReplaySession,
  type EventReplayEvent,
  type EventReplaySession
} from '../../lib/event-replay'
import {
  evaluateReplayAssertions,
  type ReplayAssertionReport,
  type ReplayAssertionResult
} from '../../lib/event-replay-assertions'

const PLATFORMS: Platform[] = ['tiktok', 'twitch', 'youtube', 'kick']
const EVENT_TYPES: EventLabTestEventType[] = [
  'chat',
  'gift',
  'like',
  'follow',
  'subscription',
  'superfan',
  'share',
  'raid',
  'join',
  'viewer-count'
]

const QUICK_TESTS: Array<{ type: EventLabTestEventType; label: string; icon: typeof IconActivity }> = [
  { type: 'chat', label: 'Chat', icon: IconMessage },
  { type: 'gift', label: 'Gift', icon: IconGift },
  { type: 'like', label: 'Likes', icon: IconHeart },
  { type: 'follow', label: 'Follow', icon: IconUserPlus },
  { type: 'subscription', label: 'Sub', icon: IconUsers },
  { type: 'share', label: 'Share', icon: IconShare }
]

const KIND_LABELS: Record<EventLabEntryKind | 'all', string> = {
  all: 'All',
  stream: 'Stream',
  overlay: 'Overlay',
  device: 'DeskThing',
  automation: 'Automation',
  alert: 'Alerts',
  sound: 'Sounds',
  tts: 'TTS',
  spotify: 'Spotify',
  status: 'Status',
  system: 'System'
}

export default function EventLabPage() {
  const entries = useEventLabStore((state) => state.entries)
  const recording = useEventLabStore((state) => state.recording)
  const replaySessions = useEventLabStore((state) => state.replaySessions)
  const activeReplay = useEventLabStore((state) => state.activeReplay)
  const addEntry = useEventLabStore((state) => state.addEntry)
  const clearEntries = useEventLabStore((state) => state.clear)
  const startRecording = useEventLabStore((state) => state.startRecording)
  const stopRecording = useEventLabStore((state) => state.stopRecording)
  const discardRecording = useEventLabStore((state) => state.discardRecording)
  const deleteReplaySession = useEventLabStore((state) => state.deleteReplaySession)
  const importReplaySession = useEventLabStore((state) => state.importReplaySession)
  const setActiveReplay = useEventLabStore((state) => state.setActiveReplay)
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [kindFilter, setKindFilter] = useState<EventLabEntryKind | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [captureName, setCaptureName] = useState('Live Event Capture')
  const [replaySpeed, setReplaySpeed] = useState(1)
  const [stepIndex, setStepIndex] = useState(0)
  const [importText, setImportText] = useState('')
  const [replayNotice, setReplayNotice] = useState<string | null>(null)
  const [lastAssertionReport, setLastAssertionReport] = useState<ReplayAssertionReport | null>(null)
  const [isRunningAssertions, setIsRunningAssertions] = useState(false)
  const replayCancelRef = useRef(false)
  const [draft, setDraft] = useState<EventLabSimulationPayload>({
    platform: 'tiktok',
    type: 'gift',
    username: 'event_lab_test',
    displayName: 'Event Lab Test',
    message: 'This is a test chat from Event Lab.',
    giftName: 'GG',
    giftCount: 1,
    likeCount: 25,
    totalLikes: 2500,
    viewerCount: 24,
    months: 3,
    suppressSound: false
  })

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

  useEffect(() => {
    if (selectedSessionId && replaySessions.some((session) => session.id === selectedSessionId)) return
    setSelectedSessionId(replaySessions[0]?.id ?? null)
  }, [replaySessions, selectedSessionId])

  useEffect(() => {
    setStepIndex(0)
  }, [selectedSessionId])

  useEffect(() => {
    return () => {
      replayCancelRef.current = true
      setActiveReplay(null)
    }
  }, [setActiveReplay])

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return entries.filter((entry) => {
      if (kindFilter !== 'all' && entry.kind !== kindFilter) return false
      if (!q) return true
      return [
        entry.kind,
        entry.title,
        entry.detail,
        entry.platform,
        entry.eventType,
        entry.channel
      ].some((value) => String(value ?? '').toLowerCase().includes(q))
    })
  }, [entries, kindFilter, searchQuery])

  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId) ?? filteredEntries[0] ?? null
  const selectedReplaySession =
    replaySessions.find((session) => session.id === selectedSessionId) ?? replaySessions[0] ?? null
  const counts = useMemo(() => {
    return entries.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.kind] = (acc[entry.kind] || 0) + 1
      return acc
    }, {})
  }, [entries])

  const fireEvent = async (override?: Partial<EventLabSimulationPayload>) => {
    const payload = normalizeReplayPayload({ ...draft, ...override })
    const simulated = await window.api?.events?.simulate?.(payload)
    addEntry({
      id: createEventLabId('system-fire'),
      kind: 'system',
      title: `Fired ${payload.type}`,
      detail: `${payload.platform ?? 'tiktok'} test event sent through the main event pipeline`,
      timestamp: new Date().toISOString(),
      payload: simulated ?? payload
    })
  }

  const fireReplayEvent = async (event: EventReplayEvent, session: EventReplaySession, index: number) => {
    const simulated = await window.api?.events?.simulate?.(event.payload)
    addEntry({
      id: createEventLabId('replay-fire'),
      kind: 'system',
      title: `Replay fired ${event.payload.type}`,
      detail: `${session.name} event ${index + 1}/${session.events.length}`,
      timestamp: new Date().toISOString(),
      payload: {
        sessionId: session.id,
        event,
        simulated
      }
    })
  }

  const startCapture = () => {
    startRecording(captureName)
    setReplayNotice('Recording replayable stream events. Downstream packets stay visible but are not duplicated into the replay.')
  }

  const stopCapture = () => {
    const session = stopRecording()
    if (!session) {
      setReplayNotice('Capture stopped. No replayable stream events were recorded.')
      return
    }

    setSelectedSessionId(session.id)
    setReplayNotice(`Saved ${session.events.length} event(s) as "${session.name}".`)
  }

  const discardCapture = () => {
    discardRecording()
    setReplayNotice('Capture discarded.')
  }

  const runReplaySession = async (
    session: EventReplaySession,
    options: { assertionRun?: boolean } = {}
  ) => {
    if (session.events.length === 0 || activeReplay?.running) return false

    replayCancelRef.current = false
    setReplayNotice(`${options.assertionRun ? 'Testing' : 'Replaying'} "${session.name}" at ${replaySpeed}x.`)
    addEntry({
      id: createEventLabId('replay-start'),
      kind: 'system',
      title: `${options.assertionRun ? 'Replay test started' : 'Replay started'}: ${session.name}`,
      detail: `${session.events.length} event(s), ${formatReplayDuration(session.durationMs)} at ${replaySpeed}x`,
      timestamp: new Date().toISOString(),
      payload: { ...session, assertionRun: options.assertionRun === true }
    })

    let cancelled = false
    let previousOffsetMs = 0
    try {
      for (const [index, event] of session.events.entries()) {
        if (replayCancelRef.current) break
        const waitMs = Math.max(0, (event.offsetMs - previousOffsetMs) / replaySpeed)
        previousOffsetMs = event.offsetMs
        await waitForReplay(waitMs, () => replayCancelRef.current)
        if (replayCancelRef.current) break

        setActiveReplay({
          sessionId: session.id,
          sessionName: session.name,
          running: true,
          index: index + 1,
          total: session.events.length,
          speed: replaySpeed,
          startedAt: new Date().toISOString()
        })
        await fireReplayEvent(event, session, index)
      }
    } finally {
      cancelled = replayCancelRef.current
      setActiveReplay(null)
      setReplayNotice(cancelled ? `Stopped replay "${session.name}".` : `Finished ${options.assertionRun ? 'test run' : 'replay'} "${session.name}".`)
      addEntry({
        id: createEventLabId(cancelled ? 'replay-stop' : 'replay-finish'),
        kind: 'system',
        title: cancelled ? `Replay stopped: ${session.name}` : `${options.assertionRun ? 'Replay test finished' : 'Replay finished'}: ${session.name}`,
        detail: `${session.events.length} event(s) queued through the local pipeline`,
        timestamp: new Date().toISOString(),
        payload: { sessionId: session.id, cancelled, assertionRun: options.assertionRun === true }
      })
      replayCancelRef.current = false
    }

    return !cancelled
  }

  const runReplayAssertions = async (session: EventReplaySession) => {
    if (isRunningAssertions || activeReplay?.running) return

    const startedAt = new Date().toISOString()
    setLastAssertionReport(null)
    setIsRunningAssertions(true)

    try {
      const completed = await runReplaySession(session, { assertionRun: true })
      await waitForReplay(400, () => replayCancelRef.current)

      const finishedAt = new Date().toISOString()
      const runEntries = useEventLabStore.getState().entries
      const report = evaluateReplayAssertions(session, runEntries, { startedAt, finishedAt })
      setLastAssertionReport(report)

      addEntry({
        id: createEventLabId('assertions-report'),
        kind: 'system',
        title: `Replay assertions ${report.failed === 0 && completed ? 'passed' : 'failed'}: ${session.name}`,
        detail: `${report.passed} passed, ${report.failed} failed, ${report.warnings} warning(s)`,
        timestamp: new Date().toISOString(),
        payload: report
      })

      setReplayNotice(
        completed
          ? `Replay assertions finished: ${report.passed} passed, ${report.failed} failed, ${report.warnings} warning(s).`
          : `Replay assertions stopped early: ${report.passed} passed, ${report.failed} failed, ${report.warnings} warning(s).`
      )
    } finally {
      setIsRunningAssertions(false)
    }
  }

  const stopReplay = () => {
    replayCancelRef.current = true
    setActiveReplay(null)
  }

  const stepReplaySession = async (session: EventReplaySession) => {
    if (session.events.length === 0 || activeReplay?.running) return
    setLastAssertionReport(null)
    const index = stepIndex % session.events.length
    const event = session.events[index]
    setActiveReplay({
      sessionId: session.id,
      sessionName: session.name,
      running: false,
      index: index + 1,
      total: session.events.length,
      speed: 0,
      startedAt: new Date().toISOString()
    })
    await fireReplayEvent(event, session, index)
    setStepIndex((current) => (current + 1) % session.events.length)
  }

  const copyReplaySession = async (session: EventReplaySession) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(session, null, 2))
      setReplayNotice(`Copied "${session.name}" replay JSON.`)
    } catch {
      setReplayNotice('Could not access the clipboard for replay export.')
    }
  }

  const importReplayText = () => {
    try {
      const session = normalizeReplaySession(JSON.parse(importText))
      importReplaySession(session)
      setSelectedSessionId(session.id)
      setImportText('')
      setReplayNotice(`Imported "${session.name}" with ${session.events.length} event(s).`)
    } catch (error) {
      setReplayNotice(error instanceof Error ? error.message : 'Could not import that replay JSON.')
    }
  }

  const replayEntry = async (entry: EventLabEntry) => {
    const payload = eventLabPayloadToSimulation(entry.payload)
    if (!payload) return
    await fireEvent(payload)
  }

  const copySelectedPayload = async () => {
    if (!selectedEntry?.payload) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(selectedEntry.payload, null, 2))
    } catch {
      setReplayNotice('Could not access the clipboard for payload copy.')
    }
  }

  return (
    <div className="app-page">
      <PageHeader
        kicker="Diagnostics and test lab"
        title="Event Lab"
        icon={IconBolt}
        description="Inspect stream events, overlay broadcasts, alert actions, audio cues, Spotify updates, and DeskThing packets as they move through ilyStream."
        actions={
          <div className="flex items-center gap-2">
            <button className="app-button !h-11 text-xs font-bold" onClick={() => void fireEvent()}>
              <IconSend size={15} className="mr-2" />
              Fire Event
            </button>
            <button className="app-button-danger !h-11 !px-4" onClick={clearEntries} title="Clear Event Lab">
              <IconTrash size={15} />
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-6">
        <div className="flex flex-col gap-6 min-w-0">
        <section className="app-section-card glass !p-0 overflow-hidden">
          <div className="app-section-head">
            <div>
              <h2 className="text-sm font-black text-white">Test Event Builder</h2>
              <p>Send a realistic local event through alerts, widgets, TTS, triggers, stats, and devices.</p>
            </div>
          </div>

          <div className="p-5 flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Platform">
                <select
                  value={draft.platform}
                  onChange={(event) => setDraft((prev) => ({ ...prev, platform: event.target.value as Platform }))}
                  className="app-input !h-10 !text-xs"
                >
                  {PLATFORMS.map((platform) => (
                    <option key={platform} value={platform}>{platform}</option>
                  ))}
                </select>
              </Field>

              <Field label="Event Type">
                <select
                  value={draft.type}
                  onChange={(event) => setDraft((prev) => ({ ...prev, type: event.target.value as EventLabTestEventType }))}
                  className="app-input !h-10 !text-xs"
                >
                  {EVENT_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Username">
                <input
                  value={draft.username ?? ''}
                  onChange={(event) => setDraft((prev) => ({ ...prev, username: event.target.value }))}
                  className="app-input !h-10 !text-xs"
                />
              </Field>
              <Field label="Display Name">
                <input
                  value={draft.displayName ?? ''}
                  onChange={(event) => setDraft((prev) => ({ ...prev, displayName: event.target.value }))}
                  className="app-input !h-10 !text-xs"
                />
              </Field>
            </div>

            {draft.type === 'chat' && (
              <Field label="Message">
                <textarea
                  value={draft.message ?? ''}
                  onChange={(event) => setDraft((prev) => ({ ...prev, message: event.target.value }))}
                  className="app-input min-h-[92px] !py-3 !text-xs resize-none"
                />
              </Field>
            )}

            {draft.type === 'gift' && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Gift Name">
                  <input
                    value={draft.giftName ?? ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, giftName: event.target.value }))}
                    className="app-input !h-10 !text-xs"
                  />
                </Field>
                <Field label="Gift Count">
                  <NumberInput value={draft.giftCount ?? 1} min={1} max={999} onChange={(giftCount) => setDraft((prev) => ({ ...prev, giftCount }))} />
                </Field>
              </div>
            )}

            {draft.type === 'like' && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Like Count">
                  <NumberInput value={draft.likeCount ?? 25} min={1} max={100000} onChange={(likeCount) => setDraft((prev) => ({ ...prev, likeCount }))} />
                </Field>
                <Field label="Total Likes">
                  <NumberInput value={draft.totalLikes ?? 2500} min={0} max={100000000} onChange={(totalLikes) => setDraft((prev) => ({ ...prev, totalLikes }))} />
                </Field>
              </div>
            )}

            {(draft.type === 'raid' || draft.type === 'viewer-count') && (
              <Field label={draft.type === 'raid' ? 'Raid Viewers' : 'Viewer Count'}>
                <NumberInput value={draft.viewerCount ?? 24} min={0} max={50000} onChange={(viewerCount) => setDraft((prev) => ({ ...prev, viewerCount }))} />
              </Field>
            )}

            {(draft.type === 'subscription' || draft.type === 'superfan') && (
              <Field label="Months">
                <NumberInput value={draft.months ?? 3} min={1} max={120} onChange={(months) => setDraft((prev) => ({ ...prev, months }))} />
              </Field>
            )}

            <label className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3">
              <span>
                <span className="block text-xs font-bold text-white/80">Suppress sound</span>
                <span className="block text-[10px] text-white/30">Useful when testing visuals without audio.</span>
              </span>
              <input
                type="checkbox"
                checked={draft.suppressSound === true}
                onChange={(event) => setDraft((prev) => ({ ...prev, suppressSound: event.target.checked }))}
                className="h-4 w-4 accent-[#d035f1]"
              />
            </label>

            <div className="grid grid-cols-3 gap-2">
              {QUICK_TESTS.map((test) => {
                const Icon = test.icon
                return (
                  <button
                    key={test.type}
                    type="button"
                    onClick={() => void fireEvent({ type: test.type })}
                    className="h-10 rounded-lg border border-white/10 bg-white/[0.03] text-[10px] font-black uppercase tracking-normal text-white/55 hover:border-[#d035f1]/40 hover:text-white transition-all"
                  >
                    <Icon size={14} className="inline mr-1.5 opacity-70" />
                    {test.label}
                  </button>
                )
              })}
            </div>

            <button onClick={() => void fireEvent()} className="app-button-primary !h-11 text-xs font-black">
              <IconPlayerPlay size={15} className="mr-2" />
              Run Full Test
            </button>
          </div>
        </section>

        <section className="app-section-card glass !p-0 overflow-hidden">
          <div className="app-section-head">
            <div className="flex items-center gap-3 min-w-0">
              <IconBook2 size={22} className="text-[#d035f1] shrink-0" />
              <div className="min-w-0">
                <h2 className="text-sm font-black text-white">Event Replay Studio</h2>
                <p>Capture real bursts, save them, then replay the exact timing against the local pipeline.</p>
              </div>
            </div>
          </div>

          <div className="p-5 space-y-5">
            {replayNotice && (
              <div className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-bold text-white/50">
                {replayNotice}
              </div>
            )}

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-normal text-white/30">Capture</p>
                  <p className="text-sm font-black text-white">
                    {recording ? `${recording.events.length} replayable event(s)` : 'Ready to record'}
                  </p>
                </div>
                <span className={`h-2.5 w-2.5 rounded-full ${recording ? 'bg-rose-300 shadow-[0_0_12px_rgba(253,164,175,0.6)]' : 'bg-white/20'}`} />
              </div>
              <input
                value={captureName}
                onChange={(event) => setCaptureName(event.target.value)}
                disabled={Boolean(recording)}
                className="app-input !h-10 !text-xs mb-3 disabled:opacity-50"
                placeholder="Replay name"
              />
              <div className="grid grid-cols-2 gap-2">
                {!recording ? (
                  <button onClick={startCapture} className="app-button-primary !h-10 text-[10px] font-black uppercase tracking-normal">
                    <IconPlayerPlay size={14} className="mr-2" />
                    Start Capture
                  </button>
                ) : (
                  <button onClick={stopCapture} className="app-button-primary !h-10 text-[10px] font-black uppercase tracking-normal">
                    <IconPlayerStop size={14} className="mr-2" />
                    Save Capture
                  </button>
                )}
                <button
                  onClick={discardCapture}
                  disabled={!recording}
                  className="app-button-danger !h-10 text-[10px] font-black uppercase tracking-normal disabled:opacity-35"
                >
                  Discard
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-normal text-white/30">Replay Session</p>
                  <p className="text-sm font-black text-white truncate max-w-[250px]">
                    {selectedReplaySession?.name ?? 'No saved replay'}
                  </p>
                </div>
                {selectedReplaySession && (
                  <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[9px] font-black uppercase tracking-normal text-white/35">
                    {selectedReplaySession.events.length} events
                  </span>
                )}
              </div>

              {replaySessions.length > 0 ? (
                <select
                  value={selectedReplaySession?.id ?? ''}
                  onChange={(event) => setSelectedSessionId(event.target.value)}
                  className="app-input !h-10 !text-xs mb-3"
                >
                  {replaySessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.name} ({session.events.length})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] p-3 text-xs font-bold text-white/30 mb-3">
                  No sessions yet. Start a capture, fire events, then save it.
                </div>
              )}

              {selectedReplaySession && (
                <>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <ReplayStat label="Length" value={formatReplayDuration(selectedReplaySession.durationMs)} icon={IconClock} />
                    <ReplayStat label="Step" value={`${Math.min(stepIndex + 1, selectedReplaySession.events.length)}/${selectedReplaySession.events.length}`} icon={IconPlayerTrackNext} />
                    <ReplayStat label="Speed" value={`${replaySpeed}x`} icon={IconActivity} />
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 mb-3">
                    {[0.5, 1, 2, 4].map((speed) => (
                      <button
                        key={speed}
                        type="button"
                        onClick={() => setReplaySpeed(speed)}
                        className={`h-8 rounded-lg border text-[10px] font-black transition-all ${
                          replaySpeed === speed
                            ? 'border-[#d035f1]/50 bg-[#d035f1]/15 text-white'
                            : 'border-white/10 bg-white/[0.03] text-white/35 hover:text-white'
                        }`}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {!activeReplay?.running ? (
                      <button
                        onClick={() => void runReplaySession(selectedReplaySession)}
                        disabled={isRunningAssertions}
                        className="app-button-primary !h-10 text-[10px] font-black uppercase tracking-normal disabled:opacity-35"
                      >
                        <IconPlayerPlay size={14} className="mr-2" />
                        Play
                      </button>
                    ) : (
                      <button onClick={stopReplay} className="app-button-danger !h-10 text-[10px] font-black uppercase tracking-normal">
                        <IconPlayerStop size={14} className="mr-2" />
                        Stop
                      </button>
                    )}
                    <button
                      onClick={() => void stepReplaySession(selectedReplaySession)}
                      disabled={Boolean(activeReplay?.running) || isRunningAssertions}
                      className="app-button !h-10 text-[10px] font-black uppercase tracking-normal disabled:opacity-35"
                    >
                      <IconPlayerTrackNext size={14} className="mr-2" />
                      Step
                    </button>
                    <button
                      onClick={() => void runReplayAssertions(selectedReplaySession)}
                      disabled={Boolean(activeReplay?.running) || isRunningAssertions}
                      className="app-button-primary !h-10 text-[10px] font-black uppercase tracking-normal disabled:opacity-35"
                    >
                      <IconReportAnalytics size={14} className="mr-2" />
                      {isRunningAssertions ? 'Testing' : 'Run Test'}
                    </button>
                    <button onClick={() => void copyReplaySession(selectedReplaySession)} className="app-button !h-10 text-[10px] font-black uppercase tracking-normal">
                      <IconCopy size={14} className="mr-2" />
                      Copy
                    </button>
                    <button
                      onClick={() => {
                        deleteReplaySession(selectedReplaySession.id)
                        setReplayNotice(`Deleted "${selectedReplaySession.name}".`)
                      }}
                      className="app-button-danger !h-10 text-[10px] font-black uppercase tracking-normal"
                    >
                      <IconTrash size={14} className="mr-2" />
                      Delete
                    </button>
                  </div>

                  {activeReplay?.sessionId === selectedReplaySession.id && (
                    <div className="mt-3 rounded-lg border border-[#d035f1]/25 bg-[#d035f1]/10 p-3">
                      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-normal text-white/55">
                        <span>{activeReplay.running ? 'Running' : 'Stepped'}</span>
                        <span>{activeReplay.index}/{activeReplay.total}</span>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-black/40 overflow-hidden">
                        <div
                          className="h-full bg-[#d035f1]"
                          style={{ width: `${Math.min(100, (activeReplay.index / Math.max(1, activeReplay.total)) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {lastAssertionReport?.sessionId === selectedReplaySession.id && (
                    <AssertionReportCard report={lastAssertionReport} />
                  )}
                </>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center gap-2 mb-3">
                <IconFileImport size={16} className="text-[#d035f1]" />
                <p className="text-xs font-black text-white">Import Replay JSON</p>
              </div>
              <textarea
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                className="app-input min-h-[92px] !py-3 !text-xs font-mono resize-none"
                placeholder='Paste {"schemaVersion":1,"name":"...","events":[...]}'
              />
              <button
                onClick={importReplayText}
                disabled={importText.trim().length === 0}
                className="app-button-primary mt-3 w-full !h-10 text-[10px] font-black uppercase tracking-normal disabled:opacity-35"
              >
                Review & Import
              </button>
            </div>
          </div>
        </section>
        </div>

        <div className="flex flex-col gap-6 min-w-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Events" value={entries.length} icon={IconActivity} />
            <Metric label="Overlay" value={counts.overlay || 0} icon={IconDeviceDesktop} />
            <Metric label="Alerts" value={counts.alert || 0} icon={IconBell} />
            <Metric label="Sounds" value={counts.sound || 0} icon={IconMusic} />
          </div>

          <section className="app-section-card glass !p-0 overflow-hidden min-h-[680px]">
            <div className="app-section-head">
              <div>
                <h2 className="text-sm font-black text-white">Live Timeline</h2>
                <p>Follow every event and downstream action in one place.</p>
              </div>
              <div className="flex items-center gap-2">
                <IconFilter size={14} className="text-white/25" />
                <select
                  value={kindFilter}
                  onChange={(event) => setKindFilter(event.target.value as EventLabEntryKind | 'all')}
                  className="app-input !h-9 !w-32 !text-xs"
                >
                  {Object.entries(KIND_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search"
                  className="app-input !h-9 !w-44 !text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_360px] min-h-[580px]">
              <div className="border-r border-white/5 min-w-0">
                <div className="h-[580px] overflow-y-auto custom-scrollbar p-3">
                  {filteredEntries.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-white/25">
                      <IconRefresh size={32} className="mb-3 opacity-40" />
                      <p className="text-sm font-bold text-white/35">No matching events yet</p>
                      <p className="text-xs text-white/20 mt-1">Fire a test event or wait for live traffic.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {filteredEntries.map((entry) => (
                        <TimelineRow
                          key={entry.id}
                          entry={entry}
                          selected={selectedEntry?.id === entry.id}
                          onSelect={() => setSelectedEntryId(entry.id)}
                          onReplay={() => void replayEntry(entry)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <aside className="bg-black/20 min-w-0">
                <div className="p-4 border-b border-white/5 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-normal text-white/30">Payload</p>
                    <p className="text-xs text-white/60 truncate max-w-[220px]">{selectedEntry?.title ?? 'Nothing selected'}</p>
                  </div>
                  <button
                    onClick={copySelectedPayload}
                    disabled={!selectedEntry?.payload}
                    className="app-button !h-9 !w-9 !p-0 disabled:opacity-30"
                    title="Copy payload"
                  >
                    <IconCopy size={14} />
                  </button>
                </div>
                <pre className="h-[526px] overflow-auto custom-scrollbar p-4 text-[11px] leading-relaxed text-white/45 whitespace-pre-wrap">
                  {selectedEntry?.payload ? JSON.stringify(selectedEntry.payload, null, 2) : 'Select a timeline row to inspect the payload.'}
                </pre>
              </aside>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-black uppercase tracking-normal text-white/40">{label}</span>
      {children}
    </label>
  )
}

function NumberInput({
  value,
  min,
  max,
  onChange
}: {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(event) => onChange(Math.min(max, Math.max(min, Number(event.target.value) || min)))}
      className="app-input !h-10 !text-xs font-mono"
    />
  )
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof IconActivity }) {
  return (
    <div className="app-section-card glass !p-4 flex items-center gap-3 min-w-0">
      <div className="h-10 w-10 rounded-lg border border-white/10 bg-white/[0.04] flex items-center justify-center text-[#d035f1] shrink-0">
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-normal text-white/30">{label}</p>
        <p className="text-xl font-black text-white tabular-nums">{value.toLocaleString()}</p>
      </div>
    </div>
  )
}

function ReplayStat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof IconActivity }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-2 min-w-0">
      <div className="flex items-center gap-1.5 text-white/25">
        <Icon size={12} />
        <span className="text-[9px] font-black uppercase tracking-normal">{label}</span>
      </div>
      <p className="mt-1 text-xs font-black text-white/70 truncate">{value}</p>
    </div>
  )
}

function AssertionReportCard({ report }: { report: ReplayAssertionReport }) {
  const clean = report.failed === 0
  return (
    <div className={`mt-3 rounded-xl border p-3 ${
      clean
        ? 'border-success/25 bg-success/10'
        : 'border-danger/25 bg-danger/10'
    }`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {clean ? <IconCircleCheck size={16} className="text-success shrink-0" /> : <IconAlertTriangle size={16} className="text-danger shrink-0" />}
          <div className="min-w-0">
            <p className="text-xs font-black text-white truncate">
              {clean ? 'Replay Test Passed' : 'Replay Test Needs Attention'}
            </p>
            <p className="text-[10px] font-bold text-white/35">
              {report.entriesAnalyzed} timeline entries analyzed
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-normal shrink-0">
          <span className="text-success">{report.passed} pass</span>
          <span className={report.failed > 0 ? 'text-danger' : 'text-white/25'}>{report.failed} fail</span>
          <span className={report.warnings > 0 ? 'text-warning' : 'text-white/25'}>{report.warnings} warn</span>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {report.results.map((result) => (
          <AssertionResultRow key={result.id} result={result} />
        ))}
      </div>
    </div>
  )
}

function AssertionResultRow({ result }: { result: ReplayAssertionResult }) {
  const statusClass =
    result.status === 'passed'
      ? 'border-success/25 bg-success/10 text-success'
      : result.status === 'failed'
        ? 'border-danger/25 bg-danger/10 text-danger'
        : 'border-warning/25 bg-warning/10 text-warning'

  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black text-white/80">{result.label}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-white/42">{result.detail}</p>
        </div>
        <span className={`rounded-md border px-2 py-1 text-[9px] font-black uppercase tracking-normal shrink-0 ${statusClass}`}>
          {result.status}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] font-bold text-white/30">
        <p className="truncate">Expected: {result.expected}</p>
        <p className="truncate">Observed: {result.observed}</p>
      </div>
    </div>
  )
}

function TimelineRow({
  entry,
  selected,
  onSelect,
  onReplay
}: {
  entry: EventLabEntry
  selected: boolean
  onSelect: () => void
  onReplay: () => void
}) {
  const tone = toneForKind(entry.kind)
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-lg border p-3 transition-all ${
        selected
          ? 'border-[#d035f1]/50 bg-[#d035f1]/10'
          : 'border-white/[0.06] bg-white/[0.025] hover:border-white/15 hover:bg-white/[0.04]'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-1 h-2.5 w-2.5 rounded-full shrink-0 ${tone}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-black uppercase tracking-normal text-white/30 shrink-0">
              {KIND_LABELS[entry.kind]}
            </span>
            {entry.platform && <span className="text-[10px] font-bold text-white/25 shrink-0">{entry.platform}</span>}
            <span className="text-[10px] font-mono text-white/20 ml-auto shrink-0">{formatTime(entry.timestamp)}</span>
          </div>
          <p className="mt-1 text-sm font-bold text-white/80 truncate">{entry.title}</p>
          <p className="mt-0.5 text-xs text-white/38 truncate">{entry.detail}</p>
        </div>
        {entry.replayable && (
          <span
            onClick={(event) => {
              event.stopPropagation()
              onReplay()
            }}
            className="h-8 w-8 rounded-lg border border-white/10 bg-black/30 flex items-center justify-center text-white/35 hover:text-white hover:border-[#d035f1]/40 transition-all shrink-0"
            title="Replay event"
          >
            <IconPlayerPlay size={13} />
          </span>
        )}
      </div>
    </button>
  )
}

function toneForKind(kind: EventLabEntryKind): string {
  switch (kind) {
    case 'stream': return 'bg-sky-300 shadow-[0_0_12px_rgba(125,211,252,0.4)]'
    case 'overlay': return 'bg-[#d035f1] shadow-[0_0_12px_rgba(208,53,241,0.35)]'
    case 'device': return 'bg-lime-300 shadow-[0_0_12px_rgba(190,242,100,0.35)]'
    case 'automation': return 'bg-violet-300 shadow-[0_0_12px_rgba(196,181,253,0.35)]'
    case 'alert': return 'bg-rose-300 shadow-[0_0_12px_rgba(253,164,175,0.35)]'
    case 'sound': return 'bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.35)]'
    case 'tts': return 'bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.35)]'
    case 'spotify': return 'bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.35)]'
    case 'status': return 'bg-white/35'
    default: return 'bg-white/20'
  }
}

function summarizePayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return String(payload ?? 'No payload')
  const data = payload as any
  if (data.type) return `type=${data.type}`
  if (data.payload?.type) return `payload.type=${data.payload.type}`
  if (Array.isArray(data.payload)) return `${data.payload.length} item(s)`
  if (Array.isArray(data)) return `${data.length} item(s)`
  return Object.keys(data).slice(0, 4).join(', ') || 'Object payload'
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 180)
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--:--:--'
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function waitForReplay(waitMs: number, shouldCancel: () => boolean): Promise<void> {
  const safeWaitMs = Math.min(60000, Math.max(0, waitMs))
  if (safeWaitMs === 0 || shouldCancel()) return Promise.resolve()

  return new Promise((resolve) => {
    const startedAt = Date.now()
    const tick = () => {
      if (shouldCancel() || Date.now() - startedAt >= safeWaitMs) {
        resolve()
        return
      }
      window.setTimeout(tick, Math.min(250, safeWaitMs - (Date.now() - startedAt)))
    }
    tick()
  })
}
