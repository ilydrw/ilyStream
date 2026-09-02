import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMocks = vi.hoisted(() => ({
  windows: [] as any[]
}))

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  let nextWindowId = 1

  class MockWebContents extends EventEmitter {
    send = vi.fn()
    mainFrame = {
      detached: false,
      isDestroyed: vi.fn().mockReturnValue(false),
      send: this.send
    }
    setFrameRate = vi.fn()
    setUserAgent = vi.fn()
    setWindowOpenHandler = vi.fn()
    insertCSS = vi.fn().mockResolvedValue(undefined)
    capturePage = vi.fn()
    reloadIgnoringCache = vi.fn()
    invalidate = vi.fn()
    isCrashed = vi.fn().mockReturnValue(false)
    isDestroyed = vi.fn().mockReturnValue(false)
  }

  class MockBrowserWindow extends EventEmitter {
    id = nextWindowId++
    webContents = new MockWebContents()
    loadURL = vi.fn().mockResolvedValue(undefined)
    setBackgroundColor = vi.fn()
    setContentSize = vi.fn()
    close = vi.fn()
    isDestroyed = vi.fn().mockReturnValue(false)

    constructor() {
      super()
      electronMocks.windows.push(this)
    }
  }

  return { BrowserWindow: MockBrowserWindow }
})

import { BrowserWindow } from 'electron'
import { BrowserSourceService } from './browser-source-service'

/**
 * These cover the CPU capture path, which is what runs wherever offscreen
 * shared textures are unavailable — and what every capture falls back to when
 * an import fails. On Windows the service defaults to the GPU path, so pin the
 * mode explicitly rather than letting the host platform decide which behaviour
 * these assertions describe. Shared-texture behaviour is covered separately
 * below.
 */
describe('BrowserSourceService renderer delivery', () => {
  beforeEach(() => {
    electronMocks.windows.length = 0
    vi.stubEnv('ILY_DISABLE_SHARED_TEXTURE', '1')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-25T12:00:00.000Z'))
  })

  it('allows one renderer bitmap in flight while keeping native sinks independent', () => {
    const owner = new BrowserWindow({} as never)
    const service = new BrowserSourceService()
    service.start(owner, {
      id: 'chat',
      url: 'http://127.0.0.1:8899/overlay/chat',
      width: 1280,
      height: 720,
      fps: 30
    })

    const captureWindow = electronMocks.windows[1]
    const bitmap = Buffer.alloc(4)
    const image = {
      getSize: vi.fn().mockReturnValue({ width: 1, height: 1 }),
      toBitmap: vi.fn().mockReturnValue(bitmap)
    }

    captureWindow.webContents.emit('paint', {}, {}, image)
    expect(image.toBitmap).toHaveBeenCalledTimes(1)
    expect(owner.webContents.send).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(34)
    captureWindow.webContents.emit('paint', {}, {}, image)
    expect(image.toBitmap).toHaveBeenCalledTimes(1)
    expect(owner.webContents.send).toHaveBeenCalledTimes(1)

    service.rendererFrameConsumed(owner, 'chat')
    vi.advanceTimersByTime(34)
    captureWindow.webContents.emit('paint', {}, {}, image)
    expect(image.toBitmap).toHaveBeenCalledTimes(2)
    expect(owner.webContents.send).toHaveBeenCalledTimes(2)

    service.update(owner, {
      id: 'chat',
      url: 'http://127.0.0.1:8899/overlay/chat',
      width: 1280,
      height: 720,
      fps: 30,
      deliverToRenderer: false
    })
    vi.advanceTimersByTime(34)
    captureWindow.webContents.emit('paint', {}, {}, image)
    expect(image.toBitmap).toHaveBeenCalledTimes(2)

    const engineSink = vi.fn()
    service.setEngineFrameSink('chat', engineSink)
    vi.advanceTimersByTime(34)
    captureWindow.webContents.emit('paint', {}, {}, image)
    expect(image.toBitmap).toHaveBeenCalledTimes(3)
    expect(engineSink).toHaveBeenCalledWith({
      kind: 'cpu',
      id: 'chat',
      width: 1,
      height: 1,
      bgra: bitmap
    })
    expect(owner.webContents.send).toHaveBeenCalledTimes(2)
  })
})

