import React, { useEffect, useRef } from 'react'
import type { MeterFrame } from './utils'

export function MiniPeak({ id, meter }: { id: string; meter: MeterFrame }) {
  return (
    <div className="flex w-32 shrink-0 flex-col gap-1.5" aria-hidden="true">
      {(['left', 'right'] as const).map(side => {
        const suffix = side === 'left' ? 'l' : 'r'
        return (
          <div
            key={side}
            className="relative h-2 overflow-hidden rounded-full border border-white/[0.07] bg-black/45"
          >
            <div
              className={`absolute inset-y-0 left-0 rounded-full bg-accent meter-hpeak-${suffix}-${id}`}
              style={{ width: `${Math.max(4, meter[side] * 100)}%` }}
            />
            <div
              className={`absolute inset-y-0 right-0 w-2 rounded-full bg-red-500 opacity-0 transition-opacity duration-75 meter-clip-indicator-${suffix}-${id}`}
            />
          </div>
        )
      })}
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
    <div className="h-32 rounded-md ring-1 ring-white/5 bg-black/40 overflow-hidden relative group">
      <div className="absolute inset-0 bg-gradient-to-t from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      <canvas
        id={`spectrum-canvas-${id}`}
        ref={canvasRef}
        className="w-full h-full"
      />
    </div>
  )
}
