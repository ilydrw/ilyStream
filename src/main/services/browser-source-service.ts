import { BrowserWindow, type OffscreenSharedTexture } from 'electron'
import { sendToRenderer } from '../ipc/safe-send'

export interface BrowserSourceCaptureConfig {
  id: string
  url: string
  width: number
  height: number
  fps?: number
  /**
   * When false, captured frames stop being pushed to the renderer over IPC while
   * the capture (and any native-engine sink) keeps running at full rate. The
   * renderer sets this false only when it has no consumer for the frames — the
   * studio page is hidden and no canvas output/preview draws the source. Omit to
   * leave the current value unchanged (defaults to true on first start).
   */
  deliverToRenderer?: boolean
}

interface BrowserSourceCapture {
  key: string
  id: string
  url: string
  width: number
  height: number
  fps: number
  window: BrowserWindow
  owner: BrowserWindow
  ownerClosedHandler: () => void
  lastFrameAt: number
  deliverToRenderer: boolean
  rendererFrameInFlight: boolean
  /** A paint was skipped and its visual state has not reached a consumer yet. */
  pendingRepaint: boolean
  repaintTimer: NodeJS.Timeout | null
  /**
   * True when the window was created with offscreen shared textures, so `paint`
   * carries a GPU handle and an empty NativeImage. Fixed for the window's life:
   * webPreferences cannot change without recreating it, and recreating would
   * reload the widget and lose its animation state mid-stream.
   */
  sharedTexture: boolean
  /**
   * Shared-texture captures cannot serve renderer pixels from `paint`, so the
   * studio preview is fed by a low-rate capturePage poll instead — only while
   * something is actually looking at it.
   */
  previewTimer: NodeJS.Timeout | null
  previewInFlight: boolean
}

const MAX_CAPTURE_EDGE = 1920
const MAX_CAPTURE_PIXELS = 1920 * 1080
const MAX_CAPTURE_FPS = 60
// 30fps default: on the CPU path every captured frame is a full BGRA copy
// pushed over IPC, so the default rate directly scales allocation churn in
// three processes. Sources that genuinely need 60 can still request it
// per-layer.
const DEFAULT_CAPTURE_FPS = 30
// The studio editor preview only has to look live to a human dragging a layer
// around; it does not have to match the compositor's cadence. Polling it well
// below capture rate keeps the readback off the hot path.
const PREVIEW_POLL_FPS = 10

/**
 * Frame delivered to an in-main-process consumer (e.g. the native engine).
 *
 * `kind: 'shared'` is the zero-copy path: the frame never leaves the GPU and
 * the consumer imports `sharedHandle` as a texture. `kind: 'cpu'` is the
 * fallback, where Chromium has already read the frame back into a BGRA bitmap.
 */
export type BrowserSourceEngineFrame =
  | {
      kind: 'cpu'
      id: string
      width: number
      height: number
      /** BGRA8 pixels, tightly packed (width*height*4). Valid for the call only. */
      bgra: Buffer
    }
  | {
      kind: 'shared'
      id: string
      width: number
      height: number
      /**
       * Platform shared-texture handle (Windows NT handle bytes). Chromium
       * recycles a small pool of these, so the same handle recurs and consumers
       * should cache their imported texture by its contents rather than
       * re-importing every frame.
       */
      sharedHandle: Buffer
    }

/**
 * Shared-texture offscreen rendering is Windows-only here: the engine imports
 * via OpenSharedResource. Set ILY_DISABLE_SHARED_TEXTURE=1 to force every
 * capture down the CPU path (useful when isolating a GPU-driver problem).
 */
function sharedTextureSupported(): boolean {
  return process.platform === 'win32' && process.env.ILY_DISABLE_SHARED_TEXTURE !== '1'
}

export class BrowserSourceService {
  private captures = new Map<string, BrowserSourceCapture>()
  // In-process frame consumers keyed by capture id. Lets the native engine
  // receive widget/overlay frames directly in main instead of routing the
  // pixels renderer->canvas->getImageData->IPC->main and back.
  private engineFrameSinks = new Map<string, (frame: BrowserSourceEngineFrame) => void>()

