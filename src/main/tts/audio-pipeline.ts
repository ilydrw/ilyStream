/**
 * Audio pipeline configuration for TTS post-processing.
 * The actual AudioContext processing runs in the renderer process.
 * This module defines the pipeline configuration and effect parameters.
 *
 * The renderer receives these configs via IPC and builds the
 * corresponding Web Audio API graph:
 *
 *   SpeechSynthesisUtterance
 *     -> GainNode (volume)
 *     -> WaveShaperNode (robot effect, optional)
 *     -> DelayNode (echo, optional)
 *     -> ConvolverNode (reverb, optional)
 *     -> AudioDestination
 */

export interface PipelineConfig {
  /** Master volume (0.0 - 1.0) */
  masterVolume: number
  /** Output device ID (empty = default) */
  outputDeviceId: string
  /** Whether to apply the audio effects chain */
  effectsEnabled: boolean
}

export interface ReverbConfig {
  enabled: boolean
  /** Decay time in seconds (0.1 - 5.0) */
  decay: number
  /** Wet/dry mix (0.0 - 1.0) */
  mix: number
}

export interface EchoConfig {
  enabled: boolean
  /** Delay time in seconds (0.05 - 2.0) */
  delayTime: number
  /** Feedback amount (0.0 - 0.9) */
  feedback: number
  /** Wet/dry mix (0.0 - 1.0) */
  mix: number
}

export interface RobotConfig {
  enabled: boolean
  /** Distortion amount (0 - 100) */
  distortion: number
}

export interface ChorusConfig {
  enabled: boolean
  /** Modulation rate in Hz (0.1 - 10.0) */
  rate: number
  /** Modulation depth in ms (1 - 20) */
  depth: number
  /** Wet/dry mix (0.0 - 1.0) */
  mix: number
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  masterVolume: 0.8,
  outputDeviceId: '',
  effectsEnabled: true
}

/**
 * Generate a WaveShaper distortion curve for robot voice effect.
 * This is sent to the renderer for use with WaveShaperNode.
 */
export function makeDistortionCurve(amount: number): Float32Array {
  const samples = 44100
  const curve = new Float32Array(samples)
  const deg = Math.PI / 180

  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1
    curve[i] =
      ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x))
  }

  return curve
}

/**
 * Generate an impulse response for convolution reverb.
 * This creates a simple synthetic reverb IR.
 */
export function generateReverbIR(
  sampleRate: number,
  duration: number,
  decay: number
): Float32Array {
  const length = sampleRate * duration
  const impulse = new Float32Array(length)

  for (let i = 0; i < length; i++) {
    impulse[i] =
      (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay)
  }

  return impulse
}
