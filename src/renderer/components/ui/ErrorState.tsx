import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react'

interface ErrorStateProps {
  title?: string
  detail?: string
  onRetry?: () => void
  className?: string
}

export function ErrorState({
  title = 'Something went wrong',
  detail,
  onRetry,
  className
}: ErrorStateProps) {
  return (
    <div className={`flex-1 flex flex-col items-center justify-center gap-4 p-8 ${className || ''}`}>
      <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center">
        <IconAlertTriangle size={24} className="text-danger" />
      </div>
      <div className="text-center space-y-1">
        <h3 className="text-base font-medium text-white/90">{title}</h3>
        {detail && <p className="text-sm text-white/40 max-w-md">{detail}</p>}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white/70 hover:text-white transition-colors"
        >
          <IconRefresh size={16} />
          Try again
        </button>
      )}
    </div>
  )
}