  /**
   * Register (or clear, with null) a direct frame consumer for a capture id.
   * The sink is called on the capture's paint cadence with BGRA pixels.
   */
  setEngineFrameSink(id: string, sink: ((frame: BrowserSourceEngineFrame) => void) | null): void {
    if (sink) {
      this.engineFrameSinks.set(id, sink)
    } else {
      this.engineFrameSinks.delete(id)
    }
  }

  start(owner: BrowserWindow, config: BrowserSourceCaptureConfig): void {
    const key = getCaptureKey(owner, config.id)
    const existing = this.captures.get(key)
    if (existing) {
      this.update(owner, config)
      return
    }

    const safeUrl = resolveSafeBrowserSourceUrl(config.url)
    if (!safeUrl) {
      sendToRenderer(owner, 'browser-source:error', {
        id: config.id,
        message: `Unsupported browser source URL: ${config.url}`
      })
      return
    }

    const { width, height } = normalizeCaptureSize(config.width, config.height)
    const fps = clampFps(config.fps)
    const useSharedTexture = sharedTextureSupported()
    const ownerClosedHandler = () => this.stopByKey(key)
    const window = new BrowserWindow({
      width,
      height,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      webPreferences: {
        offscreen: useSharedTexture ? { useSharedTexture: true } : true,
        backgroundThrottling: false,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    })
    window.webContents.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 ilyStream/1.0.0'
    )

    window.webContents.setWindowOpenHandler(({ url }) => {
      sendToRenderer(owner, 'browser-source:error', {
        id: config.id,
        message: `Blocked browser source popup: ${url}`
      })
      return { action: 'deny' }
    })
    window.webContents.on('will-navigate', (event, url) => {
      if (resolveSafeBrowserSourceUrl(url)) return
      event.preventDefault()
      sendToRenderer(owner, 'browser-source:error', {
        id: config.id,
        message: `Blocked browser source navigation: ${url}`
      })
    })
    window.webContents.on('will-redirect', (event, url) => {
      if (resolveSafeBrowserSourceUrl(url)) return
      event.preventDefault()
      sendToRenderer(owner, 'browser-source:error', {
        id: config.id,
        message: `Blocked browser source redirect: ${url}`
      })
    })

    window.webContents.setFrameRate(fps)
    window.setBackgroundColor('#00000000')
    window.webContents.on('did-finish-load', () => {
      void window.webContents.insertCSS(`
        html, body {
          background: transparent !important;
          background-color: transparent !important;
        }
      `).catch(() => {})
    })
    window.webContents.on('paint', (event, _dirty, image) => {
      const capture = this.captures.get(key)
      if (!capture || capture.owner.isDestroyed() || capture.owner.webContents.isDestroyed()) return

      const frameInterval = 1000 / capture.fps
      const engineSink = this.engineFrameSinks.get(capture.id)

      if (capture.sharedTexture) {
        this.handleSharedTexturePaint(capture, event.texture, engineSink, frameInterval)
        return
      }

      const rendererNeedsFrame = capture.deliverToRenderer && !capture.rendererFrameInFlight
      // A hibernated Studio route can keep the browser page alive at 1fps so
      // state resumes instantly, but when neither the native compositor nor the
      // renderer consumes its paint there is no reason to allocate a full BGRA
      // bitmap just to discard it.
      if (!engineSink && !rendererNeedsFrame) {
        // The renderer being momentarily busy is not the same as having no
        // consumer: re-ask for this frame once it drains, or its visual state
        // is lost for good on a page that then goes static.
        if (capture.deliverToRenderer) this.scheduleTrailingRepaint(capture, frameInterval)
        return
      }

      const now = Date.now()
      const elapsed = now - capture.lastFrameAt
      if (elapsed < frameInterval) {
        // Rate limiting must never *drop* the last frame outright. A widget can
        // paint its text and then its avatar a few ms later (once the image
        // decodes) and go static, in which case discarding that second paint
        // freezes the stale, avatar-less frame on screen permanently.
        //
        // Waiting two frame intervals makes this cost nothing for pages that
        // keep animating: their next natural paint is delivered first and
        // cancels this, so only a page that actually went quiet is re-asked.
        this.scheduleTrailingRepaint(capture, frameInterval * 2)
        return
      }

      capture.lastFrameAt = now
      this.clearTrailingRepaint(capture)

      const size = image.getSize()
      const bitmap = image.toBitmap()

      // Direct in-main consumer (native engine) gets the same frame with no
      // extra copy or IPC hop.
      if (engineSink) {
        try {
          engineSink({ kind: 'cpu', id: capture.id, width: size.width, height: size.height, bgra: bitmap })
        } catch (error) {
          console.warn(`[BrowserSource] engine frame sink failed for ${capture.id}:`, error)
        }
      }

      // The engine sink (native compositor) always runs; the renderer IPC send
      // is skipped when the renderer has signalled it has no canvas/editor
      // consumer for this capture right now (e.g. streaming through the native
      // engine with the studio page hidden). Shipping the full w*h*4 BGRA copy
      // per frame into the renderer just to discard it is the wasteful path.
      if (rendererNeedsFrame) {
        const sent = sendToRenderer(capture.owner, 'browser-source:frame', {
          id: capture.id,
          width: size.width,
          height: size.height,
          format: 'bgra',
          bitmap
        })
        capture.rendererFrameInFlight = sent
      }
    })

    window.webContents.on('render-process-gone', (_event, details) => {
      sendToRenderer(owner, 'browser-source:error', {
        id: config.id,
        message: `Browser source renderer exited: ${details.reason}`
      })
      this.stopByKey(key)
    })

    window.webContents.on('did-fail-load', (_event, _code, description, validatedURL) => {
      sendToRenderer(owner, 'browser-source:error', {
        id: config.id,
        message: `${description}: ${validatedURL}`
      })
    })

    const capture: BrowserSourceCapture = {
      key,
      id: config.id,
      url: safeUrl,
      width,
      height,
      fps,
      window,
      owner,
      ownerClosedHandler,
      lastFrameAt: 0,
      deliverToRenderer: config.deliverToRenderer ?? true,
      rendererFrameInFlight: false,
      pendingRepaint: false,
      repaintTimer: null,
      sharedTexture: useSharedTexture,
      previewTimer: null,
      previewInFlight: false
    }
    this.captures.set(key, capture)
    this.syncPreviewPolling(capture)

    owner.once('closed', ownerClosedHandler)
    void window.loadURL(safeUrl)
  }

