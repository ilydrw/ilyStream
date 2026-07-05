interface PerformanceHUDProps {
  fps: number
  targetFps: number
  format: string
  codec?: string
}

function formatCaptureLabel(value: string): string {
  const normalized = value.toLowerCase()
  if (normalized === 'h264') return 'H.264'
  if (normalized === 'h265') return 'H.265'
  if (normalized === 'mjpeg') return 'MJPEG'
  if (normalized === 'bgra') return 'BGRA'
  return value.toUpperCase()
}

function formatCodecLabel(value?: string): string | null {
  if (!value) return null
  const normalized = value.toLowerCase()
  if (normalized === 'h264' || normalized.startsWith('avc1')) return 'H.264'
  if (normalized === 'h265' || normalized === 'hevc' || normalized.startsWith('hvc1') || normalized.startsWith('hev1')) return 'H.265'
  return formatCaptureLabel(value)
}

export function PerformanceHUD({ fps, targetFps, format, codec }: PerformanceHUDProps) {
  const codecLabel = formatCodecLabel(codec)
  const captureLabel = formatCaptureLabel(format)

  return (
    <div className="absolute top-4 right-4 px-4 py-2.5 bg-black/80 rounded-md border border-white/20 flex items-center gap-3 pointer-events-none z-10">
      <div className={`w-3 h-3 rounded-full ${fps >= (targetFps - 2) ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      <span className="text-[16px] font-black tabular-nums text-white leading-none">{fps} FPS</span>
      <span className="text-[12px] font-extrabold text-white/75 tracking-normal leading-none">{codecLabel || captureLabel}</span>
      {codecLabel && codecLabel !== captureLabel && (
        <span className="text-[10px] font-bold text-white/35 tracking-normal leading-none">IN {captureLabel}</span>
      )}
    </div>
  )
}
