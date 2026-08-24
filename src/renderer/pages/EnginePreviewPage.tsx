import { useEffect, useRef, useState } from 'react'

interface EngineFrame {
  width: number
  height: number
  data: Uint8Array | ArrayBuffer
}

/**
 * Live preview of the native bgfx engine. The primary path samples the
 * compositor's shared D3D11 output directly through Electron's VideoFrame
 * bridge; a pixel-buffer canvas path remains available as fallback.
 */
export default function EnginePreviewPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const framesRef = useRef(0)
  const fpsRef = useRef({ last: 0, count: 0 })
  const colorStatusRef = useRef('sRGB/Rec.709')
  const initialMonitorRef = useRef(0)
  const [status, setStatus] = useState('starting…')
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  const [monitors, setMonitors] = useState<Array<{ index: number; name: string; hdr: boolean }>>([])
  const [selectedMonitor, setSelectedMonitor] = useState<number>(0)
  const [monitorsLoaded, setMonitorsLoaded] = useState(false)
  const [previewReady, setPreviewReady] = useState(false)
  const [switchingMonitor, setSwitchingMonitor] = useState(false)

  const describeColor = (result: { source?: string; captureDescription?: { hdr?: boolean } }) =>
    result.captureDescription?.hdr
      ? 'HDR→SDR tone mapped'
      : result.source === 'screen-dxgi'
        ? 'sRGB/Rec.709'
        : 'sRGB fallback'
  
  useEffect(() => {
    window.api.engine.getCaptureDisplays().then((displays) => {
      setMonitors(displays.map((display) => {
        return {
          index: display.index,
          name: display.label && display.label !== display.deviceName
            ? `${display.name} · ${display.label}`
            : display.name,
          hdr: display.hdr
        }
      }))
      initialMonitorRef.current = displays[0]?.index ?? 0
      setSelectedMonitor(initialMonitorRef.current)
      setMonitorsLoaded(true)
    }).catch((e: any) => {
      console.error('Failed to get desktop sources', e)
      setMonitorsLoaded(true)
    })
  }, [])

  useEffect(() => {
    if (!monitorsLoaded) return
    let disposed = false
    let statsTimer: number | null = null
    const requested = { width: 1920, height: 1080, monitorIndex: initialMonitorRef.current }
    window.api.engine.attachPreview('ily-engine-preview')

    const draw = (frame: EngineFrame): void => {
      const canvas = canvasRef.current
      if (!canvas) return
      const bytes = frame.data instanceof Uint8Array ? frame.data : new Uint8Array(frame.data)
      // No IPC copy if read from shared memory via preload addon.
      const clamped = new Uint8ClampedArray(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength)
      const imageData = new ImageData(clamped, frame.width, frame.height)

      // Get the actual CSS display size of the canvas to scale down with high quality
      const rect = canvas.getBoundingClientRect()
      const cssWidth = Math.max(1, Math.floor(rect.width))
      const cssHeight = Math.max(1, Math.floor(rect.height))

      if (canvas.width !== cssWidth || canvas.height !== cssHeight) {
        canvas.width = cssWidth
        canvas.height = cssHeight
      }

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      createImageBitmap(imageData, {
        resizeWidth: cssWidth,
        resizeHeight: cssHeight,
        resizeQuality: 'high',
        colorSpaceConversion: 'none'
      }).then(bitmap => {
        try {
          ctx.drawImage(bitmap, 0, 0)
        } finally {
          bitmap.close()
        }
      }).catch(console.error)

      framesRef.current += 1
      // Measured display fps over a ~500ms window.
      const now = performance.now()
      const fr = fpsRef.current
      if (fr.last === 0) fr.last = now
      fr.count += 1
      if (now - fr.last >= 500) {
        const fps = Math.round((fr.count * 1000) / (now - fr.last))
        fr.count = 0
        fr.last = now
        setStatus(`live · ${fps} fps`)
      }
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
          const colorStatus = describeColor(r)
          colorStatusRef.current = colorStatus
          setPreviewReady(true)
          if (r.presentation === 'shared-texture') {
            setStatus(`live · GPU shared texture · ${colorStatus}`)
            statsTimer = window.setInterval(() => {
              const stats = window.api.engine.getPreviewStats()
              if (stats) setStatus(`live · GPU · ${stats.fps} fps · ${colorStatusRef.current}`)
            }, 500)
          } else {
            setStatus(`live · CPU fallback · ${colorStatus}`)
            requestAnimationFrame(pollFrame)
          }
        } else {
          setStatus('failed to start')
        }
      })
      .catch((e: unknown) => {
        setStatus(`error: ${e instanceof Error ? e.message : String(e)}`)
      })

    return () => {
      disposed = true
      if (statsTimer !== null) window.clearInterval(statsTimer)
      window.api.engine.detachPreview()
      window.api.engine.stopPreview().catch(() => {})
    }
  }, [monitorsLoaded])

  const selectMonitor = async (monitorIndex: number): Promise<void> => {
    const previousMonitor = selectedMonitor
    setSelectedMonitor(monitorIndex)
    if (!previewReady || switchingMonitor) return

    setSwitchingMonitor(true)
    setStatus('switching capture source…')
    try {
      const result = await window.api.engine.selectPreviewSource(monitorIndex)
      if (!result.ok) {
        throw new Error(result.error ?? 'Failed to switch capture source')
      }
      colorStatusRef.current = describeColor(result)
      const stats = window.api.engine.getPreviewStats()
      setStatus(
        `live · GPU · ${stats?.fps ?? 0} fps · ${colorStatusRef.current}`
      )
    } catch (error) {
      setSelectedMonitor(previousMonitor)
      setStatus(`error: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSwitchingMonitor(false)
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Native Engine Preview</h1>
        <p className="text-sm opacity-70 mb-4">
          Frames composited by the native bgfx engine and presented from a shared GPU texture.
        </p>
        
        {monitors.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm">Capture Source:</span>
            <select 
              className="bg-zinc-800 text-sm rounded px-2 py-1 outline-none"
              value={selectedMonitor}
              disabled={!previewReady || switchingMonitor}
              onChange={e => void selectMonitor(Number(e.target.value))}
            >
              {monitors.map((monitor) => (
                <option key={monitor.index} value={monitor.index}>
                  {monitor.name}{monitor.hdr ? ' · HDR' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="inline-block overflow-hidden rounded-lg border border-white/10 bg-black w-full max-w-5xl">
        <canvas
          id="ily-engine-preview"
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
