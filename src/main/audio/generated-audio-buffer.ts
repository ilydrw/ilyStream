/**
 * Holds renderer-generated audio (TTS and soundboard) until the native capture
 * callback is ready to mix it.
 *
 * The two sides run on unrelated clocks: capture delivers on the audio device's
 * cadence, the renderer delivers on the worklet's. This absorbs that jitter
 * without letting a misbehaving producer grow unbounded — the lesson from the
 * SSE backpressure work applies here too, except an audio backlog also shows up
 * as growing latency, not just memory.
 */
export class GeneratedAudioBuffer {
  private readonly ring: Float32Array
  private readCursor = 0
  private writeCursor = 0
  private filled = 0
  private droppedSamples = 0
  private starvedSamples = 0

  /**
   * @param capacitySamples Interleaved sample capacity. The default is about
   * half a second of 48k stereo — enough to ride out scheduler jitter, short
   * enough that a burst does not park TTS seconds behind the stream.
   */
  constructor(capacitySamples = 48000) {
    this.ring = new Float32Array(Math.max(1, capacitySamples))
  }

  get available(): number {
    return this.filled
  }

  get dropped(): number {
    return this.droppedSamples
  }

  /** Samples the mixer had to substitute with silence because none were ready. */
  get starved(): number {
    return this.starvedSamples
  }

  /**
   * Append samples, discarding the OLDEST on overflow.
   *
   * Dropping the oldest keeps playback near-live. Dropping the newest, or
   * growing without bound, would leave TTS drifting further behind the stream
   * with every burst — a glitch is recoverable, permanent desync is not.
   */
  push(samples: Float32Array): void {
    const capacity = this.ring.length

    if (samples.length >= capacity) {
      // The incoming block alone exceeds the ring: keep only its tail.
      const tail = samples.subarray(samples.length - capacity)
      this.ring.set(tail, 0)
      this.readCursor = 0
      this.writeCursor = 0
      this.droppedSamples += samples.length - capacity + this.filled
      this.filled = capacity
      return
    }

    const overflow = this.filled + samples.length - capacity
    if (overflow > 0) {
      this.readCursor = (this.readCursor + overflow) % capacity
      this.filled -= overflow
      this.droppedSamples += overflow
    }

    for (let i = 0; i < samples.length; i++) {
      this.ring[this.writeCursor] = samples[i]
      this.writeCursor = (this.writeCursor + 1) % capacity
    }
    this.filled += samples.length
  }

  /**
   * Mix up to `out.length` samples into `out` by addition, consuming them.
   *
   * Silence when starved is the correct behaviour, not an error: generated
   * audio is intermittent by nature and is absent most of the time.
   */
  mixInto(out: Float32Array): void {
    const capacity = this.ring.length
    const toMix = Math.min(this.filled, out.length)

    for (let i = 0; i < toMix; i++) {
      out[i] += this.ring[this.readCursor]
      this.readCursor = (this.readCursor + 1) % capacity
    }
    this.filled -= toMix

    if (toMix < out.length) this.starvedSamples += out.length - toMix
  }

  clear(): void {
    this.readCursor = 0
    this.writeCursor = 0
    this.filled = 0
  }

  resetStats(): void {
    this.droppedSamples = 0
    this.starvedSamples = 0
  }
}
