interface PerformanceHUDProps {
  fps: number
  targetFps: number
  format: string
}

export function PerformanceHUD({ fps, targetFps, format }: PerformanceHUDProps) {
  return (
    <div className="absolute top-4 left-4 px-2 py-1 bg-black/60 rounded border border-white/10 flex items-center gap-2 pointer-events-none backdrop-blur-md z-10">
      <div className={`w-2 h-2 rounded-full ${fps >= (targetFps - 2) ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-amber-500 shadow-[0_0_8px_#f59e0b]'}`} />
      <span className="text-[10px] font-black tabular-nums text-white/90">{fps} FPS</span>
      <span className="text-[8px] font-bold text-white/25 uppercase tracking-tighter">{format}</span>
    </div>
  )
}