  update(owner: BrowserWindow, config: BrowserSourceCaptureConfig): void {
    const key = getCaptureKey(owner, config.id)
    const capture = this.captures.get(key)
    if (!capture) {
      this.start(owner, config)
      return
    }

    const safeUrl = resolveSafeBrowserSourceUrl(config.url)
    if (!safeUrl) {
      sendToRenderer(owner, 'browser-source:error', {
        id: config.id,
        message: `Unsupported browser source URL: ${config.url}`
      })
      return
    }

    const { width, height } = normalizeCaptureSize(config.width || capture.width, config.height || capture.height)
    const fps = clampFps(config.fps ?? capture.fps)
    const urlChanged = safeUrl !== capture.url
    const sizeChanged = width !== capture.width || height !== capture.height

    capture.owner = owner
    capture.url = safeUrl
    capture.width = width
    capture.height = height
    capture.fps = fps
    // Omitted (undefined) means "leave unchanged" — other managers of the same
    // capture (e.g. the editor overlay) update it without touching delivery.
    if (
      config.deliverToRenderer !== undefined &&
      config.deliverToRenderer !== capture.deliverToRenderer
    ) {
      capture.deliverToRenderer = config.deliverToRenderer
      capture.rendererFrameInFlight = false
      if (capture.sharedTexture) {
        // No CPU pixels come out of `paint` here; the preview poll is the only
        // way the renderer sees this source, so start/stop it with delivery.
        this.syncPreviewPolling(capture)
        if (capture.deliverToRenderer) void this.deliverPreviewFrame(capture)
      } else if (capture.deliverToRenderer) {
        // Resuming delivery: the page may have been static the whole time it
        // was hibernated, so ask for a frame rather than waiting for a change.
        this.scheduleTrailingRepaint(capture, 0)
      }
    }

    capture.window.webContents.setFrameRate(fps)
    if (sizeChanged) {
      capture.window.setContentSize(width, height)
    }
    if (urlChanged) {
      void capture.window.loadURL(safeUrl)
    }
  }

