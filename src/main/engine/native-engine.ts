/**
 * Main-process loader and typed wrapper around the native bgfx engine addon
 * (native/engine -> ilystream_napi.node).
 *
 * The engine renders offscreen on its own native thread. On Windows its output
 * is an NT-shared D3D11 texture that Electron can present without CPU readback;
 * readFrame remains available as a compatibility fallback.
 */
import { app } from 'electron'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import { existsSync } from 'fs'

const requireNative = createRequire(import.meta.url)

/** IlyBlendMode in native/engine/include/ily/types.h. */
export enum BlendMode {
  Normal = 0,
  Alpha = 1,
  Add = 2,
  Multiply = 3,
  Screen = 4
}

export enum PixelFormat {
  Unknown = 0,
  RGBA8 = 1,
  BGRA8 = 2,
  RGBA16F = 3,
  R10G10B10A2 = 4,
  NV12 = 5,
  P010 = 6
}

export enum ColorPrimaries {
  Unspecified = 0,
  BT709 = 1,
  BT2020 = 2
}

export enum TransferFunction {
  Unspecified = 0,
  SRGB = 1,
  BT709 = 2,
  Linear = 3,
  PQ = 4,
  HLG = 5
}

export enum MatrixCoefficients {
  Unspecified = 0,
  RGB = 1,
  BT601 = 2,
  BT709 = 3,
  BT2020NCL = 4
}

export enum ColorRange {
  Unspecified = 0,
  Full = 1,
  Limited = 2
}

export enum AlphaMode {
  Opaque = 0,
  Straight = 1,
  Premultiplied = 2
}

export interface ColorDescription {
  primaries: ColorPrimaries
  transfer: TransferFunction
  matrix: MatrixCoefficients
  range: ColorRange
}

export interface OutputColorConfig {
  format: PixelFormat
  color: ColorDescription
  sdrWhiteNits: number
  hdrNominalPeakNits: number
}

export interface TextureDescription {
  width: number
  height: number
  format: PixelFormat
  color: ColorDescription
  alphaMode: AlphaMode
}

export interface ScreenCaptureDescription {
  width: number
  height: number
  format: PixelFormat
  color: ColorDescription
  hdr: boolean
  sdrWhiteNits: number
  maxLuminance: number
  maxFullFrameLuminance: number
}

export interface ScreenCaptureDisplay {
  index: number
  deviceName: string
  left: number
  top: number
  right: number
  bottom: number
  hdr: boolean
}

export interface CameraCaptureDescription {
  width: number
  height: number
  frameRateNumerator: number
  frameRateDenominator: number
  format: PixelFormat
  color: ColorDescription
  gpuFrames: boolean
  deviceName: string
}

export interface CameraCaptureDevice {
  friendlyName: string
  symbolicLink: string
}

export const SRGB_FULL_COLOR: ColorDescription = {
  primaries: ColorPrimaries.BT709,
  transfer: TransferFunction.SRGB,
  matrix: MatrixCoefficients.RGB,
  range: ColorRange.Full
}

export const SDR_OUTPUT_COLOR: OutputColorConfig = {
  format: PixelFormat.RGBA8,
  color: SRGB_FULL_COLOR,
  sdrWhiteNits: 100,
  hdrNominalPeakNits: 1000
}

export interface EngineConfig {
  width: number
  height: number
  fps: number
  enableValidation?: boolean
  linearBlending?: boolean
  outputColor?: OutputColorConfig
}

export interface Vec3 { x: number; y: number; z: number }
export interface Vec2 { x: number; y: number }
export interface Rect { left: number; top: number; right: number; bottom: number }

export interface Transform {
  position: Vec3
  rotation: Vec3
  scale: Vec3
  anchor: Vec2
  pivot: Vec2
  crop: Rect
  visibility: boolean
  opacity: number
}

/**
 * Per-layer chroma key, all values normalized 0..1. Math matches the canvas
 * compositor (gamma-space RGB distance) so existing key settings port 1:1.
 */
export interface LayerChromaKey {
  keyR: number
  keyG: number
  keyB: number
  similarity: number
  smoothness: number
  spill: number
}

