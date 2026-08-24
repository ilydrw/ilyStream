import { randomUUID } from 'node:crypto'
import type { AudioFramePayload } from '../services/streaming-types'
import {
  pushProgramAudio,
  startProgramAudioTransport,
  stopProgramAudioTransport
} from './native-audio-capture'

const SAMPLE_RATE = 48_000 as const
const CHANNELS = 2 as const
const BLOCK_FRAMES = 1_024
const CAPACITY_FRAMES = SAMPLE_RATE * 2
const MAX_CLOCK_DRIFT_NS = 250_000_000n

export interface ProgramAudioDescriptor {
  sampleRate: typeof SAMPLE_RATE
  channels: typeof CHANNELS
  format: 'f32-interleaved'
  ringName: string
  capacityFrames: number
  blockFrames: number
  timestampTimebase: 'ns'
}

/**
 * Publishes the renderer's policy-controlled Program mix into a bounded,
 * same-session shared-memory ring for the native OBS source.
 */
export class ProgramAudioTransport {
  private descriptor: ProgramAudioDescriptor | null = null
  private generation: bigint | null = null
  private baseMediaTimestampUs: number | null = null
  private baseMonotonicTimestampNs = 0n
  private lastMediaTimestampUs: number | null = null

  constructor(private readonly monotonicNowNs: () => bigint = () => process.hrtime.bigint()) {}

  start(generation: string): ProgramAudioDescriptor {
    const parsedGeneration = parseGeneration(generation)
    this.stop()

    const ringName = `Local\\ilyStream.Program.Audio.${randomUUID()}`
    const session = startProgramAudioTransport({
      ringName,
      generation: parsedGeneration,
      sampleRate: SAMPLE_RATE,
      channels: CHANNELS,
      capacityFrames: CAPACITY_FRAMES,
      blockFrames: BLOCK_FRAMES
    })
    this.generation = parsedGeneration
    this.descriptor = {
      sampleRate: SAMPLE_RATE,
      channels: CHANNELS,
      format: 'f32-interleaved',
      ringName: session.ringName,
      capacityFrames: session.capacityFrames,
      blockFrames: session.blockFrames,
      timestampTimebase: 'ns'
    }
    return { ...this.descriptor }
  }

  push(frame: AudioFramePayload): boolean {
    if (!this.descriptor || this.generation === null) return false
    const bytes = frame.data
    const bytesPerFrame = CHANNELS * Float32Array.BYTES_PER_ELEMENT
    if (
      !(bytes instanceof Uint8Array) ||
      bytes.byteLength === 0 ||
      bytes.byteLength % bytesPerFrame !== 0 ||
      (frame.sampleRate !== undefined && frame.sampleRate !== SAMPLE_RATE) ||
      (frame.channels !== undefined && frame.channels !== CHANNELS)
    ) {
      return false
    }
    const frameCount = bytes.byteLength / bytesPerFrame
    if (frameCount > this.descriptor.blockFrames) return false

    const timestampNs = this.resolveTimestampNs(frame.timestamp, frameCount)
    return pushProgramAudio(bytes, timestampNs)
  }

  stop(): void {
    if (this.descriptor) stopProgramAudioTransport()
    this.descriptor = null
    this.generation = null
    this.resetClock()
  }

  get active(): boolean {
    return this.descriptor !== null
  }

  private resolveTimestampNs(mediaTimestampUs: number | undefined, frameCount: number): bigint {
    const nowNs = this.monotonicNowNs()
    const durationNs = (BigInt(frameCount) * 1_000_000_000n) / BigInt(SAMPLE_RATE)
    const normalizedMediaUs = Number.isSafeInteger(mediaTimestampUs) && (mediaTimestampUs ?? -1) >= 0
      ? mediaTimestampUs as number
      : null

    if (
      normalizedMediaUs === null ||
      this.baseMediaTimestampUs === null ||
      (this.lastMediaTimestampUs !== null && normalizedMediaUs < this.lastMediaTimestampUs)
    ) {
      this.baseMediaTimestampUs = normalizedMediaUs
      this.baseMonotonicTimestampNs = nowNs - durationNs
    }

    let timestampNs = normalizedMediaUs === null || this.baseMediaTimestampUs === null
      ? nowNs - durationNs
      : this.baseMonotonicTimestampNs + BigInt(normalizedMediaUs - this.baseMediaTimestampUs) * 1_000n

    const predictedEndNs = timestampNs + durationNs
    const driftNs = predictedEndNs >= nowNs ? predictedEndNs - nowNs : nowNs - predictedEndNs
    if (driftNs > MAX_CLOCK_DRIFT_NS) {
      this.baseMediaTimestampUs = normalizedMediaUs
      this.baseMonotonicTimestampNs = nowNs - durationNs
      timestampNs = this.baseMonotonicTimestampNs
    }
    this.lastMediaTimestampUs = normalizedMediaUs
    return timestampNs > 0n ? timestampNs : 1n
  }

  private resetClock(): void {
    this.baseMediaTimestampUs = null
    this.baseMonotonicTimestampNs = 0n
    this.lastMediaTimestampUs = null
  }
}

function parseGeneration(generation: string): bigint {
  if (!/^[1-9][0-9]{0,19}$/.test(generation)) {
    throw new Error('Program transport generation is invalid.')
  }
  const parsed = BigInt(generation)
  if (parsed > 0xffff_ffff_ffff_ffffn) {
    throw new Error('Program transport generation is outside the supported range.')
  }
  return parsed
}
