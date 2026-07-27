import {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  nativeImage,
  screen,
  sharedTexture,
  type SharedTextureImported
} from 'electron'
import { existsSync } from 'fs'
import { basename, isAbsolute, join } from 'path'
import { fileURLToPath } from 'url'
import {
  NativeEngine,
  imageTransform,
  BlendMode,
  ColorPrimaries,
  TransferFunction,
  MatrixCoefficients,
  ColorRange,
  PixelFormat,
  AlphaMode,
  SRGB_FULL_COLOR,
  shutdownEngineSystem,
  type Layer,
  type OutputColorConfig,
  type ScreenCaptureDescription
} from '../../engine/native-engine'
import type { BrowserSourceService } from '../../services/browser-source-service'
import {
  computeNativeCompositorTransform,
  type NativeBroadcastScene,
  type NativeLiveSourceFrame,
  type NativeSceneBlendMode,
  type NativeSceneLayer,
  type NativeSceneSource
} from '../../../shared/native-scene'

/**
 * Live preview of the native engine.
 *
 * Primary capture path is NATIVE DXGI Desktop Duplication (createScreenCapture):
 * a dedicated capture thread copies the desktop into a shared D3D11 texture
 * imported by the compositor at refresh rate. If DXGI is unavailable (e.g. RDP),
 * we fall back to Electron's desktopCapturer, which caps ~15-30fps.
 *
 * The primary presentation path imports the compositor's persistent NT-shared
 * D3D11 output into Electron and samples it as a VideoFrame in the renderer.
 * CPU readback remains registered only as a compatibility fallback.
 */
const OUTPUT_FPS = 144
const FALLBACK_CAPTURE_FPS = 30
const SHARED_TEXTURE_RELEASE_TIMEOUT_MS = 1500
const MAX_LIVE_SOURCE_PIXELS = 3840 * 2160

interface MappedCaptureDisplay {
  index: number
  deviceName: string
  name: string
  label: string
  sourceId?: string
  displayId?: string
  left: number
  top: number
  right: number
  bottom: number
  hdr: boolean
}

interface BroadcastSceneTexture {
  texture: bigint
  width: number
  height: number
  kind: NativeSceneLayer['source']['kind']
  /** Only renderer-fed live textures may accept RGBA IPC uploads. */
  acceptsRendererFrames?: boolean
  /** Set when the main process feeds this texture from a browser-source capture. */
  browserSourceId?: string
}

let engine: NativeEngine | null = null
let captureTimer: ReturnType<typeof setTimeout> | null = null
let running = false
let importedOutput: SharedTextureImported | null = null
let outputReferencesReleased: Promise<void> | null = null
let stopPromise: Promise<void> | null = null
let previewCaptureTexture: bigint | null = null
let previewMonitorIndex = -1
let previewCaptureDescription: ScreenCaptureDescription | undefined
let previewFallbackTexture: bigint | null = null
let previewFallbackGeneration = 0
let broadcastEngine: NativeEngine | null = null
let importedBroadcastOutput: SharedTextureImported | null = null
let broadcastOutputReferencesReleased: Promise<void> | null = null
let stopBroadcastPromise: Promise<void> | null = null
let broadcastSceneTextures = new Map<string, BroadcastSceneTexture>()
let broadcastDisplayIndexes = new Map<string, number>()
let broadcastSceneUpdatePromise: Promise<void> | null = null
let broadcastFps = 60
// Last successfully applied native scene, kept so main-fed sources can rebuild
// the layer list (e.g. after a browser-source resize) without the renderer.
let broadcastLastScene: NativeBroadcastScene | null = null
let browserSourceServiceRef: BrowserSourceService | null = null

function toElectronColorSpace(output: OutputColorConfig): Electron.ColorSpace {
  return {
    primaries: output.color.primaries === ColorPrimaries.BT2020 ? 'bt2020' : 'bt709',
    transfer:
      output.color.transfer === TransferFunction.PQ ? 'pq' :
      output.color.transfer === TransferFunction.HLG ? 'hlg' :
      output.color.transfer === TransferFunction.Linear ? 'linear' :
      output.color.transfer === TransferFunction.BT709 ? 'bt709' :
      'srgb',
    matrix:
      output.color.matrix === MatrixCoefficients.BT2020NCL ? 'bt2020-ncl' :
      output.color.matrix === MatrixCoefficients.BT709 ? 'bt709' :
      'rgb',
    range:
      output.color.range === ColorRange.Full ? 'full' :
      output.color.range === ColorRange.Limited ? 'limited' :
      'derived'
  }
}

