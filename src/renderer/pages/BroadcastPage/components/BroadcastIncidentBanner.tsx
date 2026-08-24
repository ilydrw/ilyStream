import {
  IconAlertTriangle,
  IconCircleCheck,
  IconRefresh,
  IconX
} from '@tabler/icons-react'
import type { LiveReadinessIncident } from '../utils/live-readiness'

interface BroadcastIncidentBannerProps {
  error?: string | null
  incident?: LiveReadinessIncident | null
  onDismiss: () => void
}

export function BroadcastIncidentBanner({
  error,
  incident,
  onDismiss
}: BroadcastIncidentBannerProps) {
  if (!error && !incident) return null

  const presentation = error
    ? {
        tone: 'border-red-400/25 bg-red-400/[0.08] text-red-100',
        icon: <IconAlertTriangle size={16} className="text-red-300" />,
        title: 'Broadcast action failed',
        detail: error
      }
    : incident!.kind === 'failed'
      ? {
          tone: 'border-red-400/25 bg-red-400/[0.08] text-red-100',
          icon: <IconAlertTriangle size={16} className="text-red-300" />,
          title: `${incident!.outputName} stopped`,
          detail: incident!.message
        }
      : incident!.kind === 'reconnecting'
        ? {
            tone: 'border-amber-400/25 bg-amber-400/[0.08] text-amber-100',
            icon: <IconRefresh size={16} className="text-amber-300" />,
            title: `${incident!.outputName} is reconnecting`,
            detail: incident!.message
          }
        : {
            tone: 'border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-100',
            icon: <IconCircleCheck size={16} className="text-emerald-300" />,
            title: `${incident!.outputName} restarted`,
            detail: incident!.message
          }

  return (
    <div className={`mx-3 mt-2 flex shrink-0 items-start gap-2.5 rounded-md border px-3 py-2 ${presentation.tone}`} role="alert">
      <span className="mt-0.5 shrink-0">{presentation.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-white/90">{presentation.title}</p>
        <p className="mt-0.5 truncate text-[10px] text-white/50" title={presentation.detail}>
          {presentation.detail}
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss broadcast alert"
        className="grid h-6 w-6 shrink-0 place-items-center rounded text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white"
      >
        <IconX size={14} />
      </button>
    </div>
  )
}
