import type { NativeLiveSourceFrame } from '../../../../shared/native-scene'

/**
 * Camera/window-capture frame pump for the native compositor.
 *
 * The canvas upload path (uploadNativeLiveSources) draws each camera's <video>
 * element to a 2D canvas and calls getImageData — a SYNCHRONOUS GPU→CPU
 * readback on the renderer's main thread, per source, per frame. That stall is
 * the dominant per-camera cost.
 *
 * This pump replaces that for eligible sources: it adds a MediaStreamTrack-
 * Processor sink to the track the <video> element already displays (no clone,
 * no transfer — the element keeps rendering) and reads VideoFrames, doing the
 * pixel readback via the async VideoFrame.copyTo instead of a blocking
 * getImageData. copyTo's actual copy runs in the browser's media pipeline, off
 * the JS main thread, so the render loop no longer stalls on it.
 *
 * copyTo cannot rescale, and the engine rejects any frame whose size differs
 * from the texture it created (source.width × source.height). So the pump only
 * owns a source while the frame's visible size matches; on any mismatch,
 * missing support, or error it PERMANENTLY hands that source back to the canvas
 * path (which rescales for free). isHandling() lets the canvas path skip the
 * sources the pump is actively serving, so a source is never uploaded twice.
 */

export interface CameraFrameSourceSpec {
  /** Native live-source key (matches the engine texture + scene source key). */
  key: string
  /** The track the source's <video> element is currently displaying. */
  track: MediaStreamTrack
  /** Engine texture width in pixels (tightly-packed RGBA target). */
  width: number
  /** Engine texture height in pixels. */
  height: number
  /** Upload cap in frames per second. */
  targetFps: number
}

interface VideoFrameLike {
  readonly visibleRect: { width: number; height: number } | null
  allocationSize(options?: unknown): number
  copyTo(destination: ArrayBufferView, options?: unknown): Promise<Array<{ offset: number; stride: number }>>
  close(): void
}

/** Minimal reader surface the pump uses (a real ReadableStream reader satisfies it). */
interface FrameReaderLike {
  read(): Promise<{ done: boolean; value?: VideoFrameLike }>
  cancel(): Promise<void>
  releaseLock(): void
}

/** Only getReader is used, so we avoid requiring the full ReadableStream shape. */
interface FrameProcessorLike {
  readonly readable: { getReader(): FrameReaderLike }
}

export interface CameraFramePumpDeps {
  /**
   * Construct a frame processor for a track. Defaults to the global
   * MediaStreamTrackProcessor; injectable so tests drive fake frame streams.
   * Returns null when unsupported (the source falls back to canvas).
   */
  createProcessor?: (track: MediaStreamTrack) => FrameProcessorLike | null
  /** Push a tightly-packed RGBA frame to the engine (window.api IPC). */
  uploadFrame: (frame: NativeLiveSourceFrame) => Promise<{ ok: boolean; error?: string }>
  /** Monotonic clock in ms; defaults to performance.now. */
  now?: () => number
  /** One-shot warning sink (deduped by the caller). */
  onWarn?: (key: string, message: string) => void
}

interface PumpEntry {
  spec: CameraFrameSourceSpec
  reader: FrameReaderLike
  running: boolean
  handling: boolean
  /** Set once the source is handed permanently back to the canvas path. */
  unsupported: boolean
  lastUploadAt: number
  copyBuffer: Uint8Array | null
  packBuffer: Uint8Array | null
}

function defaultCreateProcessor(track: MediaStreamTrack): FrameProcessorLike | null {
  const Ctor = (globalThis as { MediaStreamTrackProcessor?: new (init: { track: MediaStreamTrack }) => FrameProcessorLike })
    .MediaStreamTrackProcessor
  if (typeof Ctor !== 'function') return null
  try {
    return new Ctor({ track })
  } catch {
    return null
  }
}

/**
 * Repack copyTo output into a tightly-packed RGBA buffer. copyTo may pad each
 * row to a hardware-friendly stride; the engine wants width*4 with no padding.
 * Returns a view valid until the next copy on the same entry.
 */
export function packTightRgba(
  source: Uint8Array,
  layout: Array<{ offset: number; stride: number }>,
  width: number,
  height: number,
  reuse: Uint8Array | null
): { pixels: Uint8Array; packBuffer: Uint8Array | null } {
  const plane = layout[0]
  const rowBytes = width * 4
  const offset = plane?.offset ?? 0
  const stride = plane?.stride ?? rowBytes
  if (stride === rowBytes && offset === 0) {
    return { pixels: source.subarray(0, rowBytes * height), packBuffer: reuse }
  }
  const packBuffer = reuse && reuse.byteLength === rowBytes * height ? reuse : new Uint8Array(rowBytes * height)
  for (let y = 0; y < height; y += 1) {
    const start = offset + y * stride
    packBuffer.set(source.subarray(start, start + rowBytes), y * rowBytes)
  }
  return { pixels: packBuffer, packBuffer }
}

export class CameraFramePump {
  private readonly deps: Required<Pick<CameraFramePumpDeps, 'uploadFrame'>> & CameraFramePumpDeps
  private readonly createProcessor: (track: MediaStreamTrack) => FrameProcessorLike | null
  private readonly now: () => number
  private readonly entries = new Map<string, PumpEntry>()