function waitForSharedTextureRelease(released: Promise<void>): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), SHARED_TEXTURE_RELEASE_TIMEOUT_MS)
    void released.then(() => {
      clearTimeout(timer)
      resolve(true)
    })
  })
}

async function getMappedCaptureDisplays(): Promise<MappedCaptureDisplay[]> {
  const nativeDisplays = NativeEngine.listScreenCaptureDisplays()
  const electronDisplays = screen.getAllDisplays()
  let sources: Awaited<ReturnType<typeof desktopCapturer.getSources>> = []
  try {
    sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 }
    })
  } catch (error) {
    process.stderr.write(`[engine-preview] unable to read Electron display labels: ${(error as Error).message}\n`)
  }

  const mapped = nativeDisplays.map<MappedCaptureDisplay>((nativeDisplay) => {
    const electronDisplay = electronDisplays.find((display) =>
      display.nativeOrigin.x === nativeDisplay.left &&
      display.nativeOrigin.y === nativeDisplay.top
    )
    const source = electronDisplay
      ? sources.find((candidate) => candidate.display_id === String(electronDisplay.id))
      : undefined
    const displayNumber = /DISPLAY(\d+)$/i.exec(nativeDisplay.deviceName)?.[1]
    return {
      ...nativeDisplay,
      name: source?.name ?? (displayNumber ? `Screen ${displayNumber}` : nativeDisplay.deviceName),
      label: electronDisplay?.label ?? nativeDisplay.deviceName,
      sourceId: source?.id,
      displayId: source?.display_id
    }
  })

  return mapped.sort((left, right) => {
    const leftNumber = Number.parseInt(/(\d+)$/.exec(left.name)?.[1] ?? '', 10)
    const rightNumber = Number.parseInt(/(\d+)$/.exec(right.name)?.[1] ?? '', 10)
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return leftNumber - rightNumber
    }
    return left.index - right.index
  })
}

function toNativeBlendMode(blendMode: NativeSceneBlendMode): BlendMode {
  switch (blendMode) {
    case 'additive': return BlendMode.Add
    case 'multiply': return BlendMode.Multiply
    case 'screen': return BlendMode.Screen
    default: return BlendMode.Alpha
  }
}

function resolveNativeImagePath(assetPath: string): string {
  if (assetPath.startsWith('asset://')) {
    const encodedId = assetPath.replace(/^asset:\/+/, '').replace(/^app\//, '')
    const assetId = decodeURIComponent(encodedId)
    if (!assetId || assetId !== basename(assetId)) {
      throw new Error('Invalid native image asset ID')
    }
    const resolved = join(app.getPath('userData'), 'assets', assetId)
    if (!existsSync(resolved)) throw new Error(`Native image asset not found: ${assetId}`)
    return resolved
  }

  let resolved = assetPath
  if (assetPath.startsWith('file://')) {
    resolved = fileURLToPath(assetPath)
  }
  if (!isAbsolute(resolved) || !existsSync(resolved)) {
    throw new Error(`Native image source is unavailable: ${assetPath}`)
  }
  return resolved
}

async function createBroadcastSceneTexture(
  eng: NativeEngine,
  source: NativeSceneSource,
  layerId: string
): Promise<BroadcastSceneTexture> {
  if (source.kind === 'display') {
    const monitorIndex = broadcastDisplayIndexes.get(source.sourceId)
    if (monitorIndex === undefined) {
      throw new Error(`Native display source is unavailable: ${source.sourceId}`)
    }
    const capture = eng.createScreenCapture(monitorIndex, broadcastFps)
    return {
      texture: capture.texture,
      width: capture.description.width,
      height: capture.description.height,
      kind: source.kind
    }
  }

  if (source.kind === 'image') {
    const imagePath = resolveNativeImagePath(source.assetPath)
    const decoded = nativeImage.createFromPath(imagePath)
    const size = decoded.getSize()
    if (decoded.isEmpty() || size.width <= 0 || size.height <= 0) {
      throw new Error(`Native image could not be decoded: ${source.assetPath}`)
    }
    return {
      texture: eng.loadTexture(imagePath),
      width: size.width,
      height: size.height,
      kind: source.kind
    }
  }

  const width = Math.max(1, Math.min(8192, Math.round(source.width)))
  const height = Math.max(1, Math.min(8192, Math.round(source.height)))
  if (width * height > MAX_LIVE_SOURCE_PIXELS) {
    throw new Error(`Native source exceeds the 4K pixel budget for layer ${layerId}`)
  }
  if (source.kind === 'live') {
    if (source.feed === 'native-camera') {
      const deviceName = source.deviceName?.trim()
      if (!deviceName) {
        throw new Error(`Native camera identity is missing for layer ${layerId}`)
      }
      const capture = eng.createCameraCapture(
        deviceName,
        width,
        height,
        Math.max(1, Math.min(144, Math.round(source.targetFps ?? broadcastFps)))
      )
      return {
        texture: capture.texture,
        width: capture.description.width,
        height: capture.description.height,
        kind: source.kind,
        acceptsRendererFrames: false
      }
    }
    if (source.feed === 'browser-source' && source.browserSourceId) {
      // Main-fed widget/overlay: BGRA8 texture updated directly from the
      // offscreen browser-source paint frames (no renderer round trip, no
      // channel swizzle). Straight alpha — the sprite shader premultiplies.
      const texture = eng.createDescribedTexture(
        {
          width,
          height,
          format: PixelFormat.BGRA8,
          color: SRGB_FULL_COLOR,
          alphaMode: AlphaMode.Straight
        },
        Buffer.alloc(width * height * 4)
      )
      return {
        texture,
        width,
        height,
        kind: source.kind,
        acceptsRendererFrames: false,
        browserSourceId: source.browserSourceId
      }
    }
    return {
      texture: eng.createTextureFromPixels(width, height, Buffer.alloc(width * height * 4)),
      width,
      height,
      kind: source.kind,
      acceptsRendererFrames: true
    }
  }

  const pixels = source.pixels
  if (pixels.byteLength !== width * height * 4) {
    throw new Error(`Invalid native pixel source size for layer ${layerId}`)
  }
  return {
    texture: eng.createTextureFromPixels(
      width,
      height,
      Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength)
    ),
    width,
    height,
    kind: source.kind
  }
}

