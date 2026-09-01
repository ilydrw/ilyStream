import { useState } from 'react'
import { Link } from 'react-router-dom'
import { IconCheck, IconCircle, IconX } from '@tabler/icons-react'

interface GettingStartedChecklistProps {
  connected: boolean
  receivedEvent: boolean
  live: boolean
}

const STORAGE_KEY = 'ilystream:getting-started:dismissed:v1'

export function GettingStartedChecklist({ connected, receivedEvent, live }: GettingStartedChecklistProps) {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true')
  if (dismissed) return null

  const steps = [
    { label: 'Connect a live platform', to: '/health', complete: connected },
    { label: 'Verify inbound chat and event health', to: '/health', complete: receivedEvent },
    { label: 'Choose and preview an output', to: '/broadcast', complete: false },
    { label: 'Run a test event', to: '/event-lab', complete: receivedEvent },
    { label: 'Review readiness and go live', to: '/broadcast', complete: live }
  ]
  const completed = steps.filter((step) => step.complete).length

  return (
    <section className="app-section-card glass mb-6 p-5" aria-labelledby="getting-started-title">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">First run</p>
          <h2 id="getting-started-title" className="mt-1 text-base font-semibold text-white">Get ready for your first stream</h2>
          <p className="mt-1 text-xs text-white/45">{completed} of {steps.length} readiness steps complete</p>
        </div>
        <button
          type="button"
          aria-label="Dismiss getting started checklist"
          onClick={() => {
            localStorage.setItem(STORAGE_KEY, 'true')
            setDismissed(true)
          }}
          className="rounded-md p-1.5 text-white/35 transition-colors hover:bg-white/[0.06] hover:text-white/70"
        >
          <IconX size={16} />
        </button>
      </div>
      <ol className="grid gap-2 md:grid-cols-5">
        {steps.map((step, index) => (
          <li key={step.label}>
            <Link
              to={step.to}
              className="flex h-full items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.025] p-3 transition-colors hover:border-white/[0.12] hover:bg-white/[0.045]"
            >
              {step.complete
                ? <IconCheck size={16} className="mt-0.5 shrink-0 text-success" />
                : <IconCircle size={16} className="mt-0.5 shrink-0 text-white/25" />}
              <span className="text-xs leading-5 text-white/65"><span className="text-white/30">{index + 1}.</span> {step.label}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}
