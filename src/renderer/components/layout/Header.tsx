import { IconWindowMaximize, IconWindowMinimize, IconWindowClose } from '../ui/icons'
import { useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { getNavigationItem } from './navigation'
import { Logo } from '../ui/Logo'
import { UpdateBadge } from '../ui/UpdateBadge'
import { Tooltip } from '../ui/Tooltip'

export function Header() {
  const location = useLocation()
  const activeRoute = getNavigationItem(location.pathname)
  const Icon = activeRoute.icon
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    void window.api?.system?.getAppInfo?.()
      .then((info: { version?: string }) => setVersion(info.version ?? null))
      .catch(() => {})
  }, [])

  return (
    <header className="app-topbar titlebar-drag">
      <div className="app-topbar-brand titlebar-no-drag" aria-label="ilyStream">
        <span className="app-topbar-logo">
          <Logo size={18} />
        </span>
        <span className="app-topbar-wordmark">ilyStream</span>
        {version && <span className="app-topbar-version ml-2">{version}</span>}
      </div>

      <div className="app-topbar-route" aria-live="polite">
        <span className="app-topbar-route-icon">
          <Icon size={16} />
        </span>
        <span>{activeRoute.label}</span>
      </div>

      <div className="app-topbar-spacer titlebar-no-drag">
        <SystemStats />
        <UpdateBadge />
      </div>

      <div className="app-window-controls titlebar-no-drag">
        <Tooltip content="Minimize" position="bottom">
          <WindowButton label="Minimize" onClick={() => window.api?.window?.minimize()}>
            <IconWindowMinimize size={11} />
          </WindowButton>
        </Tooltip>
        <Tooltip content="Maximize / Restore" position="bottom">
          <WindowButton label="Maximize" onClick={() => window.api?.window?.maximize()}>
            <IconWindowMaximize size={10} />
          </WindowButton>
        </Tooltip>
        <Tooltip content="Close to Tray" position="bottom">
          <WindowButton label="Close" danger onClick={() => window.api?.window?.close()}>
            <IconWindowClose size={11} />
          </WindowButton>
        </Tooltip>
      </div>
    </header>
  )
}

const RESOURCE_POLL_MS = 2000

/**
 * Small OBS-style resource readout: total CPU share and working-set memory
 * across every ilyStream process. Polls only while the window is visible —
 * a minimized app should not wake itself up to measure how asleep it is.
 */
function SystemStats() {
  const [usage, setUsage] = useState<{ cpuPercent: number; memoryMB: number } | null>(null)

  useEffect(() => {
    const getResourceUsage = window.api?.system?.getResourceUsage
    if (!getResourceUsage) return

    let active = true
    const poll = () => {
      if (!active || document.hidden) return
      void getResourceUsage()
        .then((next) => { if (active) setUsage(next) })
        .catch(() => {})
    }

    poll()
    const timer = window.setInterval(poll, RESOURCE_POLL_MS)
    // Refresh immediately when the window comes back into view instead of
    // showing up-to-2s-stale numbers.
    document.addEventListener('visibilitychange', poll)
    return () => {
      active = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', poll)
    }
  }, [])

  if (!usage) return null

  const cpu = usage.cpuPercent
  const cpuLabel = cpu >= 9.95 ? Math.round(cpu).toString() : cpu.toFixed(1)
  const hot = cpu >= 80

  return (
    <div
      className="app-topbar-stats"
      title="CPU share and memory across all ilyStream processes"
      aria-label={`CPU ${cpuLabel} percent, memory ${formatMemory(usage.memoryMB)}`}
    >
      <span className={hot ? 'is-hot' : undefined}>CPU {cpuLabel}%</span>
      <span className="app-topbar-stats-sep" aria-hidden="true" />
      <span>{formatMemory(usage.memoryMB)}</span>
    </div>
  )
}

function formatMemory(memoryMB: number): string {
  if (memoryMB >= 1024) return `${(memoryMB / 1024).toFixed(1)} GB`
  return `${Math.round(memoryMB)} MB`
}

function WindowButton({
  onClick,
  children,
  danger = false,
  label
}: {
  onClick: () => void
  children: ReactNode
  danger?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`app-window-button ${danger ? 'is-danger' : ''}`}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  )
}
