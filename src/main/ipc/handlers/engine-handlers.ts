import { BrowserWindow, ipcMain } from 'electron'
import { sendToRenderer } from '../safe-send'
import {
  NativeEngine,
  rectTransform,
  BlendMode,
  shutdownEngineSystem,
  type Layer
} from '../../engine/native-engine'

/**
 * Preview harness for the native bgfx engine: creates an engine, composites a
 * small animated scene each tick, reads the frame back, and streams it to the
 * renderer (channel 'engine:frame') for display on a <canvas>. This is the
 * end-to-end proof that the native compositor presents into the app window.
 *
 * readFrame() blocks briefly on the render thread, so the streaming interval
 * runs on the main event loop only for the preview; the real pipeline will
 * move frame delivery off the main thread.
 */
const PREVIEW_FPS = 30

let engine: NativeEngine | null = null
let timer: ReturnType<typeof setInterval> | null = null
let startMs = 0

function stopPreview(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  if (engine) {
    engine.destroy()
    engine = null
  }
}

export function registerEngineHandlers(window: BrowserWindow): void {
  ipcMain.handle(
    'engine:preview:start',
    (_event, opts?: { width?: number; height?: number }) => {
      stopPreview()
      const width = Math.max(16, Math.min(1920, Math.round(opts?.width ?? 640)))
      const height = Math.max(16, Math.min(1080, Math.round(opts?.height ?? 360)))

      engine = new NativeEngine({ width, height, fps: 60 })
      const green = engine.createColorTexture(0xff00ff00) // opaque green
      const magenta = engine.createColorTexture(0xffff00ff) // magenta

      startMs = Date.now()
      timer = setInterval(() => {
        if (!engine) return

        const t = (Date.now() - startMs) / 1000
        const qw = width * 0.4
        const qh = height * 0.5
        const gy = (height - qh) / 2
        // Magenta quad slides horizontally and overlaps the green one, so the
        // frame shows compositing + alpha blending in motion.
        const mx = width * 0.3 + Math.sin(t * 1.5) * width * 0.18

        const layers: Layer[] = [
          {
            texture: green,
            transform: rectTransform(width * 0.12, gy, qw, qh),
            opacity: 1,
            blendMode: BlendMode.Alpha
          },
          {
            texture: magenta,
            transform: rectTransform(mx, gy, qw, qh),
            opacity: 0.6,
            blendMode: BlendMode.Alpha
          }
        ]
        engine.setLayers(layers)

        const frame = engine.readFrame()
        if (frame) {
          sendToRenderer(window, 'engine:frame', {
            width: frame.width,
            height: frame.height,
            // Copy: frame.data is a reused buffer owned by the engine.
            data: Buffer.from(frame.data)
          })
        }
      }, Math.round(1000 / PREVIEW_FPS))

      return { ok: true, width, height }
    }
  )

  ipcMain.handle('engine:preview:stop', () => {
    stopPreview()
    return { ok: true }
  })
}

/** Stop any running preview and tear down the global engine system. */
export function disposeEnginePreview(): void {
  stopPreview()
  shutdownEngineSystem()
}
