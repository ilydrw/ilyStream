interface LoadingStateProps {
  label?: string
  className?: string
}

export function LoadingState({ label, className }: LoadingStateProps) {
  return (
    <div className={`flex-1 flex flex-col items-center justify-center gap-3 ${className || ''}`}>
      <div className="w-8 h-8 border-2 border-accent/20 border-t-accent rounded-full animate-spin" />
      {label && <p className="text-sm text-white/40">{label}</p>}
    </div>
  )
}
