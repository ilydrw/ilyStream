/**
 * Main-process wrapper around the native audio capture addon
 * (native/audio -> ilystream_audio.node).
 *
 * Captures a device on a real-time audio thread and delivers interleaved f32
 * PCM to main, so broadcast audio can reach the encoder without travelling
 * through a renderer WebAudio graph.
 *
 * The addon has no dependency on ilystream_engine.dll — it only shares the
 * engine's CMake project — so this loader does not need the PATH dance
 * native-engine.ts does.
 */
import { app } from 'electron'
import { createRequire } from 'module'
import { join } from 'path'
import { existsSync } from 'fs'

const requireNative = createRequire(import.meta.url)

export interface CaptureDevice {
  id: string
  name: string
  isDefault: boolean
  backend?: string
}

export interface CaptureOptions {
  deviceId?: string
  sampleRate?: number
  channels?: number
  /**
   * Ask for WASAPI exclusive mode. Lower latency, but it takes the device away
   * from every other application and fails outright on a lot of consumer
   * hardware — the addon falls back to shared mode rather than failing, so
   * check `exclusive` on the returned CaptureSession to see what you got.
   */
  exclusive?: boolean
}

export interface CaptureSession {
  sampleRate: number
  channels: number
  exclusive: boolean
  chunkFrames: number
  backend?: string
}

export interface CaptureFrame {
  /** Interleaved f32 samples, `channels` per frame. */
  pcm: Float32Array
  framesCaptured: number
  /** Frames the audio thread had to discard because main fell behind. */
  framesDropped: number
}

export interface CaptureStatus {
  running: boolean
  framesCaptured: number
  framesDropped: number
  sampleRate: number
  channels: number
  backend?: string
}

interface AudioAddon {
  listCaptureDevices(): CaptureDevice[]
  startCapture(options: CaptureOptions, onFrame: (frame: CaptureFrame) => void): CaptureSession
  stopCapture(): { framesCaptured: number; framesDropped: number }
  getStatus(): CaptureStatus
  startProgramAudioTransport(options: ProgramAudioTransportOptions): ProgramAudioTransportSession
  pushProgramAudio(pcm: Buffer, timestampNs: bigint): boolean
  stopProgramAudioTransport(): void
  startSharedCaptureReader(
    options: SharedCaptureTransport,
    onFrame: (frame: CaptureFrame) => void
  ): CaptureSession
  stopSharedCaptureReader(): CaptureStatus
  getSharedCaptureReaderStatus(): CaptureStatus
  createSharedMixerSourceWriter(options: SharedMixerSourceTransport): boolean
  pushSharedMixerSource(ringName: string, pcm: Buffer, timestampNs: bigint): boolean
  closeSharedMixerSourceWriter(ringName: string): boolean
}

export interface ProgramAudioTransportOptions {
  ringName: string
  generation: bigint
  sampleRate: 48_000
  channels: 2
  capacityFrames: number
  blockFrames: number
}

export interface ProgramAudioTransportSession extends ProgramAudioTransportOptions {}

export interface SharedCaptureTransport extends CaptureSession {
  transport: 'shared-memory-v1'
  format: 'f32-interleaved'
  ringName: string
  generation: bigint
  capacityFrames: number
  blockFrames: number
}

export interface SharedMixerSourceTransport {
  ringName: string
  generation: bigint
  sampleRate: 48_000
  channels: 2
  capacityFrames: number
  blockFrames: number
}

/** Candidate locations for the built addon, dev and packaged. */
function addonCandidates(): string[] {
  const override = process.env.ILY_AUDIO_ADDON
  const appPath = app.getAppPath()
  return [
    ...(override ? [override] : []),
    // Packaged: electron-builder extraResources copies it here (see package.json).
    join(process.resourcesPath ?? '', 'native-audio', 'ilystream_audio.node'),
    // Dev: raw CMake build output, alongside the engine addons.
    join(appPath, 'native', 'engine', 'build', 'Release', 'ilystream_audio.node'),
    join(process.cwd(), 'native', 'engine', 'build', 'Release', 'ilystream_audio.node')
  ].filter(Boolean)
}

let addon: AudioAddon | null = null

function loadAddon(): AudioAddon {
  if (addon) return addon

  const found = addonCandidates().find((candidate) => existsSync(candidate))
  if (!found) {
    throw new Error(
      `Native audio addon not found. Looked in:\n${addonCandidates().join('\n')}\n` +
        `Build it with: npm run build:engine`
    )
  }

  addon = requireNative(found) as AudioAddon
  return addon
}

/** True when the addon is present and loadable; callers fall back to the renderer path. */
export function isNativeAudioAvailable(): boolean {
  try {
    loadAddon()
    return true
  } catch {
    return false
  }
}

export function listCaptureDevices(): CaptureDevice[] {
  return loadAddon().listCaptureDevices()
}

/**
 * Start capturing. Only one capture runs at a time; starting while another is
 * active throws rather than silently replacing it.
 */
export function startCapture(
  options: CaptureOptions,
  onFrame: (frame: CaptureFrame) => void
): CaptureSession {
  return loadAddon().startCapture(options, onFrame)
}

export function stopCapture(): { framesCaptured: number; framesDropped: number } {
  if (!addon) return { framesCaptured: 0, framesDropped: 0 }
  return addon.stopCapture()
}

export function getCaptureStatus(): CaptureStatus {
  if (!addon) {
    return { running: false, framesCaptured: 0, framesDropped: 0, sampleRate: 0, channels: 0 }
  }
  return addon.getStatus()
}

export function startProgramAudioTransport(
  options: ProgramAudioTransportOptions
): ProgramAudioTransportSession {
  return loadAddon().startProgramAudioTransport(options)
}

export function pushProgramAudio(pcm: Uint8Array, timestampNs: bigint): boolean {
  const bytes = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  return loadAddon().pushProgramAudio(bytes, timestampNs)
}

export function stopProgramAudioTransport(): void {
  if (!addon) return
  addon.stopProgramAudioTransport()
}

export function startSharedCaptureReader(
  transport: SharedCaptureTransport,
  onFrame: (frame: CaptureFrame) => void
): CaptureSession {
  return loadAddon().startSharedCaptureReader(transport, onFrame)
}

export function stopSharedCaptureReader(): CaptureStatus {
  if (!addon) {
    return { running: false, framesCaptured: 0, framesDropped: 0, sampleRate: 0, channels: 0 }
  }
  return addon.stopSharedCaptureReader()
}

export function getSharedCaptureReaderStatus(): CaptureStatus {
  if (!addon) {
    return { running: false, framesCaptured: 0, framesDropped: 0, sampleRate: 0, channels: 0 }
  }
  return addon.getSharedCaptureReaderStatus()
}

export function createSharedMixerSourceWriter(options: SharedMixerSourceTransport): boolean {
  return loadAddon().createSharedMixerSourceWriter(options)
}

export function pushSharedMixerSource(
  ringName: string,
  pcm: Uint8Array,
  timestampNs: bigint
): boolean {
  return loadAddon().pushSharedMixerSource(
    ringName,
    Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength),
    timestampNs
  )
}

export function closeSharedMixerSourceWriter(ringName: string): boolean {
  if (!addon) return false
  return addon.closeSharedMixerSourceWriter(ringName)
}