describe('BrowserSourceService trailing frame delivery', () => {
  beforeEach(() => {
    electronMocks.windows.length = 0
    // Trailing repaints exist to rescue skipped CPU frames; the GPU path has no
    // such thing to rescue (see the shared-texture suite).
    vi.stubEnv('ILY_DISABLE_SHARED_TEXTURE', '1')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-27T12:00:00.000Z'))
  })

  function startCapture(fps = 30) {
    const owner = new BrowserWindow({} as never)
    const service = new BrowserSourceService()
    service.start(owner, {
      id: 'latest-gifter',
      url: 'http://127.0.0.1:8899/overlay/latest-gifter',
      width: 600,
      height: 200,
      fps
    })
    const captureWindow = electronMocks.windows[1]
    const image = {
      getSize: vi.fn().mockReturnValue({ width: 1, height: 1 }),
      toBitmap: vi.fn().mockReturnValue(Buffer.alloc(4))
    }
    return { owner, service, captureWindow, image }
  }

  // The production failure: the widget paints its username immediately, then
  // repaints ~5ms later when the avatar image finishes decoding, then goes
  // completely static. The second paint falls inside the 33ms frame budget, so
  // a leading-edge-only throttle discarded it and the avatar never appeared.
  it('re-requests a frame that arrives inside the frame budget instead of dropping it', () => {
    const { service, captureWindow, image } = startCapture(30)
    const engineSink = vi.fn()
    service.setEngineFrameSink('latest-gifter', engineSink)

    // Paint 1: username rendered, avatar still loading.
    captureWindow.webContents.emit('paint', {}, {}, image)
    expect(engineSink).toHaveBeenCalledTimes(1)

    // Paint 2: avatar decoded, 5ms later — inside the 33ms budget.
    vi.advanceTimersByTime(5)
    captureWindow.webContents.emit('paint', {}, {}, image)
    expect(engineSink).toHaveBeenCalledTimes(1)

    // The page is now static and will never paint on its own again, so the
    // service must ask for that frame back.
    expect(captureWindow.webContents.invalidate).not.toHaveBeenCalled()
    vi.advanceTimersByTime(70)
    expect(captureWindow.webContents.invalidate).toHaveBeenCalledTimes(1)

    // The repaint it triggers is now outside the budget and gets delivered.
    captureWindow.webContents.emit('paint', {}, {}, image)
    expect(engineSink).toHaveBeenCalledTimes(2)
  })

  it('does not keep requesting repaints once a frame has been delivered', () => {
    const { service, captureWindow, image } = startCapture(30)
    service.setEngineFrameSink('latest-gifter', vi.fn())

    captureWindow.webContents.emit('paint', {}, {}, image)
    vi.advanceTimersByTime(200)
    expect(captureWindow.webContents.invalidate).not.toHaveBeenCalled()
  })

  // A widget that keeps animating (the gifter pill has an infinite gradient)
  // must not pay for this: its own next paint arrives first and cancels the
  // request, so we never force extra repaint work on a busy source.
  it('costs nothing for a page that keeps painting on its own', () => {
    const { service, captureWindow, image } = startCapture(30)
    service.setEngineFrameSink('latest-gifter', vi.fn())

    captureWindow.webContents.emit('paint', {}, {}, image)
    for (let i = 0; i < 10; i++) {
      // Real offscreen cadence: ~33ms apart, so every other paint lands just
      // inside the budget and would schedule a trailing request.
      vi.advanceTimersByTime(33)
      captureWindow.webContents.emit('paint', {}, {}, image)
    }
    expect(captureWindow.webContents.invalidate).not.toHaveBeenCalled()
  })

  it('recovers a frame skipped while the renderer bitmap was in flight', () => {
    const { owner, service, captureWindow, image } = startCapture(30)

    captureWindow.webContents.emit('paint', {}, {}, image)
    expect(owner.webContents.send).toHaveBeenCalledTimes(1)

    // Renderer has not acknowledged yet, so this paint is skipped.
    vi.advanceTimersByTime(40)
    captureWindow.webContents.emit('paint', {}, {}, image)
    expect(owner.webContents.send).toHaveBeenCalledTimes(1)

    // Acknowledging must pull the skipped visual state through.
    service.rendererFrameConsumed(owner, 'latest-gifter')
    vi.advanceTimersByTime(40)
    expect(captureWindow.webContents.invalidate).toHaveBeenCalled()

    captureWindow.webContents.emit('paint', {}, {}, image)
    expect(owner.webContents.send).toHaveBeenCalledTimes(2)
  })

  it('stops requesting repaints after the capture is stopped', () => {
    const { owner, service, captureWindow, image } = startCapture(30)
    service.setEngineFrameSink('latest-gifter', vi.fn())

    captureWindow.webContents.emit('paint', {}, {}, image)
    vi.advanceTimersByTime(5)
    captureWindow.webContents.emit('paint', {}, {}, image)

    service.stop(owner, 'latest-gifter')
    vi.advanceTimersByTime(200)
    expect(captureWindow.webContents.invalidate).not.toHaveBeenCalled()
  })
})

/**
 * The GPU path: `paint` carries a shared-texture handle and an empty image, so
 * the engine imports the handle and the renderer is served by a separate poll.
 */
// Electron exposes OffscreenSharedTexture only on the Windows backend used by
// this service. Keep the CPU-path tests portable, while running the GPU
// contract suite on the platform that can actually create shared textures.
const describeSharedTexture = process.platform === 'win32' ? describe : describe.skip