  /**
   * Ask the page to repaint after `delayMs` so a frame we declined to deliver
   * is not lost. Offscreen pages only emit `paint` when something changes, so a
   * widget that finishes loading (avatar decoded, rows rendered) and then sits
   * idle emits no further frames on its own — without this, whatever we skipped
   * stays skipped and the compositor keeps showing the previous, stale frame.
   *
   * Re-requesting rather than retaining the NativeImage keeps this allocation
   * free: the pixels are only copied when a frame is actually delivered.
   */
  private scheduleTrailingRepaint(capture: BrowserSourceCapture, delayMs: number): void {
    if (capture.repaintTimer) return
    capture.pendingRepaint = true
    capture.repaintTimer = setTimeout(() => {
      capture.repaintTimer = null
      if (!capture.pendingRepaint) return
      capture.pendingRepaint = false
      if (capture.window.isDestroyed() || capture.window.webContents.isDestroyed()) return
      try {
        capture.window.webContents.invalidate()
      } catch (error) {
        console.warn(`[BrowserSource] repaint request failed for ${capture.id}:`, error)
      }
    }, Math.max(1, Math.ceil(delayMs)))
    capture.repaintTimer.unref?.()
  }

  /**
   * Shared-texture paint: hand the GPU handle to the engine and release it.
   *
   * The texture must be released promptly — Chromium only keeps a small pool
   * and stalls painting once it is exhausted. Releasing is safe while the
   * engine still draws it: the engine opened its own reference to the
   * underlying surface, and Chromium reusing the slot means it is painting this
   * same page's next frame into the texture the engine is already sampling.
   */
  private handleSharedTexturePaint(
    capture: BrowserSourceCapture,
    texture: OffscreenSharedTexture | undefined,
    engineSink: ((frame: BrowserSourceEngineFrame) => void) | undefined,
    frameInterval: number
  ): void {
    if (!texture) return

    try {
      if (!engineSink) return

      const now = Date.now()
      if (now - capture.lastFrameAt < frameInterval) return
      capture.lastFrameAt = now

      const info = texture.textureInfo
      const handle = info?.handle?.ntHandle
      if (!handle) return

      const { codedSize, visibleRect } = info
      // A padded coded size would need the engine to crop in UV space, which
      // the layer format has no room for. Rather than silently render the
      // padding, fall back to the CPU path for this capture.
      if (visibleRect.width !== codedSize.width || visibleRect.height !== codedSize.height) {
        this.disableSharedTexture(
          capture,
          `coded size ${codedSize.width}x${codedSize.height} exceeds visible ${visibleRect.width}x${visibleRect.height}`
        )
        return
      }

      engineSink({
        kind: 'shared',
        id: capture.id,
        width: codedSize.width,
        height: codedSize.height,
        sharedHandle: handle
      })
    } catch (error) {
      console.warn(`[BrowserSource] shared texture frame failed for ${capture.id}:`, error)
    } finally {
      try {
        texture.release()
      } catch {
        // A released-twice or already-torn-down texture is not worth surfacing.
      }
    }
  }

  /**
   * Give up on the GPU path for this capture without restarting it: the window
   * keeps painting, we simply stop importing and let the CPU preview poll carry
   * the frames. Recreating the window would reload the widget mid-stream.
   */
  private disableSharedTexture(capture: BrowserSourceCapture, reason: string): void {
    if (!capture.sharedTexture) return
    capture.sharedTexture = false
    console.warn(
      `[BrowserSource] shared texture unusable for ${capture.id} (${reason}); falling back to CPU frames`
    )
    this.syncPreviewPolling(capture)
  }

  /**
   * Under shared textures the renderer cannot be served from `paint`, so poll
   * capturePage while (and only while) the renderer wants frames.
   */
  private syncPreviewPolling(capture: BrowserSourceCapture): void {
    const wanted = capture.sharedTexture && capture.deliverToRenderer
    if (!wanted) {
      if (capture.previewTimer) {
        clearInterval(capture.previewTimer)
        capture.previewTimer = null
      }
      return
    }
    if (capture.previewTimer) return

    capture.previewTimer = setInterval(() => {
      void this.deliverPreviewFrame(capture)
    }, Math.round(1000 / PREVIEW_POLL_FPS))
    capture.previewTimer.unref?.()
  }

