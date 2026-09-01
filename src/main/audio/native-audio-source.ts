/**
 * Drives native capture as the broadcast audio source.
 *
 * The encoder is fed interleaved f32le stereo (see ffmpeg-args' 'f32le' audio
 * input), which is exactly what the capture addon produces, so frames go
 * straight through with no conversion.
 *
 * This is opt-in. The renderer AudioWorklet remains the default path because it
 * carries everything the WebAudio graph mixes — mic FX, TTS and soundboard —
 * whereas native capture currently carries the device only.
 */
import {
  getCaptureStatus,
  isNativeAudioAvailable,
  startCapture,
  stopCapture,
  type CaptureFrame,
  type CaptureOptions,
  type CaptureSession
} from './native-audio-capture'
import { GeneratedAudioBuffer } from './generated-audio-buffer'

export interface NativeAudioSourceOptions {
  deviceId?: string
  sampleRate?: number
  channels?: number
  exclusive?: boolean
}

// Device capture bypasses the scene mixer (per-source mute/solo/faders/FX,
// monitoring mode, and the master bus). Keep the experimental path fail-closed
// until it consumes the policy-controlled Program mix instead of raw devices.
export interface NativeAudioHost {
  readonly audioCaptureAvailable: boolean
  startAudioCapture(options: CaptureOptions, onFrame: (frame: CaptureFrame) => void): Promise<CaptureSession>
  stopAudioCapture(): Promise<{ framesCaptured: number; framesDropped: number }>
  getAudioCaptureStatus(): {
    running: boolean
    framesCaptured: number
    framesDropped: number
  }
}

export function isNativeAudioRequested(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ILY_NATIVE_AUDIO === '1'
}

/**
 * Whether native capture should drive broadcast audio.
 *
 * Device-only capture still bypasses Program mixer policy. It therefore needs
 * a second, explicit acknowledgement intended for native transport testing;
 * loading an addon or enabling the core host can never silently change a mix.
 */
export function isNativeAudioEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isNativeAudioRequested(env) && env.ILY_NATIVE_AUDIO_DEVICE_ONLY_ACK === '1'
}

export function resolveNativeAudioOptions(
  env: NodeJS.ProcessEnv = process.env
): NativeAudioSourceOptions {
  const sampleRate = Number(env.ILY_NATIVE_AUDIO_RATE)
  const channels = Number(env.ILY_NATIVE_AUDIO_CHANNELS)
  return {
    deviceId: env.ILY_NATIVE_AUDIO_DEVICE || undefined,
    sampleRate: Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 48000,
    channels: Number.isFinite(channels) && channels > 0 ? channels : 2,
    exclusive: env.ILY_NATIVE_AUDIO_EXCLUSIVE === '1'
  }
}

export class NativeAudioSource {
  private session: CaptureSession | null = null
  private sessionSource: 'host' | 'addon' | null = null
  private starting: Promise<boolean> | null = null
  private desired = false
  private lastReportedDrops = 0
  /**
   * TTS and soundboard, which are synthesised in the renderer's WebAudio graph
   * and cannot be picked up by device capture. They arrive on the renderer's
   * clock and get summed into capture chunks as those go out.
   */
  private generated = new GeneratedAudioBuffer()

  constructor(private readonly nativeHost?: NativeAudioHost) {}

  /**
   * Accept a block of renderer-generated audio (interleaved f32, same rate and
   * layout as the capture stream). Ignored while capture is not running — the
   * renderer feeds the encoder directly in that case.
   */
  pushGeneratedAudio(pcm: Float32Array): void {
    if (!this.session) return
    this.generated.push(pcm)
  }

  /** True once capture is running and feeding the encoder. */
  get active(): boolean {
    if (!this.session) return false
    if (this.sessionSource !== 'host' || !this.nativeHost) return true
    try {
      return this.nativeHost.getAudioCaptureStatus().running
    } catch {
      return false
    }
  }

  get sessionInfo(): CaptureSession | null {
    return this.session
  }

  /**
   * Start capturing and forward every chunk to `onPcm`.
   *
   * Returns false when native audio is disabled or unavailable, so the caller
   * keeps using the renderer path rather than streaming silence.
   */
  async start(
    onPcm: (pcm: Uint8Array) => void,
    env: NodeJS.ProcessEnv = process.env
  ): Promise<boolean> {
    this.desired = true
    if (this.session && this.active) return true
    if (this.session) {
      await this.stop()
      this.desired = true
    }
    if (this.starting) return this.starting
    const operation = this.startOnce(onPcm, env)
    this.starting = operation
    try {
      return await operation
    } finally {
      if (this.starting === operation) this.starting = null
    }
  }

