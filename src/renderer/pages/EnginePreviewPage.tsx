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
  
  const [monitors, setMonitors] = useState<{ id: string, name: string }[]>([])
  const [selectedMonitor, setSelectedMonitor] = useState<number>(0)
  const [monitorsLoaded, setMonitorsLoaded] = useState(false)
  
  useEffect(() => {
    // Fetch available screens
    window.api.studio.getDesktopSources().then((sources: any[]) => {
      const screens = sources.filter(s => s.type === 'screen')
      setMonitors(screens.map(s => ({ id: s.id, name: s.name })))
      setMonitorsLoaded(true)
    }).catch((e: any) => {
      console.error('Failed to get desktop sources', e)
      setMonitorsLoaded(true)
    })
  }, [])

  useEffect(() => {
    if (!monitorsLoaded) return
    let disposed = false
    const requested = { width: 1920, height: 1080, monitorIndex: selectedMonitor }

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
      // No copy: view the IPC-delivered buffer directly (it's a plain, non-shared
      // ArrayBuffer) to avoid an 8MB copy per frame.
      const clamped = new Uint8ClampedArray(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength)
      ctx.putImageData(new ImageData(clamped, frame.width, frame.height), 0, 0)

      framesRef.current += 1
      if (framesRef.current % 15 === 0) setStatus(`live · ${framesRef.current} frames`)
    }

    const pollFrame = async () => {
      if (disposed) return
      try {
        const frame = await window.api.engine.requestFrame()
        if (frame && !disposed) {
          draw(frame)
        }
      } catch (e) {
        console.error('Frame poll error:', e)
      }
      if (!disposed) {
        requestAnimationFrame(pollFrame)
      }
    }

    window.api.engine
      .startPreview(requested)
      .then((r) => {
        if (disposed) return
        if (r?.ok) {
          setSize({ width: r.width, height: r.height })
          setStatus('live')
          // Start polling for frames
          requestAnimationFrame(pollFrame)
        } else {
          setStatus('failed to start')
        }
      })
      .catch((e: unknown) => {
        setStatus(`error: ${e instanceof Error ? e.message : String(e)}`)
      })

    return () => {
      disposed = true
      window.api.engine.stopPreview().catch(() => {})
    }
  }, [selectedMonitor, monitorsLoaded])

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Native Engine Preview</h1>
        <p className="text-sm opacity-70 mb-4">
          Frames composited by the native bgfx engine, read back as RGBA and drawn to a canvas.
        </p>
        
        {monitors.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm">Capture Source:</span>
            <select 
              className="bg-zinc-800 text-sm rounded px-2 py-1 outline-none"
              value={selectedMonitor}
              onChange={e => setSelectedMonitor(Number(e.target.value))}
            >
              {monitors.map((m, idx) => (
                <option key={m.id} value={idx}>{m.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="inline-block overflow-hidden rounded-lg border border-white/10 bg-black w-full max-w-5xl">
        <canvas
          ref={canvasRef}
          className="w-full h-auto aspect-video"
          style={{ display: 'block' }}
        />
      </div>
      <div className="text-xs opacity-60">
        {status}
        {size ? ` · ${size.width}×${size.height}` : ''}
      </div>
    </div>
  )
}
