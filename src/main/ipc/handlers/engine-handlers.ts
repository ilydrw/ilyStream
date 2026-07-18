import { BrowserWindow, ipcMain, desktopCapturer } from 'electron'
import {
  NativeEngine,
  imageTransform,
  BlendMode,
  shutdownEngineSystem,
  type Layer
} from '../../engine/native-engine'

/**
 * Live preview of the native engine.
 *
 * Primary capture path is NATIVE DXGI Desktop Duplication (createScreenCapture):
 * a dedicated capture thread grabs the desktop straight into a GPU texture at
 * refresh rate — the real high-fps path (the engine composites + reads back in
 * ms; see bench.cjs: 156fps @1080p). If DXGI is unavailable (e.g. RDP), we fall
 * back to Electron's desktopCapturer, which caps ~15-30fps.
 *
 * Either way the renderer PULLS the latest composited frame (engine:preview:frame)
 * on its own clock, so the readback + IPC cost self-paces. Note: preview display
 * fps over IPC is separately limited by the ~8MB/frame readback+copy at 1080p —
 * a zero-copy/shared-texture present is the next transport optimization.
 */
const OUTPUT_FPS = 144
const FALLBACK_CAPTURE_FPS = 30

let engine: NativeEngine | null = null
let captureTimer: ReturnType<typeof setTimeout> | null = null
let running = false

function stopPreview(): void {
  running = false
  if (captureTimer) {
    clearTimeout(captureTimer)
    captureTimer = null
  }
  if (engine) {
    engine.destroy() // also stops any native DXGI capture thread it owns
    engine = null
  }
}

// desktopCapturer fallback: refresh one reused source texture in place.
function startDesktopCapturerFallback(
  eng: NativeEngine,
  width: number,
  height: number,
  monitorIndex: number
): void {
  let sourceTex: bigint | null = null
  let srcW = 0
  let srcH = 0
  const captureMs = Math.round(1000 / FALLBACK_CAPTURE_FPS)

  const capture = async (): Promise<void> => {
    if (!running || engine !== eng) return
    const startedAt = Date.now()
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width, height }
      })
      const source = sources[monitorIndex] ?? sources[0]
      if (running && engine === eng && source) {
        const thumb = source.thumbnail
        const size = thumb.getSize()
        const bmp = thumb.toBitmap() // BGRA on Windows
        // Swizzle BGRA -> RGBA (the RGBA upload path); the DXGI path uploads
        // BGRA natively instead.
        for (let i = 0; i + 2 < bmp.length; i += 4) {
          const b = bmp[i]
          bmp[i] = bmp[i + 2]
          bmp[i + 2] = b
        }
        if (sourceTex === null || srcW !== size.width || srcH !== size.height) {
          if (sourceTex !== null) eng.destroyTexture(sourceTex)
          sourceTex = eng.createTextureFromPixels(size.width, size.height, bmp)
          srcW = size.width
          srcH = size.height
          eng.setLayers([{ texture: sourceTex, transform: imageTransform(0, 0), opacity: 1, blendMode: BlendMode.Alpha }])
        } else {
          eng.updateTexture(sourceTex, bmp)
        }
      }
    } catch (err) {
      process.stderr.write(`[engine-preview] desktopCapturer failed: ${(err as Error).message}\n`)
    }
    if (running && engine === eng) {
      captureTimer = setTimeout(capture, Math.max(0, captureMs - (Date.now() - startedAt)))
    }
  }
  void capture()
}

export function registerEngineHandlers(_window: BrowserWindow): void {
  ipcMain.handle(
    'engine:preview:start',
    (_event, opts?: { width?: number; height?: number; monitorIndex?: number }) => {
      stopPreview()
      const width = Math.max(16, Math.min(1920, Math.round(opts?.width ?? 1280)))
      const height = Math.max(16, Math.min(1080, Math.round(opts?.height ?? 720)))
      const monitorIndex = Math.max(0, Math.round(opts?.monitorIndex ?? 0))

      const eng = new NativeEngine({ width, height, fps: OUTPUT_FPS })
      engine = eng
      running = true

      // Try native DXGI capture first (high fps, GPU-direct).
      let source = 'screen-dxgi'
      try {
        const sourceTex = eng.createScreenCapture(monitorIndex, OUTPUT_FPS)
        eng.setLayers([{ texture: sourceTex, transform: imageTransform(0, 0), opacity: 1, blendMode: BlendMode.Alpha }])
      } catch (err) {
        process.stderr.write(
          `[engine-preview] DXGI capture unavailable, falling back to desktopCapturer: ${(err as Error).message}\n`
        )
        source = 'screen-desktopcapturer'
        startDesktopCapturerFallback(eng, width, height, monitorIndex)
      }

      return { ok: true, width, height, source, outputFps: OUTPUT_FPS }
    }
  )

  ipcMain.handle('engine:preview:stop', () => {
    stopPreview()
    return { ok: true }
  })

  // Pull model: the renderer requests the latest composited frame on its own
  // clock (requestAnimationFrame), so readback + IPC self-paces.
  ipcMain.handle('engine:preview:frame', () => {
    if (!engine || !running) return null
    const frame = engine.readFrame()
    if (!frame) return null
    return {
      width: frame.width,
      height: frame.height,
      data: Buffer.from(frame.data)
    }
  })
}

/** Stop any running preview and tear down the global engine system. */
export function disposeEnginePreview(): void {
  stopPreview()
  shutdownEngineSystem()
}
