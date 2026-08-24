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
const NATIVE_AUDIO_MIXER_PARITY_READY = false

export function isNativeAudioRequested(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ILY_NATIVE_AUDIO === '1'
}

/**
 * Whether native capture should drive broadcast audio.
 *
 * The request remains explicit, and the readiness gate below keeps it off
 * until the native path preserves the same Program mixer semantics as the
 * renderer. Loading an addon can never silently change the live mix.
 */
export function isNativeAudioEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return NATIVE_AUDIO_MIXER_PARITY_READY && isNativeAudioRequested(env)
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
  private lastReportedDrops = 0
  /**
   * TTS and soundboard, which are synthesised in the renderer's WebAudio graph
   * and cannot be picked up by device capture. They arrive on the renderer's
   * clock and get summed into capture chunks as those go out.
   */
  private generated = new GeneratedAudioBuffer()

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
    return this.session !== null
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
  start(onPcm: (pcm: Uint8Array) => void, env: NodeJS.ProcessEnv = process.env): boolean {
    if (this.session) return true
    if (!isNativeAudioRequested(env)) return false
    if (!isNativeAudioEnabled(env)) {
      console.warn('[NativeAudio] opt-in ignored: native device capture does not yet preserve Program mixer routing; using the renderer mix')
      return false
    }
    if (!isNativeAudioAvailable()) {
      console.warn('[NativeAudio] enabled but the addon is unavailable; using the renderer path')
      return false
    }

    const options = resolveNativeAudioOptions(env)
    try {
      this.session = startCapture(options, (frame) => {
        // Dropped frames mean the audio thread outran this consumer. That is
        // audible as a gap, so it must not pass silently.
        if (frame.framesDropped > this.lastReportedDrops) {
          this.lastReportedDrops = frame.framesDropped
          console.warn(`[NativeAudio] dropped ${frame.framesDropped} frames total`)
        }
        // Sum TTS/soundboard into the captured block. The addon hands over a
        // fresh array per callback, so mixing in place is safe. Capture is the
        // clock: whatever generated audio is ready rides along, and silence
        // fills the rest.
        this.generated.mixInto(frame.pcm)

        // Float32Array -> byte view of the same memory; f32le is what the
        // encoder's audio input expects.
        onPcm(
          new Uint8Array(frame.pcm.buffer, frame.pcm.byteOffset, frame.pcm.byteLength)
        )
      })
    } catch (error) {
      console.error('[NativeAudio] failed to start capture; using the renderer path:', error)
      this.session = null
      return false
    }

    if (this.session.channels !== (options.channels ?? 2)) {
      // The encoder is configured for the requested layout; a device that gave
      // us something else would be pitched or panned wrong.
      console.warn(
        `[NativeAudio] device gave ${this.session.channels}ch, expected ${options.channels}; ` +
          'stopping rather than feeding a mismatched layout'
      )
      this.stop()
      return false
    }

    console.log(
      `[NativeAudio] capturing ${this.session.sampleRate}Hz ${this.session.channels}ch ` +
        `(${this.session.exclusive ? 'exclusive' : 'shared'} mode)`
    )
    return true
  }

  stop(): void {
    if (!this.session) return
    this.session = null
    this.lastReportedDrops = 0
    // Whatever is still queued belongs to the session that just ended; playing
    // it into the next one would leak a stale alert into a new stream.
    this.generated.clear()
    this.generated.resetStats()
    try {
      const totals = stopCapture()
      console.log(
        `[NativeAudio] stopped after ${totals.framesCaptured} frames ` +
          `(${totals.framesDropped} dropped)`
      )
    } catch (error) {
      console.warn('[NativeAudio] stop failed:', error)
    }
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
    const status = getCaptureStatus()
    return {
      active: status.running,
      framesCaptured: status.framesCaptured,
      framesDropped: status.framesDropped,
      generatedQueued: this.generated.available,
      generatedDropped: this.generated.dropped
    }
  }
}