  constructor(deps: CameraFramePumpDeps) {
    this.deps = deps
    this.createProcessor = deps.createProcessor ?? defaultCreateProcessor
    this.now = deps.now ?? (() => performance.now())
  }

  /** True while the pump is actively serving this source (canvas path skips it). */
  isHandling(key: string): boolean {
    const entry = this.entries.get(key)
    return Boolean(entry && entry.handling && !entry.unsupported)
  }

  /**
   * Reconcile the pump against the currently active camera/display sources.
   * Starts pumps for new eligible sources, updates fps/size in place, rebuilds
   * on a track swap (device change), and stops pumps for removed sources.
   */
  sync(specs: CameraFrameSourceSpec[]): void {
    const active = new Set<string>()
    for (const spec of specs) {
      active.add(spec.key)
      const existing = this.entries.get(spec.key)
      if (existing) {
        if (existing.spec.track !== spec.track) {
          // Device switch: the old processor is reading a dead track. Rebuild.
          this.stop(spec.key)
        } else {
          existing.spec = spec
          continue
        }
      }
      this.start(spec)
    }
    for (const key of [...this.entries.keys()]) {
      if (!active.has(key)) this.stop(key)
    }
  }

  private start(spec: CameraFrameSourceSpec): void {
    const processor = this.createProcessor(spec.track)
    if (!processor) return // Unsupported → canvas path owns it.
    const reader = processor.readable.getReader()
    const entry: PumpEntry = {
      spec,
      reader,
      running: true,
      handling: false,
      unsupported: false,
      lastUploadAt: 0,
      copyBuffer: null,
      packBuffer: null
    }
    this.entries.set(spec.key, entry)
    void this.run(entry)
  }

  private async run(entry: PumpEntry): Promise<void> {
    const { reader } = entry
    while (entry.running) {
      let frame: VideoFrameLike | null = null
      try {
        const result = await reader.read()
        if (result.done) break
        frame = result.value ?? null
        if (!frame) continue

        const now = this.now()
        if (now - entry.lastUploadAt < 1000 / Math.max(1, entry.spec.targetFps)) {
          frame.close()
          continue
        }

        const rect = frame.visibleRect
        const frameWidth = rect ? Math.round(rect.width) : 0
        const frameHeight = rect ? Math.round(rect.height) : 0
        if (frameWidth !== entry.spec.width || frameHeight !== entry.spec.height) {
          // copyTo can't rescale; the canvas path resamples for free. Hand the
          // source back permanently rather than uploading a mismatched buffer.
          frame.close()
          this.fallback(entry, `frame size ${frameWidth}x${frameHeight} != texture ${entry.spec.width}x${entry.spec.height}`)
          break
        }

        const pixels = await this.copyRgba(entry, frame)
        frame.close()
        frame = null
        entry.lastUploadAt = now

        const result2 = await this.deps.uploadFrame({
          key: entry.spec.key,
          width: entry.spec.width,
          height: entry.spec.height,
          pixels
        })
        if (result2.ok) {
          entry.handling = true
        } else if (result2.error === 'Native live source is not ready') {
          // Scene still settling; keep trying without warning.
          entry.handling = false
        } else {
          this.deps.onWarn?.(entry.spec.key, result2.error ?? 'frame upload failed')
        }
      } catch (error) {
        frame?.close()
        this.fallback(entry, error instanceof Error ? error.message : String(error))
        break
      }
    }
    // The loop only exits when the source is stopped, the track ends (reader
    // done), or it fell back. In every case it is no longer serving frames, so
    // release the claim — the canvas path resumes until sync() reconciles.
    entry.handling = false
    try {
      reader.releaseLock()
    } catch {
      // Reader already released by cancel(); ignore.
    }
  }

  private async copyRgba(entry: PumpEntry, frame: VideoFrameLike): Promise<Uint8Array> {
    const rect = frame.visibleRect ?? undefined
    const options = rect ? { rect, format: 'RGBA' } : { format: 'RGBA' }
    const size = frame.allocationSize(options)
    if (!entry.copyBuffer || entry.copyBuffer.byteLength < size) {
      entry.copyBuffer = new Uint8Array(size)
    }
    const layout = await frame.copyTo(entry.copyBuffer, options)
    const packed = packTightRgba(entry.copyBuffer, layout, entry.spec.width, entry.spec.height, entry.packBuffer)
    entry.packBuffer = packed.packBuffer
    return packed.pixels
  }

  private fallback(entry: PumpEntry, reason: string): void {
    if (!entry.unsupported) {
      entry.unsupported = true
      entry.handling = false
      this.deps.onWarn?.(entry.spec.key, `falling back to canvas upload (${reason})`)
    }
  }

  private stop(key: string): void {
    const entry = this.entries.get(key)
    if (!entry) return
    entry.running = false
    entry.handling = false
    this.entries.delete(key)
    void entry.reader.cancel().catch(() => {})
  }

  dispose(): void {
    for (const key of [...this.entries.keys()]) this.stop(key)
  }
}