  private async startOnce(
    onPcm: (pcm: Uint8Array) => void,
    env: NodeJS.ProcessEnv
  ): Promise<boolean> {
    if (!isNativeAudioRequested(env)) return false
    if (!isNativeAudioEnabled(env)) {
      console.warn('[NativeAudio] opt-in ignored: set ILY_NATIVE_AUDIO_DEVICE_ONLY_ACK=1 to acknowledge that device capture bypasses Program mixer policy')
      return false
    }
    if (!isNativeAudioAvailable()) {
      console.warn('[NativeAudio] enabled but the addon is unavailable; using the renderer path')
      return false
    }

    const options = resolveNativeAudioOptions(env)
    const onFrame = (frame: CaptureFrame): void => {
      // Ignore startup frames until ownership switches atomically from the
      // renderer path; otherwise a short overlap can double the live signal.
      if (!this.session) return
      if (frame.framesDropped > this.lastReportedDrops) {
        this.lastReportedDrops = frame.framesDropped
        console.warn(`[NativeAudio] dropped ${frame.framesDropped} frames total`)
      }
      this.generated.mixInto(frame.pcm)
      onPcm(new Uint8Array(frame.pcm.buffer, frame.pcm.byteOffset, frame.pcm.byteLength))
    }
    let session: CaptureSession | null = null
    let source: 'host' | 'addon' = 'addon'
    try {
      if (this.nativeHost?.audioCaptureAvailable) {
        try {
          session = await this.nativeHost.startAudioCapture(options, onFrame)
          source = 'host'
        } catch (error) {
          console.warn('[NativeAudio] native host capture failed; trying the addon fallback:', error)
        }
      }
      if (!session) session = startCapture(options, onFrame)
    } catch (error) {
      console.error('[NativeAudio] failed to start capture; using the renderer path:', error)
      this.session = null
      return false
    }

    if (!this.desired) {
      await this.stopStartedBackend(source)
      return false
    }
    this.sessionSource = source
    this.session = session

    if (
      session.channels !== (options.channels ?? 2) ||
      session.sampleRate !== (options.sampleRate ?? 48000)
    ) {
      // The encoder is configured for the requested layout; a device that gave
      // us something else would be pitched or panned wrong.
      console.warn(
        `[NativeAudio] device gave ${session.sampleRate}Hz/${session.channels}ch, expected ` +
          `${options.sampleRate}Hz/${options.channels}ch; ` +
          'stopping rather than feeding a mismatched layout'
      )
      this.desired = false
      this.session = null
      this.sessionSource = null
      await this.stopStartedBackend(source)
      return false
    }

    console.log(
      `[NativeAudio] capturing ${session.sampleRate}Hz ${session.channels}ch ` +
        `(${session.exclusive ? 'exclusive' : 'shared'} mode via ${source})`
    )
    return true
  }

  async stop(): Promise<void> {
    this.desired = false
    const pending = this.starting
    if (pending) await pending.catch(() => false)
    if (!this.session) return
    const source = this.sessionSource
    this.session = null
    this.sessionSource = null
    this.lastReportedDrops = 0
    // Whatever is still queued belongs to the session that just ended; playing
    // it into the next one would leak a stale alert into a new stream.
    this.generated.clear()
    this.generated.resetStats()
    try {
      const totals = source === 'host' && this.nativeHost
        ? await this.nativeHost.stopAudioCapture()
        : stopCapture()
      console.log(
        `[NativeAudio] stopped after ${totals.framesCaptured} frames ` +
          `(${totals.framesDropped} dropped)`
      )
    } catch (error) {
      console.warn('[NativeAudio] stop failed:', error)
    }
  }

  private async stopStartedBackend(source: 'host' | 'addon'): Promise<void> {
    if (source === 'host' && this.nativeHost) await this.nativeHost.stopAudioCapture()
    else stopCapture()
  }

  status(): {
    active: boolean
    framesCaptured: number
    framesDropped: number
    generatedQueued: number
    generatedDropped: number
  } {
    if (!this.session) {
      return {
        active: false,
        framesCaptured: 0,
        framesDropped: 0,
        generatedQueued: 0,
        generatedDropped: 0
      }
    }
    const status = this.sessionSource === 'host' && this.nativeHost
      ? this.nativeHost.getAudioCaptureStatus()
      : getCaptureStatus()
    return {
      active: status.running,
      framesCaptured: status.framesCaptured,
      framesDropped: status.framesDropped,
      generatedQueued: this.generated.available,
      generatedDropped: this.generated.dropped
    }
  }
}
