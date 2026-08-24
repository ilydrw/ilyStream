import type { Dispatch, SetStateAction } from 'react'
import { IconActivity, IconBook2, IconClock, IconFileImport, IconPlayerTrackNext, IconReportAnalytics } from '@tabler/icons-react'
import { IconCopy, IconPlayerPlay, IconPlayerStop, IconTrash } from '../../components/ui/icons'
import type { EventReplayRecording, EventReplaySession, ActiveReplayState } from '../../lib/event-replay'
import { formatReplayDuration } from '../../lib/event-replay'
import type { ReplayAssertionReport } from '../../lib/event-replay-assertions'
import { REPLAY_SPEEDS } from './EventLabPage.constants'
import { AssertionReportCard, ReplayStat } from './EventLabPage.widgets'

interface ReplayStudioPanelProps {
  recording: EventReplayRecording | null
  replaySessions: EventReplaySession[]
  selectedReplaySession: EventReplaySession | null
  activeReplay: ActiveReplayState | null
  captureName: string
  setCaptureName: Dispatch<SetStateAction<string>>
  replaySpeed: number
  setReplaySpeed: Dispatch<SetStateAction<number>>
  stepIndex: number
  setSelectedSessionId: Dispatch<SetStateAction<string | null>>
  replayNotice: string | null
  importText: string
  setImportText: Dispatch<SetStateAction<string>>
  lastAssertionReport: ReplayAssertionReport | null
  isRunningAssertions: boolean
  onStartCapture: () => void
  onStopCapture: () => void
  onDiscardCapture: () => void
  onRunReplay: (session: EventReplaySession) => void | Promise<unknown>
  onStopReplay: () => void
  onStepReplay: (session: EventReplaySession) => void | Promise<unknown>
  onRunAssertions: (session: EventReplaySession) => void | Promise<unknown>
  onCopyReplay: (session: EventReplaySession) => void | Promise<unknown>
  onDeleteReplay: (session: EventReplaySession) => void
  onImportReplayText: () => void
}

export function ReplayStudioPanel({
  recording,
  replaySessions,
  selectedReplaySession,
  activeReplay,
  captureName,
  setCaptureName,
  replaySpeed,
  setReplaySpeed,
  stepIndex,
  setSelectedSessionId,
  replayNotice,
  importText,
  setImportText,
  lastAssertionReport,
  isRunningAssertions,
  onStartCapture,
  onStopCapture,
  onDiscardCapture,
  onRunReplay,
  onStopReplay,
  onStepReplay,
  onRunAssertions,
  onCopyReplay,
  onDeleteReplay,
  onImportReplayText
}: ReplayStudioPanelProps) {
  return (
    <section className="app-section-card glass !p-0 overflow-hidden">
      <div className="app-section-head">
        <div className="flex items-center gap-3 min-w-0">
          <IconBook2 size={22} className="text-[#d035f1] shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-white">Event replay studio</h2>
            <p>Capture real bursts, save them, then replay the exact timing against the local pipeline.</p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {replayNotice && (
          <div className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-semibold text-white/50">
            {replayNotice}
          </div>
        )}

        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-[10px] font-semibold tracking-normal text-white/30">Capture</p>
              <p className="text-sm font-semibold text-white">
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
              <button onClick={onStartCapture} className="app-button-primary !h-10 text-[10px] font-semibold tracking-normal">
                <IconPlayerPlay size={14} className="mr-2" />
                Start capture
              </button>
            ) : (
              <button onClick={onStopCapture} className="app-button-primary !h-10 text-[10px] font-semibold tracking-normal">
                <IconPlayerStop size={14} className="mr-2" />
                Save Capture
              </button>
            )}
            <button
              onClick={onDiscardCapture}
              disabled={!recording}
              className="app-button-danger !h-10 text-[10px] font-semibold tracking-normal disabled:opacity-35"
            >
              Discard
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-[10px] font-semibold tracking-normal text-white/30">Replay Session</p>
              <p className="text-sm font-semibold text-white truncate max-w-[250px]">
                {selectedReplaySession?.name ?? 'No saved replay'}
              </p>
            </div>
            {selectedReplaySession && (
              <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[9px] font-semibold tracking-normal text-white/35">
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
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] p-3 text-xs font-semibold text-white/30 mb-3">
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
                {REPLAY_SPEEDS.map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    onClick={() => setReplaySpeed(speed)}
                    className={`h-8 rounded-lg border text-[10px] font-semibold transition-all ${replaySpeed === speed ? 'border-[#d035f1]/50 bg-[#d035f1]/15 text-white' : 'border-white/10 bg-white/[0.03] text-white/35 hover:text-white'}`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {!activeReplay?.running ? (
                  <button
                    onClick={() => void onRunReplay(selectedReplaySession)}
                    disabled={isRunningAssertions}
                    className="app-button-primary !h-10 text-[10px] font-semibold tracking-normal disabled:opacity-35"
                  >
                    <IconPlayerPlay size={14} className="mr-2" />
                    Play
                  </button>
                ) : (
                  <button onClick={onStopReplay} className="app-button-danger !h-10 text-[10px] font-semibold tracking-normal">
                    <IconPlayerStop size={14} className="mr-2" />
                    Stop
                  </button>
                )}
                <button
                  onClick={() => void onStepReplay(selectedReplaySession)}
                  disabled={Boolean(activeReplay?.running) || isRunningAssertions}
                  className="app-button !h-10 text-[10px] font-semibold tracking-normal disabled:opacity-35"
                >
                  <IconPlayerTrackNext size={14} className="mr-2" />
                  Step
                </button>
                <button
                  onClick={() => void onRunAssertions(selectedReplaySession)}
                  disabled={Boolean(activeReplay?.running) || isRunningAssertions}
                  className="app-button-primary !h-10 text-[10px] font-semibold tracking-normal disabled:opacity-35"
                >
                  <IconReportAnalytics size={14} className="mr-2" />
                  {isRunningAssertions ? 'Testing' : 'Run Test'}
                </button>
                <button onClick={() => void onCopyReplay(selectedReplaySession)} className="app-button !h-10 text-[10px] font-semibold tracking-normal">
                  <IconCopy size={14} className="mr-2" />
                  Copy
                </button>
                <button
                  onClick={() => onDeleteReplay(selectedReplaySession)}
                  className="app-button-danger !h-10 text-[10px] font-semibold tracking-normal"
                >
                  <IconTrash size={14} className="mr-2" />
                  Delete
                </button>
              </div>

              {activeReplay?.sessionId === selectedReplaySession.id && (
                <div className="mt-3 rounded-lg border border-[#d035f1]/25 bg-[#d035f1]/10 p-3">
                  <div className="flex items-center justify-between text-[10px] font-semibold tracking-normal text-white/55">
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
            <p className="text-xs font-semibold text-white">Import Replay JSON</p>
          </div>
          <textarea
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            className="app-input min-h-[92px] !py-3 !text-xs font-mono resize-none"
            placeholder='Paste {"schemaVersion":1,"name":"...","events":[...]}'
          />
          <button
            onClick={onImportReplayText}
            disabled={importText.trim().length === 0}
            className="app-button-primary mt-3 w-full !h-10 text-[10px] font-semibold tracking-normal disabled:opacity-35"
          >
            Review & Import
          </button>
        </div>
      </div>
    </section>
  )
}
