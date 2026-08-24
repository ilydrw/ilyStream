import {
  IconAlertTriangle,
  IconChecklist,
  IconCircleCheck,
  IconCopy,
  IconHistory,
  IconLoader2,
  IconRefresh,
  IconX
} from '@tabler/icons-react'
import type {
  LiveReadinessCheck,
  LiveReadinessIncident,
  LiveReadinessReport,
  LiveReadinessTone
} from '../utils/live-readiness'

interface LiveReadinessPanelProps {
  report: LiveReadinessReport
  refreshing: boolean
  incidents: LiveReadinessIncident[]
  onRefresh: () => void
  onCopyDiagnostic: () => void
  onClose: () => void
}

const toneClasses: Record<LiveReadinessTone, string> = {
  ready: 'border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200',
  warning: 'border-amber-400/20 bg-amber-400/[0.06] text-amber-100',
  blocked: 'border-red-400/20 bg-red-400/[0.06] text-red-100',
  checking: 'border-sky-400/20 bg-sky-400/[0.06] text-sky-100'
}

function StatusIcon({ check }: { check: LiveReadinessCheck }) {
  if (check.tone === 'ready') return <IconCircleCheck size={17} className="text-emerald-300" />
  if (check.tone === 'checking') return <IconLoader2 size={17} className="animate-spin text-sky-300" />
  return <IconAlertTriangle size={17} className={check.tone === 'blocked' ? 'text-red-300' : 'text-amber-300'} />
}

export function LiveReadinessPanel({
  report,
  refreshing,
  incidents,
  onRefresh,
  onCopyDiagnostic,
  onClose
}: LiveReadinessPanelProps) {
  const summary = report.blockerCount > 0
    ? `${report.blockerCount} issue${report.blockerCount === 1 ? '' : 's'} must be fixed`
    : report.warningCount > 0 || report.checkingCount > 0
      ? 'Ready with checks'
      : 'Ready to go live'

  return (
    <section
      className="absolute right-0 top-[calc(100%+10px)] z-[620] w-[min(430px,calc(100vw-24px))] overflow-hidden rounded-lg border border-white/[0.1] bg-[#11151d]/98 text-left shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl"
      aria-label="Live readiness"
    >
      <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] px-4 py-3.5">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md border ${toneClasses[report.tone]}`}>
            <IconChecklist size={19} />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-white">Live Readiness</p>
            <p className="mt-0.5 text-[11px] text-white/45">{summary}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-white/35 transition-colors hover:bg-white/[0.07] hover:text-white"
          aria-label="Close live readiness"
        >
          <IconX size={16} />
        </button>
      </div>

      <div className="max-h-[min(60vh,520px)] space-y-2 overflow-y-auto p-3">
        {report.checks.map(check => (
          <div key={check.id} className={`rounded-md border px-3 py-2.5 ${toneClasses[check.tone]}`}>
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 shrink-0"><StatusIcon check={check} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] opacity-55">{check.label}</span>
                  {check.blocksGoLive && check.tone === 'blocked' && (
                    <span className="rounded border border-current/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] opacity-70">
                      Required
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[12px] font-semibold leading-5 text-white/90">{check.summary}</p>
                <p className="mt-0.5 text-[10px] leading-4 text-white/45">{check.detail}</p>
              </div>
            </div>
          </div>
        ))}

        {incidents.length > 0 && (
          <div className="mt-3 rounded-md border border-white/[0.08] bg-white/[0.025]">
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5 text-white/55">
              <IconHistory size={14} />
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">Recent output events</span>
            </div>
            <div className="divide-y divide-white/[0.05]">
              {incidents.slice(-6).reverse().map(incident => (
                <div key={incident.id} className="flex items-start gap-2.5 px-3 py-2.5">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-sm ${
                    incident.kind === 'failed'
                      ? 'bg-red-400'
                      : incident.kind === 'reconnecting'
                        ? 'bg-amber-400'
                        : incident.kind === 'recovered'
                          ? 'bg-emerald-400'
                          : 'bg-white/25'
                  }`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-[10px] font-semibold text-white/75">{incident.outputName}</p>
                      <time className="shrink-0 text-[9px] text-white/30">
                        {new Date(incident.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </time>
                    </div>
                    <p className="mt-0.5 text-[10px] capitalize text-white/45">{incident.kind}</p>
                    <p className="mt-0.5 break-words text-[10px] leading-4 text-white/35">{incident.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-white/[0.07] bg-black/15 px-3 py-3">
        <button
          type="button"
          onClick={onCopyDiagnostic}
          className="app-button !h-8 !px-3 text-[10px]"
        >
          <IconCopy size={13} /> Copy report
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="app-button !h-8 !px-3 text-[10px]"
        >
          <IconRefresh size={13} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Checking' : 'Refresh'}
        </button>
      </div>
    </section>
  )
}