/**
 * Per-layer color adjustment: row-major 3x4 matrix (rows R,G,B; each row =
 * mR,mG,mB,offset) plus an alpha multiplier — the composed CSS-filter
 * enhancement chain, applied by the sprite shader in gamma space.
 */
export interface LayerColorAdjust {
  matrix: number[]
  alpha: number
}

/**
 * Focus-circle sharp region: center and radius in output pixels, content-local
 * from the quad's top-left in texcoord orientation. Flips need no adjustment —
 * the circle SDF mirrors with the quad's negative-scale flip. The engine draws
 * it as a sharp overlay over the blurred base layer.
 */
export interface LayerCircleMask {
  x: number
  y: number
  radius: number
}

export interface Layer {
  texture: bigint
  transform: Transform
  opacity: number
  blendMode: BlendMode
  /** Present = keying enabled for this layer. */
  chromaKey?: LayerChromaKey
  /** Present = color adjustment enabled for this layer. */
  colorAdjust?: LayerColorAdjust
  /** Rounded-corner mask radius in output pixels; omit or 0 disables. */
  cornerRadius?: number
  /**
   * Gaussian blur sigma in output pixels for the blurred base draw; omit or 0
   * disables. The engine downsamples the blur intermediate for large sigmas and
   * clamps to 64.
   */
  blurSigma?: number
  /** Present = focus-circle sharp overlay clipped to this circle. */
  circleMask?: LayerCircleMask
  /**
   * Optional image-mask texture handle (OBS-style). Its alpha multiplies the
   * layer's, stretched across the layout rect. Omit to disable.
   */
  maskTexture?: bigint
  /**
   * Maps the drawn quad's UV into the layout rect masks are positioned in:
   * [offsetU, offsetV, scaleU, scaleV]. Omit for identity (quad fills the rect).
   */
  maskTransform?: [number, number, number, number]
}

export interface Frame {
  width: number
  height: number
  /** Tightly packed RGBA8, width*height*4 bytes. Reused across reads. */
  data: Buffer
}

export interface SharedOutputTexture {
  /** Engine-owned Windows NT HANDLE encoded as pointer-sized native bytes. */
  handle: Buffer
  width: number
  height: number
  pixelFormat: 'rgba'
  color: OutputColorConfig
}

export interface ProgramExportDescriptor {
  structSize: number
  version: 1
  /** Changes whenever the two GPU slots are recreated. */
  generation: bigint
  /** Advances only when the producer publishes a complete frame. */
  frameSequence: bigint
  /** Packed Windows adapter LUID: unsigned high 32 bits followed by low 32 bits. */
  adapterLuid: bigint
  width: number
  height: number
  format: PixelFormat.RGBA8
  slotCount: 2
  /** UINT32_MAX until the first frame is published; otherwise 0 or 1. */
  latestSlot: number
  producerAcquireKey: 0n
  consumerAcquireKey: 1n
  controlBlockVersion: 1
  controlBlockSize: number
  /** Engine-process handles; never send these to another process. */
  sharedHandles: [Buffer, Buffer]
  /** Engine-process anonymous mapping handle; never send this to another process. */
  controlMappingHandle: Buffer
}

export interface ProgramExportDuplicatedHandles {
  structSize: number
  version: 1
  generation: bigint
  slotCount: 2
  /** Handles already duplicated into the authenticated target process. */
  textureHandles: [bigint, bigint]
  /** Read-only anonymous control-mapping handle in the target process. */
  controlHandle: bigint
}

