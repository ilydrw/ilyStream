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

export interface NativeAudioSourceOptions {
  deviceId?: string
  sampleRate?: number
  channels?: number
  exclusive?: boolean
}

/**
 * Whether native capture should drive broadcast audio.
 *
 * Deliberately an explicit opt-in rather than "on if the addon loads": turning
 * this on silently drops TTS and soundboard out of the broadcast mix, which is
 * a change nobody should get by accident.
 */
export function isNativeAudioEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ILY_NATIVE_AUDIO === '1'
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
    if (!isNativeAudioEnabled(env)) return false
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

  status(): { active: boolean; framesCaptured: number; framesDropped: number } {
    if (!this.session) return { active: false, framesCaptured: 0, framesDropped: 0 }
    const status = getCaptureStatus()
    return {
      active: status.running,
      framesCaptured: status.framesCaptured,
      framesDropped: status.framesDropped
    }
  }
}
