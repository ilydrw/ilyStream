import { IconMaximize, IconMinus, IconX } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { getNavigationItem } from './navigation'
import { Logo } from '../ui/Logo'

export function Header() {
  const location = useLocation()
  const activeRoute = getNavigationItem(location.pathname)
  const Icon = activeRoute.icon

  return (
    <header className="app-topbar titlebar-drag">
      <div className="app-topbar-brand titlebar-no-drag" aria-label="ilyStream">
        <span className="app-topbar-logo">
          <Logo size={28} />
        </span>
        <span className="app-topbar-wordmark !font-black !tracking-tight !text-[16px] bg-clip-text text-transparent bg-brand-gradient">ilyStream</span>
        <span className="app-topbar-version !bg-white/[0.05] !border-white/5 !text-white/20 !px-2.5 !py-0.5 !h-auto !rounded-md !font-black !text-[8px] !tracking-widest uppercase ml-2">Internal Alpha</span>
      </div>

      <div className="app-topbar-route" aria-live="polite">
        <span className="app-topbar-route-icon">
          <Icon size={16} />
        </span>
        <span>{activeRoute.label}</span>
      </div>

      <div className="app-topbar-spacer" />

      <div className="app-window-controls titlebar-no-drag">
        <WindowButton label="Minimize" onClick={() => window.api?.window?.minimize()}>
          <IconMinus size={15} />
        </WindowButton>
        <WindowButton label="Maximize" onClick={() => window.api?.window?.maximize()}>
          <IconMaximize size={14} />
        </WindowButton>
        <WindowButton label="Close" danger onClick={() => window.api?.window?.close()}>
          <IconX size={16} />
        </WindowButton>
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