/** Shape of the native addon's exports (see native/engine/src/napi_bindings.cpp). */
interface NativeAddon {
  initializeSystem(): number
  shutdownSystem(): void
  createEngine(config: EngineConfig): bigint
  destroyEngine(engine: bigint): number
  engineLoadTexture(engine: bigint, filePath: string): bigint
  engineCreateColorTexture(engine: bigint, rgba: number): bigint
  engineCreateTextureFromPixels(engine: bigint, width: number, height: number, rgba: Buffer): bigint
  engineCreateTextureFromPixelsEx(engine: bigint, description: TextureDescription, pixels: Buffer): bigint
  engineCreateSharedTexture(engine: bigint, description: TextureDescription, sharedHandle: Buffer): bigint
  engineCreateScreenCapture(engine: bigint, monitorIndex: number, targetFps: number): { texture: bigint; sharedMemoryName: string; description: ScreenCaptureDescription }
  listScreenCaptureDisplays(): ScreenCaptureDisplay[]
  engineCreateCameraCapture(engine: bigint, deviceIdentity: string, width: number, height: number, targetFps: number): { texture: bigint; description: CameraCaptureDescription }
  listCameraCaptureDevices(): CameraCaptureDevice[]
  engineUpdateTexture(engine: bigint, texture: bigint, rgba: Buffer): number
  engineDestroyTexture(engine: bigint, texture: bigint): number
  engineSetLayers(engine: bigint, layers: Layer[], outputIndex?: number): number
  engineCreateOutput(engine: bigint, width: number, height: number): number
  engineDestroyOutput(engine: bigint, outputIndex: number): number
  engineGetSharedOutputTexture(engine: bigint, outputIndex?: number): SharedOutputTexture
  engineGetProgramExportDescriptor(engine: bigint): ProgramExportDescriptor
  engineSetProgramExportEnabled(engine: bigint, enabled: boolean): number
  engineDuplicateProgramExportHandles(
    engine: bigint,
    targetProcessId: number,
    expectedGeneration: bigint,
    expectedSlotCount: number
  ): ProgramExportDuplicatedHandles
  engineGetOutputColorConfig(engine: bigint): OutputColorConfig
  engineReadPixels(
    engine: bigint,
    buffer: Buffer,
    outputIndex?: number
  ): { result: number; width: number; height: number }
}

/** Candidate locations for the built addon, dev and packaged. */
function addonCandidates(): string[] {
  const override = process.env.ILY_ENGINE_ADDON
  const appPath = app.getAppPath()
  return [
    ...(override ? [override] : []),
    // Packaged: electron-builder extraResources copies it here (see package.json).
    join(process.resourcesPath ?? '', 'native-engine', 'ilystream_napi.node'),
    // Dev: raw CMake build output.
    join(appPath, 'native', 'engine', 'build', 'Release', 'ilystream_napi.node'),
    join(process.cwd(), 'native', 'engine', 'build', 'Release', 'ilystream_napi.node')
  ].filter(Boolean)
}

let addon: NativeAddon | null = null

/**
 * Locate and load the addon. The addon depends on ilystream_engine.dll living
 * beside it; Windows resolves a module's dependencies from the host exe dir and
 * PATH (not the module's own dir), so we prepend the addon directory to PATH
 * before requiring it.
 */
function loadAddon(): NativeAddon {
  if (addon) return addon

  const found = addonCandidates().find((candidate) => existsSync(candidate))
  if (!found) {
    throw new Error(
      `Native engine addon not found. Looked in:\n${addonCandidates().join('\n')}\n` +
        `Build it with: npm run build:engine`
    )
  }

  if (process.platform === 'win32') {
    const dir = dirname(found)
    if (!process.env.PATH?.split(';').includes(dir)) {
      process.env.PATH = `${dir};${process.env.PATH ?? ''}`
    }
  }

  addon = requireNative(found) as NativeAddon
  return addon
}

let systemInitialized = false

/** Idempotently initialize the global engine system. */
export function initEngineSystem(): void {
  if (systemInitialized) return
  loadAddon().initializeSystem()
  systemInitialized = true
}

export function shutdownEngineSystem(): void {
  if (!systemInitialized || !addon) return
  addon.shutdownSystem()
  systemInitialized = false
}

/**
 * A single engine instance that renders a retained list of layers offscreen.
 */
export class NativeEngine {
  private readonly api: NativeAddon
  private handle: bigint
  private readonly width: number
  private readonly height: number
  private frameBuffer: Buffer | null = null
  private destroyed = false

  constructor(config: EngineConfig) {
    initEngineSystem()
    this.api = loadAddon()
    this.width = config.width
    this.height = config.height
    this.handle = this.api.createEngine({
      enableValidation: false,
      linearBlending: true,
      outputColor: SDR_OUTPUT_COLOR,
      ...config
    })
  }

