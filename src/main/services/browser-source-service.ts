import { BrowserWindow } from 'electron'

export interface BrowserSourceCaptureConfig {
  id: string
  url: string
  width: number
  height: number
  fps?: number
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
}

const MAX_CAPTURE_EDGE = 1920
const MAX_CAPTURE_PIXELS = 1920 * 1080
const MAX_CAPTURE_FPS = 60
const DEFAULT_CAPTURE_FPS = 60

export class BrowserSourceService {
  private captures = new Map<string, BrowserSourceCapture>()

  start(owner: BrowserWindow, config: BrowserSourceCaptureConfig): void {
    const key = getCaptureKey(owner, config.id)
    const existing = this.captures.get(key)
    if (existing) {
      this.update(owner, config)
      return
    }

    const safeUrl = resolveSafeBrowserSourceUrl(config.url)
    if (!safeUrl) {
      owner.webContents.send('browser-source:error', {
        id: config.id,
        message: `Unsupported browser source URL: ${config.url}`
      })
      return
    }

    const { width, height } = normalizeCaptureSize(config.width, config.height)
    const fps = clampFps(config.fps)
    const ownerClosedHandler = () => this.stopByKey(key)
    const window = new BrowserWindow({
      width,
      height,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      webPreferences: {
        offscreen: true,
        backgroundThrottling: false,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 ilyStream/1.0.0'
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
    window.webContents.on('paint', (_event, _dirty, image) => {
      const capture = this.captures.get(key)
      if (!capture || capture.owner.isDestroyed() || capture.owner.webContents.isDestroyed()) return

      const now = Date.now()
      if (now - capture.lastFrameAt < 1000 / capture.fps) return
      capture.lastFrameAt = now

      const size = image.getSize()
      const bitmap = image.toBitmap()

      capture.owner.webContents.send('browser-source:frame', {
        id: capture.id,
        width: size.width,
        height: size.height,
        format: 'bgra',
        bitmap
      })
    })

    window.webContents.on('render-process-gone', (_event, details) => {
      if (!owner.isDestroyed()) {
        owner.webContents.send('browser-source:error', {
          id: config.id,
          message: `Browser source renderer exited: ${details.reason}`
        })
      }
      this.stopByKey(key)
    })

    window.webContents.on('did-fail-load', (_event, _code, description, validatedURL) => {
      if (!owner.isDestroyed()) {
        owner.webContents.send('browser-source:error', {
          id: config.id,
          message: `${description}: ${validatedURL}`
        })
      }
    })

    this.captures.set(key, {
      key,
      id: config.id,
      url: safeUrl,
      width,
      height,
      fps,
      window,
      owner,
      ownerClosedHandler,
      lastFrameAt: 0
    })

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
      owner.webContents.send('browser-source:error', {
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

    capture.window.webContents.setFrameRate(fps)
    if (sizeChanged) {
      capture.window.setContentSize(width, height)
    }
    if (urlChanged) {
      void capture.window.loadURL(safeUrl)
    }
  }

  reload(owner: BrowserWindow, id: string): void {
    this.captures.get(getCaptureKey(owner, id))?.window.webContents.reloadIgnoringCache()
  }

  stop(owner: BrowserWindow, id: string): void {
    this.stopByKey(getCaptureKey(owner, id))
  }

  private stopByKey(key: string): void {
    const capture = this.captures.get(key)
    if (!capture) return
    this.captures.delete(key)
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