function waitForBroadcastComposite(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.ceil(2000 / Math.max(1, broadcastFps))))
}

/** Map a native scene onto the current texture set. Null if a texture is missing. */
function buildLayersFromScene(
  eng: NativeEngine,
  scene: NativeBroadcastScene,
  textures: Map<string, BroadcastSceneTexture>
): Layer[] | null {
  const layers: Layer[] = []
  for (const layer of scene.layers) {
    const sourceTexture = textures.get(layer.source.key)
    if (!sourceTexture) return null
    const maskTexture = layer.maskSource ? textures.get(layer.maskSource.key) : undefined
    if (layer.maskSource && !maskTexture) return null
    const transform = computeNativeCompositorTransform(
      layer.layout,
      sourceTexture,
      scene.canvasWidth,
      scene.canvasHeight,
      eng.size.width,
      eng.size.height
    )
    layers.push({
      texture: sourceTexture.texture,
      transform,
      // The mask geometry lives in layout-rect space; a letterboxed contain fit
      // draws a sub-region, so the engine remaps mask UVs with this transform.
      maskTransform: transform.maskTransform,
      opacity: Math.max(0, Math.min(1, layer.opacity)),
      blendMode: toNativeBlendMode(layer.blendMode),
      ...(layer.chromaKey ? { chromaKey: layer.chromaKey } : {}),
      ...(layer.colorAdjust ? { colorAdjust: layer.colorAdjust } : {}),
      // The scene carries the radius and blur sigma in canvas pixels; the
      // engine masks and blurs in output pixels.
      ...(layer.cornerRadius
        ? { cornerRadius: layer.cornerRadius * (eng.size.width / Math.max(1, scene.canvasWidth)) }
        : {}),
      ...(layer.blurSigma
        ? { blurSigma: layer.blurSigma * (eng.size.width / Math.max(1, scene.canvasWidth)) }
        : {}),
      ...(layer.circleMask
        ? {
            circleMask: {
              x: layer.circleMask.x * (eng.size.width / Math.max(1, scene.canvasWidth)),
              y: layer.circleMask.y * (eng.size.width / Math.max(1, scene.canvasWidth)),
              radius: layer.circleMask.radius * (eng.size.width / Math.max(1, scene.canvasWidth))
            }
          }
        : {}),
      ...(maskTexture ? { maskTexture: maskTexture.texture } : {})
    })
  }
  return layers
}

