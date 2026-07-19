import { app, BrowserWindow, desktopCapturer, ipcMain, screen, sharedTexture } from 'electron'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const engine = require(path.join(scriptDirectory, '..', 'build', 'Release', 'ilystream_napi.node'))
const resultPath = process.env.ILY_NATIVE_BROADCAST_SMOKE_RESULT ||
  path.join(app.getPath('temp'), 'ilystream-native-broadcast-smoke.json')
const monitorIndex = Math.max(
  0,
  Number.parseInt(process.env.ILY_NATIVE_BROADCAST_SMOKE_MONITOR ?? '0', 10) || 0
)
const showBlackCard = process.env.ILY_NATIVE_BROADCAST_SMOKE_BLACK_CARD === '1'

let engineHandle = null
let importedOutput = null
let referencesReleased = null
let blackCard = null
let captureDescription = null

function waitForRelease(promise, timeoutMs = 2000) {
  if (!promise) return Promise.resolve()
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(resolve, timeoutMs))
  ])
}

async function stopEngine() {
  const imported = importedOutput
  const released = referencesReleased
  importedOutput = null
  referencesReleased = null
  if (imported) {
    imported.release()
    await waitForRelease(released)
  }
  if (engineHandle !== null) {
    engine.destroyEngine(engineHandle)
    engineHandle = null
  }
}

function captureTransform(capture, width, height) {
  const scale = Math.min(width / capture.description.width, height / capture.description.height)
  return {
    position: {
      x: (width - capture.description.width * scale) / 2,
      y: (height - capture.description.height * scale) / 2,
      z: 0
    },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: scale, y: scale, z: 1 },
    anchor: { x: 0, y: 0 },
    pivot: { x: 0, y: 0 },
    crop: { left: 0, top: 0, right: 0, bottom: 0 },
    visibility: true,
    opacity: 1
  }
}

function colorTransform(x, y, width, height) {
  return {
    position: { x, y, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: width, y: height, z: 1 },
    anchor: { x: 0, y: 0 },
    pivot: { x: 0, y: 0 },
    crop: { left: 0, top: 0, right: 0, bottom: 0 },
    visibility: true,
    opacity: 1
  }
}

let passed = false
let smokeResult = { ok: false, error: 'smoke did not complete' }

