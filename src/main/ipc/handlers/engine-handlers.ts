import { BrowserWindow, ipcMain } from 'electron'
import { sendToRenderer } from '../safe-send'
import {
  NativeEngine,
  rectTransform,
  imageTransform,
  BlendMode,
  shutdownEngineSystem,
  type Layer
} from '../../engine/native-engine'

/**
 * Build a colorful RGBA8 image (diagonal cyan->magenta with a soft highlight)
 * to prove the compositor handles a real multi-pixel raster layer, not just
 * solid quads. Stands in for a camera/video/canvas frame uploaded from JS.
 */
function makeGradientImage(w: number, h: number): Buffer {
  const buf = Buffer.alloc(w * h * 4)
  const cx = w * 0.5
  const cy = h * 0.4
  const maxR = Math.hypot(w, h) * 0.6
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const u = x / w
      const v = y / h
      let r = 20 + u * 210
      let g = 200 * (1 - u) + v * 20
      let b = 255 - v * 120
      const d = Math.hypot(x - cx, y - cy) / maxR
      const hi = Math.max(0, 1 - d) ** 2 * 70
      buf[i] = Math.min(255, r + hi) | 0
      buf[i + 1] = Math.min(255, g + hi) | 0
      buf[i + 2] = Math.min(255, b + hi) | 0
      buf[i + 3] = 255
    }
  }
  return buf
}

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
      // Full-frame generated image (uploaded from JS) as the base layer, plus a
      // moving translucent quad on top to show blending over real pixels.
      const image = engine.createTextureFromPixels(width, height, makeGradientImage(width, height))
      const white = engine.createColorTexture(0xffffffff)

      startMs = Date.now()
      timer = setInterval(() => {
        if (!engine) return

        const t = (Date.now() - startMs) / 1000
        const qw = width * 0.28
        const qh = height * 0.55
        const qy = (height - qh) / 2
        // Translucent white bar slides across, compositing over the image.
        const qx = width * 0.5 + Math.sin(t * 1.2) * width * 0.32 - qw / 2

        const layers: Layer[] = [
          {
            texture: image,
            transform: imageTransform(0, 0),
            opacity: 1,
            blendMode: BlendMode.Alpha
          },
          {
            texture: white,
            transform: rectTransform(qx, qy, qw, qh),
            opacity: 0.35,
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