  static listScreenCaptureDisplays(): ScreenCaptureDisplay[] {
    return loadAddon().listScreenCaptureDisplays()
  }

  static listCameraCaptureDevices(): CameraCaptureDevice[] {
    return loadAddon().listCameraCaptureDevices()
  }

  /** Load an image file (png/jpg/...) as a texture. Returns a texture handle. */
  loadTexture(filePath: string): bigint {
    this.assertAlive()
    return this.api.engineLoadTexture(this.handle, filePath)
  }

  /** Create a 1x1 solid-color texture. `rgba` is packed 0xRRGGBBAA. */
  createColorTexture(rgba: number): bigint {
    this.assertAlive()
    return this.api.engineCreateColorTexture(this.handle, rgba >>> 0)
  }

  /** Create a texture from tightly packed RGBA8 pixels (width*height*4 bytes). */
  createTextureFromPixels(width: number, height: number, rgba: Buffer): bigint {
    this.assertAlive()
    return this.api.engineCreateTextureFromPixels(this.handle, width, height, rgba)
  }

  /** Create a texture with explicit pixel, color-space and alpha metadata. */
  createDescribedTexture(description: TextureDescription, pixels: Buffer): bigint {
    this.assertAlive()
    return this.api.engineCreateTextureFromPixelsEx(this.handle, description, pixels)
  }

  /**
   * Adopt a GPU surface the host already owns, by platform shared handle — the
   * zero-copy counterpart to createDescribedTexture. The caller keeps ownership
   * of the handle and must keep it alive until this texture is destroyed.
   */
  createSharedTexture(description: TextureDescription, sharedHandle: Buffer): bigint {
    this.assertAlive()
    return this.api.engineCreateSharedTexture(this.handle, description, sharedHandle)
  }

  /** 
   * Create a hardware-accelerated screen capture texture. 
   * The texture updates automatically on a background thread.
   */
  createScreenCapture(monitorIndex: number, targetFps: number): { texture: bigint; sharedMemoryName: string; description: ScreenCaptureDescription } {
    this.assertAlive()
    return this.api.engineCreateScreenCapture(this.handle, monitorIndex, targetFps)
  }

  /**
   * Create a Media Foundation camera texture that updates on a native thread.
   * `deviceIdentity` may be a browser label or the native symbolic link.
   */
  createCameraCapture(
    deviceIdentity: string,
    width: number,
    height: number,
    targetFps: number
  ): { texture: bigint; description: CameraCaptureDescription } {
    this.assertAlive()
    return this.api.engineCreateCameraCapture(
      this.handle,
      deviceIdentity,
      width,
      height,
      targetFps
    )
  }

  /**
   * Update an existing texture's pixels in place (must match its size). The
   * per-frame path for a live source — no reallocation.
   */
  updateTexture(texture: bigint, rgba: Buffer): void {
    this.assertAlive()
    const res = this.api.engineUpdateTexture(this.handle, texture, rgba)
    if (res !== 0) {
      console.log(`[engine-preview] updateTexture failed with code: ${res}`)
    }
  }

  destroyTexture(texture: bigint): void {
    this.assertAlive()
    this.api.engineDestroyTexture(this.handle, texture)
  }

  /**
   * Replace the retained layer list composited every frame. `outputIndex`
   * selects which output the list belongs to; 0 is the engine's own.
   */
  setLayers(layers: Layer[], outputIndex = 0): void {
    this.assertAlive()
    const result = this.api.engineSetLayers(this.handle, layers, outputIndex)
    if (result !== 0) throw new Error(`Native engine setLayers failed with code ${result}`)
  }

  /**
   * Add an output beside this engine's own. Outputs share the engine's textures
   * and composite in the same GPU frame, so a second one (a 9:16 feed beside
   * the 16:9 program) costs one extra composite rather than a second engine and
   * a second capture of every source. Returns the output's index.
   */
  createOutput(width: number, height: number): number {
    this.assertAlive()
    return this.api.engineCreateOutput(this.handle, width, height)
  }

