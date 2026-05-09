import { Minus, Square, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { getNavigationItem } from './navigation'

export function Header() {
  const location = useLocation()
  const activeRoute = getNavigationItem(location.pathname)
  const Icon = activeRoute.icon

  return (
    <header className="titlebar-drag shrink-0 bg-transparent z-50 flex items-start" style={{ height: '64px' }}>
      <div className="flex min-w-0 flex-1 items-center gap-3 px-6 h-full">
        {/* Route icon removed - moved to centered sub-nav or standardized header */}
      </div>

      <div className="titlebar-no-drag flex items-center gap-2.5" style={{ paddingRight: '40px', paddingTop: '24px' }}>
        <WindowButton color="#ffbd2e" onClick={() => window.api?.window?.minimize()} />
        <WindowButton color="#27c93f" onClick={() => window.api?.window?.maximize()} />
        <WindowButton color="#ff5f56" onClick={() => window.api?.window?.close()} />
      </div>
    </header>
  )
}

function WindowButton({
  onClick,
  color
}: {
  onClick: () => void
  color: string
}) {
  return (
    <button
      onClick={onClick}
      className="w-3 h-3 rounded-full transition-all duration-200 hover:opacity-70 active:scale-90"
      style={{ backgroundColor: color }}
    />
  )
}
