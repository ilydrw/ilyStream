import { IconWindowMaximize, IconWindowMinimize, IconWindowClose } from '../ui/icons'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { getNavigationItem } from './navigation'
import { Logo } from '../ui/Logo'
import { UpdateBadge } from '../ui/UpdateBadge'
import { Tooltip } from '../ui/Tooltip'

export function Header() {
  const location = useLocation()
  const activeRoute = getNavigationItem(location.pathname)
  const Icon = activeRoute.icon

  return (
    <header className="app-topbar titlebar-drag">
      <div className="app-topbar-brand titlebar-no-drag" aria-label="ilyStream">
        <span className="app-topbar-logo">
          <Logo size={18} />
        </span>
        <span className="app-topbar-wordmark">ilyStream</span>
        <span className="app-topbar-version ml-2">0.0.19</span>
      </div>

      <div className="app-topbar-route" aria-live="polite">
        <span className="app-topbar-route-icon">
          <Icon size={16} />
        </span>
        <span>{activeRoute.label}</span>
      </div>

      <div className="app-topbar-spacer">
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