async function runSmoke() {
  try {
  engine.initializeSystem()
  const displays = engine.listScreenCaptureDisplays()
  const electronDisplays = screen.getAllDisplays().map((display) => ({
    id: String(display.id),
    label: display.label,
    bounds: display.bounds,
    scaleFactor: display.scaleFactor
  }))
  const electronSources = (await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1, height: 1 }
  })).map((source) => ({
    id: source.id,
    name: source.name,
    displayId: source.display_id
  }))

  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(scriptDirectory, '..', '..', '..', 'out', 'preload', 'index.cjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })

  ipcMain.handle('engine:broadcast:start', async (_event, options) => {
    await stopEngine()
    const width = options.width
    const height = options.height
    engineHandle = engine.createEngine({ width, height, fps: options.fps })
    const capture = engine.engineCreateScreenCapture(engineHandle, options.monitorIndex, options.fps)
    captureDescription = capture.description
    const markerTexture = engine.engineCreateColorTexture(engineHandle, 0xff0000ff)
    engine.engineSetLayers(engineHandle, [
      {
        texture: capture.texture,
        transform: captureTransform(capture, width, height),
        opacity: 1,
        blendMode: 1
      },
      {
        texture: markerTexture,
        transform: colorTransform(16, 16, 96, 64),
        opacity: 1,
        blendMode: 1
      }
    ])

    const output = engine.engineGetSharedOutputTexture(engineHandle)
    let markReleased
    referencesReleased = new Promise(resolve => { markReleased = resolve })
    importedOutput = sharedTexture.importSharedTexture({
      textureInfo: {
        codedSize: { width: output.width, height: output.height },
        visibleRect: { x: 0, y: 0, width: output.width, height: output.height },
        pixelFormat: output.pixelFormat,
        colorSpace: {
          primaries: 'bt709',
          transfer: 'srgb',
          matrix: 'rgb',
          range: 'full'
        },
        handle: { ntHandle: output.handle }
      },
      allReferencesReleased: () => markReleased()
    })

    await sharedTexture.sendSharedTexture(
      { frame: window.webContents.mainFrame, importedSharedTexture: importedOutput },
      { purpose: 'broadcast', width: output.width, height: output.height }
    )
    return { ok: true, width, height, fps: options.fps }
  })

  ipcMain.handle('engine:broadcast:stop', async () => {
    await stopEngine()
    return { ok: true }
  })

  const pagePath = path.join(app.getPath('temp'), `ilystream-native-broadcast-${Date.now()}.html`)
  fs.writeFileSync(pagePath, '<!doctype html><html><body>native broadcast smoke</body></html>')
  await window.loadFile(pagePath)
  if (showBlackCard) {
    blackCard = new BrowserWindow({
      x: displays[monitorIndex]?.left ?? 0,
      y: displays[monitorIndex]?.top ?? 0,
      width: 768,
      height: 512,
      frame: false,
      show: false,
      skipTaskbar: true,
      backgroundColor: '#000000'
    })
    blackCard.setAlwaysOnTop(true, 'screen-saver')
    await blackCard.loadURL(`data:text/html,${encodeURIComponent(`
      <style>
        html, body { margin: 0; width: 100%; height: 100%; background: #000; }
        body { display: grid; grid-template-rows: 1fr 1fr; }
        .swatches { display: grid; grid-template-columns: repeat(4, 1fr); }
        .gradient { background: linear-gradient(to right, rgb(3,3,3), rgb(48,48,48)); }
      </style>
      <div class="swatches">
        <div style="background:rgb(0,0,0)"></div>
        <div style="background:rgb(1,0,0)"></div>
        <div style="background:rgb(2,0,0)"></div>
        <div style="background:rgb(3,3,3)"></div>
      </div>
      <div class="gradient"></div>
    `)}`)
    blackCard.showInactive()
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  smokeResult = await window.webContents.executeJavaScript(`(() => new Promise(async (resolve) => {
    const timeout = setTimeout(() => resolve({ ok: false, error: 'VideoFrame transfer timeout' }), 10000)
    const onMessage = async (event) => {
      const data = event.data
      if (!data?.__ilyNativeBroadcastFrame || !data.frame) return
      const frame = data.frame
      window.removeEventListener('message', onMessage)
      try {
        const config = {
          codec: 'avc1.64001f',
          width: 1280,
          height: 720,
          bitrate: 4000000,
          bitrateMode: 'constant',
          framerate: 30,
          latencyMode: 'realtime',
          hardwareAcceleration: 'prefer-hardware',
          avc: { format: 'annexb' }
        }
        const support = await VideoEncoder.isConfigSupported(config)
        if (!support.supported) throw new Error('H.264 WebCodecs configuration is unsupported')

        const pixels = new Uint8Array(frame.allocationSize({ format: 'RGBA' }))
        await frame.copyTo(pixels, { format: 'RGBA' })
        const blackLevel = {
          exact: 0,
          drift: 0,
          redBiased: 0
        }
        for (let index = 0; index < pixels.length; index += 4) {
          const red = pixels[index]
          const green = pixels[index + 1]
          const blue = pixels[index + 2]
          const peak = Math.max(red, green, blue)
          if (peak === 0) blackLevel.exact += 1
          if (peak > 0 && peak <= 2) {
            blackLevel.drift += 1
            if (red > green || red > blue) blackLevel.redBiased += 1
          }
        }
        const blackCardLevel = {
          exact: 0,
          drift: 0,
          redBiased: 0
        }
        for (let y = 96; y < 300; y += 1) {
          for (let x = 96; x < 300; x += 1) {
            const index = (y * frame.codedWidth + x) * 4
            const red = pixels[index]
            const green = pixels[index + 1]
            const blue = pixels[index + 2]
            const peak = Math.max(red, green, blue)
            if (peak === 0) blackCardLevel.exact += 1
            if (peak > 0 && peak <= 2) {
              blackCardLevel.drift += 1
              if (red > green || red > blue) blackCardLevel.redBiased += 1
            }
          }
        }
        const samplePixel = (x, y) => {
          const index = (y * frame.codedWidth + x) * 4
          return [pixels[index], pixels[index + 1], pixels[index + 2]]
        }
        const blackCardSamples = {
          black: samplePixel(64, 85),
          red1: samplePixel(192, 85),
          red2: samplePixel(320, 85),
          gray3: samplePixel(448, 85)
        }
        const shadowGradient = {
          flatNeighborPairs: 0,
          neighborPairs: 0,
          longestFlatRun: 1,
          maxChannelSpread: 0,
          uniqueLevels: 0,
          samples: []
        }
        const shadowLevels = new Set()
        let previousGradientPixel = null
        let flatRun = 1
        for (let x = 16; x < 496; x += 1) {
          const pixel = samplePixel(x, 256)
          shadowGradient.maxChannelSpread = Math.max(
            shadowGradient.maxChannelSpread,
            Math.max(...pixel) - Math.min(...pixel)
          )
          shadowLevels.add(pixel.join(','))
          if ((x - 16) % 64 === 0) shadowGradient.samples.push(pixel)
          if (previousGradientPixel) {
            shadowGradient.neighborPairs += 1
            if (pixel.every((channel, index) => channel === previousGradientPixel[index])) {
              shadowGradient.flatNeighborPairs += 1
              flatRun += 1
            } else {
              shadowGradient.longestFlatRun = Math.max(shadowGradient.longestFlatRun, flatRun)
              flatRun = 1
            }
          }
          previousGradientPixel = pixel
        }
        shadowGradient.longestFlatRun = Math.max(shadowGradient.longestFlatRun, flatRun)
        shadowGradient.uniqueLevels = shadowLevels.size
        let nonBlack = false
        for (let index = 0; index < pixels.length; index += 64) {
          if (pixels[index] > 20 || pixels[index + 1] > 20 || pixels[index + 2] > 20) {
            nonBlack = true
            break
          }
        }
        let markerRed = false
        for (let y = 24; y < 64 && !markerRed; y += 8) {
          for (let x = 24; x < 96; x += 8) {
            const index = (y * frame.codedWidth + x) * 4
            if (pixels[index] > 220 && pixels[index + 1] < 30 && pixels[index + 2] < 30) {
              markerRed = true
              break
            }
          }
        }

        let encodedBytes = 0
        let encodedType = ''
        const encoder = new VideoEncoder({
          output: (chunk) => {
            encodedBytes += chunk.byteLength
            encodedType = chunk.type
          },
          error: (error) => { throw error }
        })
        encoder.configure(support.config)
        encoder.encode(frame, { keyFrame: true })
        await encoder.flush()
        encoder.close()

        clearTimeout(timeout)
        resolve({
          ok: encodedBytes > 0,
          timestamp: frame.timestamp,
          codedWidth: frame.codedWidth,
          codedHeight: frame.codedHeight,
          primaries: frame.colorSpace?.primaries,
          transfer: frame.colorSpace?.transfer,
          matrix: frame.colorSpace?.matrix,
          fullRange: frame.colorSpace?.fullRange,
          blackLevel,
          blackCardLevel,
          blackCardSamples,
          shadowGradient,
          nonBlack,
          markerRed,
          encodedBytes,
          encodedType
        })
      } catch (error) {
        clearTimeout(timeout)
        resolve({ ok: false, error: error instanceof Error ? error.message : String(error) })
      } finally {
        frame.close()
      }
    }

    window.addEventListener('message', onMessage)
    let started
    try {
      started = await window.api.engine.startBroadcast({
        width: 1280,
        height: 720,
        fps: 30,
        monitorIndex: ${monitorIndex}
      })
    } catch (error) {
      clearTimeout(timeout)
      window.removeEventListener('message', onMessage)
      resolve({ ok: false, error: error instanceof Error ? error.message : String(error) })
      return
    }
    if (!started?.ok) {
      clearTimeout(timeout)
      window.removeEventListener('message', onMessage)
      resolve({ ok: false, error: started?.error || 'native broadcast failed to start' })
      return
    }
    setTimeout(() => window.api.engine.requestBroadcastFrame(123456, 'horizontal'), 500)
  }))()`)
  smokeResult.monitorIndex = monitorIndex
  smokeResult.captureDescription = captureDescription
  smokeResult.displays = displays
  smokeResult.electronDisplays = electronDisplays
  smokeResult.electronSources = electronSources

  await window.webContents.executeJavaScript('window.api.engine.stopBroadcast()')
  const blackCardPassed = !showBlackCard || Boolean(
    smokeResult.blackCardSamples?.black?.every(channel => channel === 0) &&
    smokeResult.blackCardSamples?.red1?.every(channel => channel === 0) &&
    smokeResult.blackCardSamples?.red2?.every(channel => channel === 0) &&
    smokeResult.blackCardSamples?.gray3?.some(channel => channel > 0) &&
    smokeResult.shadowGradient?.flatNeighborPairs <= 350 &&
    smokeResult.shadowGradient?.maxChannelSpread === 0
  )
  passed = Boolean(
    smokeResult?.ok &&
    smokeResult.timestamp === 123456 &&
    smokeResult.codedWidth === 1280 &&
    smokeResult.codedHeight === 720 &&
    smokeResult.primaries === 'bt709' &&
    (smokeResult.transfer === 'srgb' || smokeResult.transfer === 'iec61966-2-1') &&
    smokeResult.matrix === 'rgb' &&
    smokeResult.fullRange === true &&
    smokeResult.nonBlack === true &&
    smokeResult.markerRed === true &&
    blackCardPassed &&
    smokeResult.encodedBytes > 0 &&
    smokeResult.encodedType === 'key'
  )
  window.destroy()
  } catch (error) {
    smokeResult = { ok: false, error: error instanceof Error ? error.stack || error.message : String(error) }
  } finally {
    blackCard?.destroy()
    blackCard = null
    await stopEngine().catch(() => {})
    try { engine.shutdownSystem() } catch {}
    fs.writeFileSync(resultPath, JSON.stringify(smokeResult, null, 2))
    app.exit(passed ? 0 : 1)
  }
}

void app.whenReady().then(runSmoke)