/**
 * Feed a browser-source capture's BGRA paint frames straight into its engine
 * texture. On a size change the texture is recreated at the new size and the
 * layer list rebuilt from the last applied scene — unless a scene update is in
 * flight, in which case the frame is skipped (the update will settle sizes).
 */
function attachBrowserSourceSink(eng: NativeEngine, sourceKey: string, browserSourceId: string): void {
  const service = browserSourceServiceRef
  if (!service) return
  service.setEngineFrameSink(browserSourceId, (frame) => {
    if (broadcastEngine !== eng) return
    const entry = broadcastSceneTextures.get(sourceKey)
    if (!entry || entry.browserSourceId !== browserSourceId) return

    if (frame.width !== entry.width || frame.height !== entry.height) {
      if (broadcastSceneUpdatePromise) return
      const maxPixels = MAX_LIVE_SOURCE_PIXELS
      if (frame.width <= 0 || frame.height <= 0 || frame.width * frame.height > maxPixels) return
      try {
        const texture = eng.createDescribedTexture(
          {
            width: frame.width,
            height: frame.height,
            format: PixelFormat.BGRA8,
            color: SRGB_FULL_COLOR,
            alphaMode: AlphaMode.Straight
          },
          frame.bgra
        )
        eng.destroyTexture(entry.texture)
        broadcastSceneTextures.set(sourceKey, {
          ...entry,
          texture,
          width: frame.width,
          height: frame.height
        })
        rebuildBroadcastLayers(eng)
      } catch (error) {
        console.warn(`[engine-broadcast] browser-source resize failed for ${browserSourceId}:`, error)
      }
      return
    }

    eng.updateTexture(entry.texture, frame.bgra)
  })
}

function detachBrowserSourceSinks(keys?: Iterable<string>): void {
  const service = browserSourceServiceRef
  if (!service) return
  const targets = keys ? [...keys] : [...broadcastSceneTextures.keys()]
  for (const key of targets) {
    const entry = broadcastSceneTextures.get(key)
    if (entry?.browserSourceId) service.setEngineFrameSink(entry.browserSourceId, null)
  }
}

function rebuildBroadcastLayers(eng: NativeEngine): void {
  if (!broadcastLastScene || broadcastEngine !== eng) return
  const layers = buildLayersFromScene(eng, broadcastLastScene, broadcastSceneTextures)
  if (layers) eng.setLayers(layers)
}

async function applyNativeBroadcastScene(
  eng: NativeEngine,
  scene: NativeBroadcastScene
): Promise<void> {
  if (broadcastEngine !== eng) throw new Error('Native broadcast stopped before scene update')
  if (scene.layers.length > 128) throw new Error('Native scene exceeds the 128-layer limit')

  const stagedTextures = new Map(broadcastSceneTextures)
  const createdKeys: string[] = []
  const usedKeys = new Set<string>()

  try {
    for (const layer of scene.layers) {
      const sources: NativeSceneSource[] = [layer.source]
      // The image mask is a second image source uploaded like any other.
      if (layer.maskSource) sources.push(layer.maskSource)
      for (const source of sources) {
        const sourceKey = source.key
        let sourceTexture = stagedTextures.get(sourceKey)
        if (sourceTexture && sourceTexture.kind !== source.kind) {
          throw new Error(`Native source key changed kind: ${sourceKey}`)
        }
        if (!sourceTexture) {
          sourceTexture = await createBroadcastSceneTexture(eng, source, layer.id)
          stagedTextures.set(sourceKey, sourceTexture)
          createdKeys.push(sourceKey)
        }
        usedKeys.add(sourceKey)
      }
    }

    const layers = buildLayersFromScene(eng, scene, stagedTextures)
    if (!layers) throw new Error('Native scene textures missing after staging')

    eng.setLayers(layers)
    await waitForBroadcastComposite()
    if (broadcastEngine !== eng) throw new Error('Native broadcast stopped during scene update')

    // Retire textures no longer referenced (detach their sinks first).
    const retiredKeys: string[] = []
    for (const [key] of broadcastSceneTextures) {
      if (!usedKeys.has(key)) retiredKeys.push(key)
    }
    detachBrowserSourceSinks(retiredKeys)
    for (const key of retiredKeys) {
      const sourceTexture = broadcastSceneTextures.get(key)
      if (sourceTexture) eng.destroyTexture(sourceTexture.texture)
      stagedTextures.delete(key)
    }

    broadcastSceneTextures = stagedTextures
    broadcastLastScene = scene

    // Attach sinks for newly created main-fed sources.
    for (const key of createdKeys) {
      const entry = stagedTextures.get(key)
      if (entry?.browserSourceId) attachBrowserSourceSink(eng, key, entry.browserSourceId)
    }
  } catch (error) {
    for (const key of createdKeys) {
      const sourceTexture = stagedTextures.get(key)
      if (sourceTexture) {
        if (sourceTexture.browserSourceId) {
          browserSourceServiceRef?.setEngineFrameSink(sourceTexture.browserSourceId, null)
        }
        eng.destroyTexture(sourceTexture.texture)
      }
    }
    throw error
  }
}

