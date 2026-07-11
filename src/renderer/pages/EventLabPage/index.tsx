import { useEffect, useMemo, useRef, useState } from 'react'
import { IconSend } from '@tabler/icons-react'
import { IconTrash, IconTerminal as EventLabIcon } from '../../components/ui/icons'
import { PageHeader } from '../../components/layout/PageHeader'
import {
  createEventLabId,
  type EventLabEntry,
  type EventLabEntryKind,
  useEventLabStore
} from '../../stores/event-lab-store'
import type { EventLabSimulationPayload } from '../../../shared/event-lab'
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
  type ReplayAssertionReport
} from '../../lib/event-replay-assertions'
import { EventBuilderPanel } from './EventBuilderPanel'
import { EventTimelinePanel } from './EventTimelinePanel'
import { ReplayStudioPanel } from './ReplayStudioPanel'
import { waitForReplay } from './EventLabPage.utils'
import { useEventLabSubscriptions } from './useEventLabSubscriptions'

const DEFAULT_DRAFT: EventLabSimulationPayload = {
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
  const [draft, setDraft] = useState<EventLabSimulationPayload>(DEFAULT_DRAFT)

  useEventLabSubscriptions(addEntry)

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
        icon={EventLabIcon}
        description="Inspect stream events, overlay broadcasts, alert actions, audio cues, Spotify updates, and DeskThing packets as they move through ilyStream."
        actions={
          <div className="flex items-center gap-2">
            <button className="app-button !h-11 text-xs font-semibold" onClick={() => void fireEvent()}>
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
          <EventBuilderPanel draft={draft} setDraft={setDraft} onFireEvent={fireEvent} />
          <ReplayStudioPanel
            recording={recording}
            replaySessions={replaySessions}
            selectedReplaySession={selectedReplaySession}
            activeReplay={activeReplay}
            captureName={captureName}
            setCaptureName={setCaptureName}
            replaySpeed={replaySpeed}
            setReplaySpeed={setReplaySpeed}
            stepIndex={stepIndex}
            setSelectedSessionId={setSelectedSessionId}
            replayNotice={replayNotice}
            importText={importText}
            setImportText={setImportText}
            lastAssertionReport={lastAssertionReport}
            isRunningAssertions={isRunningAssertions}
            onStartCapture={startCapture}
            onStopCapture={stopCapture}
            onDiscardCapture={discardCapture}
            onRunReplay={runReplaySession}
            onStopReplay={stopReplay}
            onStepReplay={stepReplaySession}
            onRunAssertions={runReplayAssertions}
            onCopyReplay={copyReplaySession}
            onDeleteReplay={(session) => {
              deleteReplaySession(session.id)
              setReplayNotice(`Deleted "${session.name}".`)
            }}
            onImportReplayText={importReplayText}
          />
        </div>

        <EventTimelinePanel
          entries={entries}
          filteredEntries={filteredEntries}
          selectedEntry={selectedEntry}
          counts={counts}
          kindFilter={kindFilter}
          setKindFilter={setKindFilter}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onSelectEntry={setSelectedEntryId}
          onReplayEntry={replayEntry}
          onCopySelectedPayload={copySelectedPayload}
        />
      </div>
    </div>
  )
}