  destroyOutput(outputIndex: number): void {
    this.assertAlive()
    this.api.engineDestroyOutput(this.handle, outputIndex)
  }

  /**
   * The persistent GPU output texture for one output (0 = the engine's own).
   * Each output has its own, so a secondary output can be presented and encoded
   * without a readback.
   */
  getSharedOutputTexture(outputIndex = 0): SharedOutputTexture {
    this.assertAlive()
    return this.api.engineGetSharedOutputTexture(this.handle, outputIndex)
  }

  /**
   * Describe the dedicated broadcast Program export. This is independent of
   * getSharedOutputTexture so Electron preview lifetime remains unchanged.
   */
  getProgramExportDescriptor(): ProgramExportDescriptor {
    this.assertAlive()
    return this.api.engineGetProgramExportDescriptor(this.handle)
  }

  /** Enable GPU publication only while at least one authenticated consumer exists. */
  setProgramExportEnabled(enabled: boolean): void {
    this.assertAlive()
    const result = this.api.engineSetProgramExportEnabled(this.handle, enabled)
    if (result !== 0) {
      throw new Error(`Native engine Program export toggle failed with code ${result}`)
    }
  }

  /**
   * Duplicate this descriptor generation's two NT handles into an already
   * authenticated consumer process. The target process owns and closes them.
   * Callers must authenticate and strictly validate targetProcessId before use.
   */
  duplicateProgramExportHandles(
    targetProcessId: number,
    expectedGeneration: bigint,
    expectedSlotCount = 2
  ): ProgramExportDuplicatedHandles {
    this.assertAlive()
    return this.api.engineDuplicateProgramExportHandles(
      this.handle,
      targetProcessId,
      expectedGeneration,
      expectedSlotCount
    )
  }

  getOutputColorConfig(): OutputColorConfig {
    this.assertAlive()
    return this.api.engineGetOutputColorConfig(this.handle)
  }

  /**
   * Read the latest composited frame. Returns a Frame whose `data` buffer is
   * reused across calls (copy it if you need to retain it), or null on failure.
   */
  readFrame(): Frame | null {
    this.assertAlive()
    this.frameBuffer ??= Buffer.alloc(this.width * this.height * 4)
    const { result, width, height } = this.api.engineReadPixels(this.handle, this.frameBuffer)
    if (result !== 0) return null
    return { width, height, data: this.frameBuffer }
  }

  /**
   * Read a secondary output's frame. Unlike readFrame this allocates per call:
   * outputs have their own sizes, so there is no single reusable buffer.
   */
  readOutputFrame(outputIndex: number, width: number, height: number): Frame | null {
    this.assertAlive()
    const buffer = Buffer.alloc(width * height * 4)
    const frame = this.api.engineReadPixels(this.handle, buffer, outputIndex)
    if (frame.result !== 0) return null
    return { width: frame.width, height: frame.height, data: buffer }
  }

  get size(): { width: number; height: number } {
    return { width: this.width, height: this.height }
  }

  destroy(): void {
    if (this.destroyed) return
    this.api.destroyEngine(this.handle)
    this.destroyed = true
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('NativeEngine used after destroy()')
  }
}

/**
 * Convenience: a transform for a UNIT (1x1) source texture — e.g. a color
 * texture — drawn as a rect at (x,y) sized w*h. For a real image texture use
 * imageTransform (scale multiplies the source's own pixel size).
 */
export function rectTransform(x: number, y: number, w: number, h: number): Transform {
  return {
    position: { x, y, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: w, y: h, z: 1 },
    anchor: { x: 0, y: 0 },
    pivot: { x: 0, y: 0 },
    crop: { left: 0, top: 0, right: 0, bottom: 0 },
    visibility: true,
    opacity: 1
  }
}

/** Draw an image texture at its native pixel size, top-left at (x,y), scaled. */
export function imageTransform(x: number, y: number, scale = 1): Transform {
  return {
    position: { x, y, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: scale, y: scale, z: 1 },
    anchor: { x: 0, y: 0 },
    pivot: { x: 0, y: 0 },
    crop: { left: 0, top: 0, right: 0, bottom: 0 },
    visibility: true,
    opacity: 1
  }
}