function queueNativeBroadcastSceneUpdate(
  eng: NativeEngine,
  scene: NativeBroadcastScene
): Promise<void> {
  const previous = broadcastSceneUpdatePromise ?? Promise.resolve()
  const operation = previous
    .catch(() => {})
    .then(() => applyNativeBroadcastScene(eng, scene))
  broadcastSceneUpdatePromise = operation
  void operation.finally(() => {
    if (broadcastSceneUpdatePromise === operation) broadcastSceneUpdatePromise = null
  }).catch(() => {})
  return operation
}

async function releaseImportedOutput(): Promise<void> {
  const imported = importedOutput
  const referencesReleased = outputReferencesReleased
  importedOutput = null
  outputReferencesReleased = null

  if (!imported) return
  imported.release()

  if (referencesReleased && !(await waitForSharedTextureRelease(referencesReleased))) {
    process.stderr.write('[engine-preview] timed out waiting for shared texture consumers to release\n')
  }
}

async function releaseImportedBroadcastOutput(): Promise<void> {
  const imported = importedBroadcastOutput
  const referencesReleased = broadcastOutputReferencesReleased
  importedBroadcastOutput = null
  broadcastOutputReferencesReleased = null

  if (!imported) return
  imported.release()

  if (referencesReleased && !(await waitForSharedTextureRelease(referencesReleased))) {
    process.stderr.write('[engine-broadcast] timed out waiting for shared texture consumers to release\n')
  }
}

async function stopPreview(): Promise<void> {
  if (stopPromise) return stopPromise

  const operation = (async () => {
    running = false
    if (captureTimer) {
      clearTimeout(captureTimer)
      captureTimer = null
    }

    const engineToDestroy = engine
    engine = null
    previewCaptureTexture = null
    previewMonitorIndex = -1
    previewCaptureDescription = undefined
    previewFallbackTexture = null
    previewFallbackGeneration += 1
    await releaseImportedOutput()
    engineToDestroy?.destroy() // also stops any native DXGI capture thread it owns
  })()

  stopPromise = operation
  try {
    await operation
  } finally {
    if (stopPromise === operation) stopPromise = null
  }
}

async function stopNativeBroadcast(): Promise<void> {
  if (stopBroadcastPromise) return stopBroadcastPromise

  const operation = (async () => {
    const engineToDestroy = broadcastEngine
    broadcastEngine = null
    detachBrowserSourceSinks()
    const pendingSceneUpdate = broadcastSceneUpdatePromise
    if (pendingSceneUpdate) await pendingSceneUpdate.catch(() => {})
    broadcastSceneUpdatePromise = null
    await releaseImportedBroadcastOutput()
    engineToDestroy?.destroy()
    broadcastSceneTextures = new Map()
    broadcastDisplayIndexes = new Map()
    broadcastLastScene = null
  })()

  stopBroadcastPromise = operation
  try {
    await operation
  } finally {
    if (stopBroadcastPromise === operation) stopBroadcastPromise = null
  }
}

async function startSharedTexturePresentation(window: BrowserWindow, eng: NativeEngine): Promise<boolean> {
  if (process.platform !== 'win32') return false

  let imported: SharedTextureImported | null = null
  let referencesReleased: Promise<void> | null = null
  try {
    const output = eng.getSharedOutputTexture()
    let markReferencesReleased: (() => void) | null = null
    referencesReleased = new Promise<void>((resolve) => {
      markReferencesReleased = resolve
    })

    imported = sharedTexture.importSharedTexture({
      textureInfo: {
        codedSize: { width: output.width, height: output.height },
        visibleRect: { x: 0, y: 0, width: output.width, height: output.height },
        pixelFormat: output.pixelFormat,
        colorSpace: toElectronColorSpace(output.color),
        handle: { ntHandle: output.handle }
      },
      allReferencesReleased: () => markReferencesReleased?.()
    })

    importedOutput = imported
    outputReferencesReleased = referencesReleased
    await sharedTexture.sendSharedTexture(
      {
        frame: window.webContents.mainFrame,
        importedSharedTexture: imported
      },
      {
        purpose: 'preview',
        width: output.width,
        height: output.height,
        pixelFormat: output.pixelFormat
      }
    )
    return true
  } catch (error) {
    process.stderr.write(
      `[engine-preview] shared texture presentation unavailable, using CPU fallback: ${(error as Error).message}\n`
    )
    if (importedOutput === imported) {
      importedOutput = null
      outputReferencesReleased = null
    }
    imported?.release()
    if (referencesReleased) await waitForSharedTextureRelease(referencesReleased)
    return false
  }
}

