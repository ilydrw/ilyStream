import React, { useEffect, useRef } from 'react'
import type { MeterFrame } from './utils'

export function MiniPeak({ id, meter }: { id: string; meter: MeterFrame }) {
  return (
    <div className="w-16 h-11 rounded-lg border border-white/[0.07] bg-black/45 px-2 py-1 flex items-end gap-1.5">
      <div
        className={`flex-1 rounded-sm bg-accent/70 meter-peak-l-${id}`}
        style={{ height: `${Math.max(4, meter.left * 100)}%` }}
      />
      <div
        className={`flex-1 rounded-sm bg-accent/45 meter-peak-r-${id}`}
        style={{ height: `${Math.max(4, meter.right * 100)}%` }}
      />
    </div>
  )
}

export function Spectrum({ id }: { id: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * window.devicePixelRatio
      canvas.height = rect.height * window.devicePixelRatio
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  return (
    <div className="h-32 rounded-2xl ring-1 ring-white/5 bg-black/40 overflow-hidden relative group">
      <div className="absolute inset-0 bg-gradient-to-t from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      <canvas
        id={`spectrum-canvas-${id}`}
        ref={canvasRef}
        className="w-full h-full"
      />
    </div>
  )
}
