import type { ReactNode } from 'react'
import { IconActivity } from '@tabler/icons-react'
import { IconAlertTriangle, IconCircleCheck, IconPlayerPlay } from '../../components/ui/icons'
import type { EventLabEntry, EventLabEntryKind } from '../../stores/event-lab-store'
import type { ReplayAssertionReport, ReplayAssertionResult } from '../../lib/event-replay-assertions'
import { KIND_LABELS } from './EventLabPage.constants'
import { formatTime } from './EventLabPage.utils'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold tracking-normal text-white/40">{label}</span>
      {children}
    </label>
  )
}

export function NumberInput({
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

export function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof IconActivity }) {
  return (
    <div className="app-section-card glass !p-4 flex items-center gap-3 min-w-0">
      <div className="h-10 w-10 rounded-lg border border-white/10 bg-white/[0.04] flex items-center justify-center text-[#d035f1] shrink-0">
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold tracking-normal text-white/30">{label}</p>
        <p className="text-xl font-semibold text-white tabular-nums">{value.toLocaleString()}</p>
      </div>
    </div>
  )
}

export function ReplayStat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof IconActivity }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-2 min-w-0">
      <div className="flex items-center gap-1.5 text-white/25">
        <Icon size={12} />
        <span className="text-[9px] font-semibold tracking-normal">{label}</span>
      </div>
      <p className="mt-1 text-xs font-semibold text-white/70 truncate">{value}</p>
    </div>
  )
}

export function AssertionReportCard({ report }: { report: ReplayAssertionReport }) {
  const clean = report.failed === 0
  return (
    <div className={`mt-3 rounded-xl border p-3 ${clean ? 'border-success/25 bg-success/10' : 'border-danger/25 bg-danger/10'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {clean ? <IconCircleCheck size={16} className="text-success shrink-0" /> : <IconAlertTriangle size={16} className="text-danger shrink-0" />}
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white truncate">
              {clean ? 'Replay Test Passed' : 'Replay Test Needs Attention'}
            </p>
            <p className="text-[10px] font-semibold text-white/35">
              {report.entriesAnalyzed} timeline entries analyzed
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-semibold tracking-normal shrink-0">
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
          <p className="text-xs font-semibold text-white/80">{result.label}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-white/42">{result.detail}</p>
        </div>
        <span className={`rounded-md border px-2 py-1 text-[9px] font-semibold tracking-normal shrink-0 ${statusClass}`}>
          {result.status}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] font-semibold text-white/30">
        <p className="truncate">Expected: {result.expected}</p>
        <p className="truncate">Observed: {result.observed}</p>
      </div>
    </div>
  )
}

export function TimelineRow({
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
      className={`w-full text-left rounded-lg border p-3 transition-all ${selected ? 'border-[#d035f1]/50 bg-[#d035f1]/10' : 'border-white/[0.06] bg-white/[0.025] hover:border-white/15 hover:bg-white/[0.04]'}`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-1 h-2.5 w-2.5 rounded-full shrink-0 ${tone}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-semibold tracking-normal text-white/30 shrink-0">
              {KIND_LABELS[entry.kind]}
            </span>
            {entry.platform && <span className="text-[10px] font-semibold text-white/25 shrink-0">{entry.platform}</span>}
            <span className="text-[10px] font-mono text-white/20 ml-auto shrink-0">{formatTime(entry.timestamp)}</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-white/80 truncate">{entry.title}</p>
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