async function startBroadcastSharedTexturePresentation(window: BrowserWindow, eng: NativeEngine): Promise<boolean> {
  if (process.platform !== 'win32') return false

  let imported: SharedTextureImported | null = null
  let referencesReleased: Promise<void> | null = null
  try {
    const output = eng.getSharedOutputTexture()
    let markReferencesReleased: (() => void) | null = null
    referencesReleased = new Promise<void>((resolve) => {
      markReferencesReleased = resolve
    })

    imported = sharedTexture.importSharedTexture({
      textureInfo: {
        codedSize: { width: output.width, height: output.height },
        visibleRect: { x: 0, y: 0, width: output.width, height: output.height },
        pixelFormat: output.pixelFormat,
        colorSpace: toElectronColorSpace(output.color),
        handle: { ntHandle: output.handle }
      },
      allReferencesReleased: () => markReferencesReleased?.()
    })

    importedBroadcastOutput = imported
    broadcastOutputReferencesReleased = referencesReleased
    await sharedTexture.sendSharedTexture(
      {
        frame: window.webContents.mainFrame,
        importedSharedTexture: imported
      },
      {
        purpose: 'broadcast',
        width: output.width,
        height: output.height,
        pixelFormat: output.pixelFormat,
        color: output.color
      }
    )
    return true
  } catch (error) {
    process.stderr.write(
      `[engine-broadcast] shared texture presentation unavailable: ${(error as Error).message}\n`
    )
    if (importedBroadcastOutput === imported) {
      importedBroadcastOutput = null
      broadcastOutputReferencesReleased = null
    }
    imported?.release()
    if (referencesReleased) await waitForSharedTextureRelease(referencesReleased)
    return false
  }
}

function fitCaptureTransform(
  sourceWidth: number,
  sourceHeight: number,
  outputWidth: number,
  outputHeight: number
) {
  const scale = Math.min(outputWidth / sourceWidth, outputHeight / sourceHeight)
  const transform = imageTransform(
    (outputWidth - sourceWidth * scale) / 2,
    (outputHeight - sourceHeight * scale) / 2,
    scale
  )
  return transform
}

function waitForPreviewComposite(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.ceil(3000 / OUTPUT_FPS)))
}

async function selectNativePreviewSource(
  eng: NativeEngine,
  width: number,
  height: number,
  monitorIndex: number
): Promise<ScreenCaptureDescription> {
  if (
    previewCaptureTexture !== null &&
    previewMonitorIndex === monitorIndex &&
    previewCaptureDescription
  ) {
    return previewCaptureDescription
  }

  const nextCapture = eng.createScreenCapture(monitorIndex, OUTPUT_FPS)
  const previousCaptureTexture = previewCaptureTexture
  const previousFallbackTexture = previewFallbackTexture

  previewFallbackGeneration += 1

  eng.setLayers([{
    texture: nextCapture.texture,
    transform: fitCaptureTransform(
      nextCapture.description.width,
      nextCapture.description.height,
      width,
      height
    ),
    opacity: 1,
    blendMode: BlendMode.Alpha
  }])

  previewCaptureTexture = nextCapture.texture
  previewMonitorIndex = monitorIndex
  previewCaptureDescription = nextCapture.description

  await waitForPreviewComposite()
  if (engine !== eng || !running) {
    return nextCapture.description
  }
  if (previousCaptureTexture !== null) {
    eng.destroyTexture(previousCaptureTexture)
  }
  if (previousFallbackTexture !== null) {
    eng.destroyTexture(previousFallbackTexture)
    previewFallbackTexture = null
  }

  return nextCapture.description
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
  const generation = ++previewFallbackGeneration
  const nativeDisplay = NativeEngine.listScreenCaptureDisplays()
    .find((display) => display.index === monitorIndex)
  const electronDisplayId = nativeDisplay
    ? screen.getAllDisplays().find((display) =>
        display.nativeOrigin.x === nativeDisplay.left &&
        display.nativeOrigin.y === nativeDisplay.top
      )?.id
    : undefined

  const capture = async (): Promise<void> => {
    if (!running || engine !== eng || previewFallbackGeneration !== generation) return
    const startedAt = Date.now()
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width, height }
      })
      const source = electronDisplayId !== undefined
        ? sources.find((candidate) => candidate.display_id === String(electronDisplayId))
        : sources[monitorIndex] ?? sources[0]
      if (running && engine === eng && previewFallbackGeneration === generation && source) {
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
          previewFallbackTexture = sourceTex
          srcW = size.width
          srcH = size.height
          eng.setLayers([{
            texture: sourceTex,
            transform: fitCaptureTransform(size.width, size.height, width, height),
            opacity: 1,
            blendMode: BlendMode.Alpha
          }])
        } else {
          eng.updateTexture(sourceTex, bmp)
        }
      }
    } catch (err) {
      process.stderr.write(`[engine-preview] desktopCapturer failed: ${(err as Error).message}\n`)
    }
    if (running && engine === eng && previewFallbackGeneration === generation) {
      captureTimer = setTimeout(capture, Math.max(0, captureMs - (Date.now() - startedAt)))
    }
  }
  void capture()
}

