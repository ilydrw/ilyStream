import { useEffect, useRef, useState } from 'react'

interface EngineFrame {
  width: number
  height: number
  data: Uint8Array | ArrayBuffer
}

/**
 * Live preview of the native bgfx engine. The main process composites frames
 * off-thread, reads them back as RGBA, and streams them on 'engine:frame';
 * here we draw each frame straight onto a <canvas>.
 */
export default function EnginePreviewPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const framesRef = useRef(0)
  const [status, setStatus] = useState('starting…')
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    let disposed = false
    const requested = { width: 640, height: 360 }

    const draw = (frame: EngineFrame): void => {
      const canvas = canvasRef.current
      if (!canvas) return
      if (canvas.width !== frame.width || canvas.height !== frame.height) {
        canvas.width = frame.width
        canvas.height = frame.height
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const bytes = frame.data instanceof Uint8Array ? frame.data : new Uint8Array(frame.data)
      // Copy into a fresh (non-shared) buffer so it satisfies ImageData's type.
      const clamped = new Uint8ClampedArray(bytes)
      ctx.putImageData(new ImageData(clamped, frame.width, frame.height), 0, 0)

      framesRef.current += 1
      if (framesRef.current % 15 === 0) setStatus(`live · ${framesRef.current} frames`)
    }

    const unsubscribe = window.api.on('engine:frame', (frame: EngineFrame) => {
      if (!disposed) draw(frame)
    })

    window.api.engine
      .startPreview(requested)
      .then((r) => {
        if (disposed) return
        if (r?.ok) {
          setSize({ width: r.width, height: r.height })
          setStatus('live')
        } else {
          setStatus('failed to start')
        }
      })
      .catch((e: unknown) => {
        setStatus(`error: ${e instanceof Error ? e.message : String(e)}`)
      })

    return () => {
      disposed = true
      unsubscribe?.()
      window.api.engine.stopPreview().catch(() => {})
    }
  }, [])

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Native Engine Preview</h1>
        <p className="text-sm opacity-70">
          Frames composited by the native bgfx engine, read back as RGBA and drawn to a canvas.
        </p>
      </div>
      <div className="inline-block overflow-hidden rounded-lg border border-white/10 bg-black">
        <canvas
          ref={canvasRef}
          width={640}
          height={360}
          style={{ display: 'block', width: 640, height: 360 }}
        />
      </div>
      <div className="text-xs opacity-60">
        {status}
        {size ? ` · ${size.width}×${size.height}` : ''}
      </div>
    </div>
  )
}
