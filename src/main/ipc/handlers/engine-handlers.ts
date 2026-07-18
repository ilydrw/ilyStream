import { BrowserWindow, ipcMain, desktopCapturer } from 'electron'
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
 * Live preview of the native engine driven by a REAL capture source. Each tick
 * grabs a screen frame (desktopCapturer, main process), uploads its pixels into
 * the engine (createTextureFromPixels), composites a translucent overlay badge
 * on top, reads the composited frame back and streams it to the renderer
 * <canvas>. This is the actual broadcast shape: a live source + an overlay,
 * composited natively.
 *
 * Frames go through create/destroy per tick (bounded — the previous frame's
 * texture is released once it is no longer the active layer). readFrame blocks
 * briefly on the render thread; fine for a preview, a production path would move
 * frame delivery off the main thread.
 */
const PREVIEW_FPS = 15

let engine: NativeEngine | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let running = false
let prevTexture: bigint | null = null

function stopPreview(): void {
  running = false
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  prevTexture = null
  if (engine) {
    engine.destroy()
    engine = null
  }
}

export function registerEngineHandlers(window: BrowserWindow): void {
  ipcMain.handle(
    'engine:preview:start',
    async (_event, opts?: { width?: number; height?: number }) => {
      stopPreview()
      const width = Math.max(16, Math.min(1920, Math.round(opts?.width ?? 640)))
      const height = Math.max(16, Math.min(1080, Math.round(opts?.height ?? 360)))

      const eng = new NativeEngine({ width, height, fps: 60 })
      engine = eng
      running = true

      // Overlay graphic composited on top of the live source (bottom-right).
      const badge = eng.createColorTexture(0x19c8ffff) // brand cyan
      const badgeW = Math.round(width * 0.26)
      const badgeH = Math.round(height * 0.12)

      const intervalMs = Math.round(1000 / PREVIEW_FPS)

      const tick = async (): Promise<void> => {
        if (!running || engine !== eng) return
        const startedAt = Date.now()
        try {
          const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width, height }
          })
          if (running && engine === eng && sources[0]) {
            const thumb = sources[0].thumbnail
            const size = thumb.getSize()
            const bmp = thumb.toBitmap() // BGRA on Windows
            // BGRA -> RGBA in place (engine expects RGBA8).
            for (let i = 0; i + 2 < bmp.length; i += 4) {
              const b = bmp[i]
              bmp[i] = bmp[i + 2]
              bmp[i + 2] = b
            }

            const frameTex = eng.createTextureFromPixels(size.width, size.height, bmp)
            const layers: Layer[] = [
              { texture: frameTex, transform: imageTransform(0, 0), opacity: 1, blendMode: BlendMode.Alpha },
              {
                texture: badge,
                transform: rectTransform(width - badgeW - 16, height - badgeH - 16, badgeW, badgeH),
                opacity: 0.55,
                blendMode: BlendMode.Alpha
              }
            ]
            eng.setLayers(layers)

            const frame = eng.readFrame()
            if (frame) {
              sendToRenderer(window, 'engine:frame', {
                width: frame.width,
                height: frame.height,
                data: Buffer.from(frame.data)
              })
            }

            // Release the previous frame's texture; it is no longer the active
            // layer (we just replaced it above).
            if (prevTexture !== null) eng.destroyTexture(prevTexture)
            prevTexture = frameTex
          }
        } catch (err) {
          process.stderr.write(`[engine-preview] capture failed: ${(err as Error).message}\n`)
        }

        if (running && engine === eng) {
          const elapsed = Date.now() - startedAt
          timer = setTimeout(tick, Math.max(0, intervalMs - elapsed))
        }
      }

      void tick()
      return { ok: true, width, height, source: 'screen' }
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