export function registerEngineHandlers(window: BrowserWindow, browserSourceService?: BrowserSourceService): void {
  browserSourceServiceRef = browserSourceService ?? null
  ipcMain.handle('engine:preview:displays', () => getMappedCaptureDisplays())
  ipcMain.handle('engine:capture:cameras', () => NativeEngine.listCameraCaptureDevices())

  ipcMain.handle(
    'engine:preview:start',
    async (_event, opts?: { width?: number; height?: number; monitorIndex?: number }) => {
      await stopNativeBroadcast()
      await stopPreview()
      const width = Math.max(16, Math.min(1920, Math.round(opts?.width ?? 1280)))
      const height = Math.max(16, Math.min(1080, Math.round(opts?.height ?? 720)))
      const monitorIndex = Math.max(0, Math.round(opts?.monitorIndex ?? 0))

      const eng = new NativeEngine({ width, height, fps: OUTPUT_FPS })
      engine = eng
      running = true

      // Try native DXGI capture first (high fps, GPU-shared).
      let source = 'screen-dxgi'
      let sharedMemoryName: string | undefined
      let captureDescription: ScreenCaptureDescription | undefined
      try {
        captureDescription = await selectNativePreviewSource(eng, width, height, monitorIndex)
      } catch (err) {
        process.stderr.write(
          `[engine-preview] DXGI capture unavailable, falling back to desktopCapturer: ${(err as Error).message}\n`
        )
        source = 'screen-desktopcapturer'
        startDesktopCapturerFallback(eng, width, height, monitorIndex)
      }

      await waitForPreviewComposite()

      const presentation = await startSharedTexturePresentation(window, eng)
        ? 'shared-texture'
        : 'cpu'

      return {
        ok: true,
        width,
        height,
        source,
        presentation,
        outputFps: OUTPUT_FPS,
        sharedMemoryName,
        captureDescription,
        outputColor: eng.getOutputColorConfig()
      }
    }
  )

  ipcMain.handle(
    'engine:preview:select-source',
    async (_event, opts?: { monitorIndex?: number }) => {
      const eng = engine
      if (!eng || !running) {
        return { ok: false, error: 'Native preview is not running' }
      }

      const monitorIndex = Math.max(0, Math.round(opts?.monitorIndex ?? 0))
      try {
        const captureDescription = await selectNativePreviewSource(
          eng,
          eng.size.width,
          eng.size.height,
          monitorIndex
        )
        if (engine !== eng || !running) {
          return { ok: false, error: 'Native preview stopped while switching sources' }
        }
        return {
          ok: true,
          source: 'screen-dxgi',
          captureDescription
        }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    }
  )

  ipcMain.handle(
    'engine:broadcast:start',
    async (
      _event,
      opts?: {
        width?: number
        height?: number
        fps?: number
        monitorIndex?: number
        desktopSourceId?: string
        scene?: NativeBroadcastScene
      }
    ) => {
      await stopPreview()
      await stopNativeBroadcast()

      const width = Math.max(16, Math.min(3840, Math.round(opts?.width ?? 1920)))
      const height = Math.max(16, Math.min(2160, Math.round(opts?.height ?? 1080)))
      const fps = Math.max(1, Math.min(144, Math.round(opts?.fps ?? 60)))
      broadcastFps = fps
      const requestedMonitorIndex = Math.max(0, Math.round(opts?.monitorIndex ?? 0))
      const mappedDisplays = opts?.scene?.layers.some((layer) => layer.source.kind === 'display') || opts?.desktopSourceId
        ? await getMappedCaptureDisplays()
        : []
      broadcastDisplayIndexes = new Map(
        mappedDisplays.flatMap((display) => display.sourceId ? [[display.sourceId, display.index] as const] : [])
      )
      const mappedDisplay = opts?.desktopSourceId
        ? mappedDisplays.find((display) => display.sourceId === opts.desktopSourceId)
        : undefined
      const monitorIndex = mappedDisplay?.index ?? requestedMonitorIndex

      let eng: NativeEngine | null = null
      try {
        eng = new NativeEngine({ width, height, fps })
        broadcastEngine = eng
        let captureDescription: ScreenCaptureDescription | undefined
        if (opts?.scene) {
          await applyNativeBroadcastScene(eng, opts.scene)
        } else {
          const capture = eng.createScreenCapture(monitorIndex, fps)
          captureDescription = capture.description
          eng.setLayers([{
            texture: capture.texture,
            transform: fitCaptureTransform(
              capture.description.width,
              capture.description.height,
              width,
              height
            ),
            opacity: 1,
            blendMode: BlendMode.Alpha
          }])
        }

        if (!(await startBroadcastSharedTexturePresentation(window, eng))) {
          throw new Error('GPU shared-texture output is unavailable')
        }

        return {
          ok: true,
          width,
          height,
          fps,
          captureDescription,
          outputColor: eng.getOutputColorConfig()
        }
      } catch (error) {
        if (broadcastEngine === eng) broadcastEngine = null
        await releaseImportedBroadcastOutput()
        eng?.destroy()
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    }
  )

  ipcMain.handle('engine:broadcast:update-scene', async (_event, scene: NativeBroadcastScene) => {
    const eng = broadcastEngine
    if (!eng) return { ok: false, error: 'Native broadcast is not running' }
    try {
      await queueNativeBroadcastSceneUpdate(eng, scene)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('engine:broadcast:update-source-frame', (_event, frame: NativeLiveSourceFrame) => {
    const eng = broadcastEngine
    if (!eng) return { ok: false, error: 'Native broadcast is not running' }
    if (!frame || typeof frame.key !== 'string' || !frame.key) {
      return { ok: false, error: 'Invalid native live-source frame' }
    }

    const sourceTexture = broadcastSceneTextures.get(frame.key)
    if (!sourceTexture || sourceTexture.kind !== 'live' || !sourceTexture.acceptsRendererFrames) {
      return { ok: false, error: 'Native live source is not ready' }
    }

    const width = Math.round(frame.width)
    const height = Math.round(frame.height)
    if (width !== sourceTexture.width || height !== sourceTexture.height) {
      return { ok: false, error: 'Native live-source dimensions changed' }
    }
    if (!(frame.pixels instanceof Uint8Array) || frame.pixels.byteLength !== width * height * 4) {
      return { ok: false, error: 'Invalid native live-source pixel buffer' }
    }

    try {
      eng.updateTexture(
        sourceTexture.texture,
        Buffer.from(frame.pixels.buffer, frame.pixels.byteOffset, frame.pixels.byteLength)
      )
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('engine:broadcast:stop', async () => {
    await stopNativeBroadcast()
    return { ok: true }
  })

  ipcMain.handle('engine:preview:stop', async () => {
    await stopPreview()
    return { ok: true }
  })

  // Compatibility fallback for platforms/drivers that cannot import the
  // engine's native output texture into Electron.
  ipcMain.handle('engine:preview:frame', () => {
    if (!engine || !running) return null
    const frame = engine.readFrame()
    if (!frame) return null
    // Hand the engine's frame buffer straight to IPC (no extra copy). Safe
    // because the renderer awaits each frame before requesting the next, so
    // only one readFrame is ever outstanding; IPC serializes it synchronously
    // before the next readFrame can overwrite it.
    return {
      width: frame.width,
      height: frame.height,
      data: frame.data
    }
  })
}

/** Stop any running preview and tear down the global engine system. */
export async function disposeEnginePreview(): Promise<void> {
  await stopPreview()
  await stopNativeBroadcast()
  shutdownEngineSystem()
}