  private async deliverPreviewFrame(capture: BrowserSourceCapture): Promise<void> {
    if (capture.previewInFlight || capture.rendererFrameInFlight) return
    if (capture.window.isDestroyed() || capture.window.webContents.isDestroyed()) return
    if (capture.owner.isDestroyed() || capture.owner.webContents.isDestroyed()) return

    capture.previewInFlight = true
    try {
      const image = await capture.window.webContents.capturePage()
      if (image.isEmpty()) return
      if (capture.owner.isDestroyed() || capture.owner.webContents.isDestroyed()) return

      const size = image.getSize()
      const sent = sendToRenderer(capture.owner, 'browser-source:frame', {
        id: capture.id,
        width: size.width,
        height: size.height,
        format: 'bgra',
        bitmap: image.toBitmap()
      })
      capture.rendererFrameInFlight = sent
    } catch (error) {
      console.warn(`[BrowserSource] preview capture failed for ${capture.id}:`, error)
    } finally {
      capture.previewInFlight = false
    }
  }

  private clearTrailingRepaint(capture: BrowserSourceCapture): void {
    capture.pendingRepaint = false
    if (capture.repaintTimer) {
      clearTimeout(capture.repaintTimer)
      capture.repaintTimer = null
    }
  }

  reload(owner: BrowserWindow, id: string): void {
    this.captures.get(getCaptureKey(owner, id))?.window.webContents.reloadIgnoringCache()
  }

  rendererFrameConsumed(owner: BrowserWindow, id: string): void {
    const capture = this.captures.get(getCaptureKey(owner, id))
    if (!capture) return
    capture.rendererFrameInFlight = false
    // The shared-texture path has no skipped paint to make up: the next poll
    // tick captures fresh pixels anyway.
    if (capture.sharedTexture) return
    // Deliver whatever we skipped while the renderer was busy without waiting
    // for the page to happen to paint again.
    if (capture.pendingRepaint) this.scheduleTrailingRepaint(capture, 0)
  }

  stop(owner: BrowserWindow, id: string): void {
    this.stopByKey(getCaptureKey(owner, id))
  }

  private stopByKey(key: string): void {
    const capture = this.captures.get(key)
    if (!capture) return
    this.captures.delete(key)
    this.clearTrailingRepaint(capture)
    if (capture.previewTimer) {
      clearInterval(capture.previewTimer)
      capture.previewTimer = null
    }
    if (!capture.owner.isDestroyed()) {
      capture.owner.off('closed', capture.ownerClosedHandler)
    }
    if (!capture.window.isDestroyed()) capture.window.close()
  }

  stopAll(): void {
    for (const key of [...this.captures.keys()]) {
      this.stopByKey(key)
    }
  }
}

function getCaptureKey(owner: BrowserWindow, id: string): string {
  return `${owner.id}:${id}`
}

function clampFps(value: unknown): number {
  const fps = Number(value)
  if (!Number.isFinite(fps)) return DEFAULT_CAPTURE_FPS
  return Math.max(1, Math.min(MAX_CAPTURE_FPS, Math.round(fps)))
}

function normalizeCaptureSize(widthValue: unknown, heightValue: unknown): { width: number; height: number } {
  const sourceWidth = Math.max(16, Math.round(Number(widthValue) || 1280))
  const sourceHeight = Math.max(16, Math.round(Number(heightValue) || 720))
  const edgeScale = Math.min(MAX_CAPTURE_EDGE / sourceWidth, MAX_CAPTURE_EDGE / sourceHeight)
  const pixelScale = Math.sqrt(MAX_CAPTURE_PIXELS / (sourceWidth * sourceHeight))
  const scale = Math.min(1, edgeScale, pixelScale)

  return {
    width: Math.max(16, Math.round(sourceWidth * scale)),
    height: Math.max(16, Math.round(sourceHeight * scale))
  }
}

function resolveSafeBrowserSourceUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null

  try {
    const url = new URL(value)
    if (
      url.protocol === 'https:' ||
      url.protocol === 'asset:' ||
      (url.protocol === 'http:' && isLoopbackHost(url.hostname))
    ) {
      return url.toString()
    }
  } catch {
    return null
  }

  return null
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}