describeSharedTexture('BrowserSourceService shared texture capture', () => {
  beforeEach(() => {
    electronMocks.windows.length = 0
    vi.stubEnv('ILY_DISABLE_SHARED_TEXTURE', '')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-28T12:00:00.000Z'))
  })

  function makeTexture(overrides: Record<string, unknown> = {}) {
    return {
      release: vi.fn(),
      textureInfo: {
        codedSize: { width: 600, height: 200 },
        visibleRect: { x: 0, y: 0, width: 600, height: 200 },
        pixelFormat: 'bgra',
        handle: { ntHandle: Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]) },
        ...overrides
      }
    }
  }

  function startCapture() {
    const owner = new BrowserWindow({} as never)
    const service = new BrowserSourceService()
    service.start(owner, {
      id: 'latest-gifter',
      url: 'http://127.0.0.1:8899/overlay/latest-gifter',
      width: 600,
      height: 200,
      fps: 30,
      deliverToRenderer: false
    })
    return { owner, service, captureWindow: electronMocks.windows[1] }
  }

  it('hands the engine the GPU handle instead of a bitmap', () => {
    const { service, captureWindow } = startCapture()
    const engineSink = vi.fn()
    service.setEngineFrameSink('latest-gifter', engineSink)

    const texture = makeTexture()
    captureWindow.webContents.emit('paint', { texture }, {}, { isEmpty: () => true })

    expect(engineSink).toHaveBeenCalledWith({
      kind: 'shared',
      id: 'latest-gifter',
      width: 600,
      height: 200,
      sharedHandle: texture.textureInfo.handle.ntHandle
    })
  })

  // Chromium keeps a small texture pool and stalls painting once it is drained,
  // so every paint must give its texture back even when we skip the frame.
  it('always releases the texture, including for skipped frames', () => {
    const { service, captureWindow } = startCapture()
    service.setEngineFrameSink('latest-gifter', vi.fn())

    const delivered = makeTexture()
    captureWindow.webContents.emit('paint', { texture: delivered }, {}, { isEmpty: () => true })
    expect(delivered.release).toHaveBeenCalledTimes(1)

    // Inside the frame budget, so the frame is skipped — but still released.
    vi.advanceTimersByTime(5)
    const skipped = makeTexture()
    captureWindow.webContents.emit('paint', { texture: skipped }, {}, { isEmpty: () => true })
    expect(skipped.release).toHaveBeenCalledTimes(1)
  })

  it('releases the texture even with no engine consumer attached', () => {
    const { captureWindow } = startCapture()
    const texture = makeTexture()

    captureWindow.webContents.emit('paint', { texture }, {}, { isEmpty: () => true })

    expect(texture.release).toHaveBeenCalledTimes(1)
  })

  it('polls the renderer preview at the requested capture cadence', async () => {
    const owner = new BrowserWindow({} as never)
    const service = new BrowserSourceService()
    service.start(owner, {
      id: 'smooth-widget',
      url: 'http://127.0.0.1:8899/overlay/smooth-widget',
      width: 600,
      height: 200,
      fps: 60,
      deliverToRenderer: true
    })

    const captureWindow = electronMocks.windows[1]
    captureWindow.webContents.capturePage.mockResolvedValue({
      isEmpty: () => false,
      getSize: () => ({ width: 600, height: 200 }),
      toBitmap: () => Buffer.alloc(4)
    })

    await vi.advanceTimersByTimeAsync(17)
    expect(captureWindow.webContents.capturePage).toHaveBeenCalledTimes(1)

    service.rendererFrameConsumed(owner, 'smooth-widget')
    await vi.advanceTimersByTimeAsync(17)
    expect(captureWindow.webContents.capturePage).toHaveBeenCalledTimes(2)

    service.update(owner, {
      id: 'smooth-widget',
      url: 'http://127.0.0.1:8899/overlay/smooth-widget',
      width: 600,
      height: 200,
      fps: 30
    })
    service.rendererFrameConsumed(owner, 'smooth-widget')

    await vi.advanceTimersByTimeAsync(17)
    expect(captureWindow.webContents.capturePage).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(17)
    expect(captureWindow.webContents.capturePage).toHaveBeenCalledTimes(3)
  })

  // Padding would otherwise be composited as part of the widget: the engine
  // samples the whole surface and the layer format cannot express a UV crop.
  it('falls back to CPU frames when the coded size is padded', () => {
    const { service, captureWindow } = startCapture()
    const engineSink = vi.fn()
    service.setEngineFrameSink('latest-gifter', engineSink)

    const padded = makeTexture({ codedSize: { width: 640, height: 208 } })
    captureWindow.webContents.emit('paint', { texture: padded }, {}, { isEmpty: () => true })

    expect(engineSink).not.toHaveBeenCalled()
    expect(padded.release).toHaveBeenCalledTimes(1)

    // Now on the CPU path, a normal paint delivers a bitmap again.
    vi.advanceTimersByTime(34)
    const image = {
      getSize: vi.fn().mockReturnValue({ width: 600, height: 200 }),
      toBitmap: vi.fn().mockReturnValue(Buffer.alloc(4))
    }
    captureWindow.webContents.emit('paint', {}, {}, image)
    expect(engineSink).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'cpu', id: 'latest-gifter' })
    )
  })
})
