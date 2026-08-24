/**
 * BroadcastProcessor
 * Captures the audio stream from the WebAudio graph and sends it to the main process
 * for broadcast. It also acts as the master clock for the video encoder.
 */
// AAC encodes in 1024-sample frames. Sending matching chunks cuts IPC/pipe
// wakeups in half versus 512-frame chunks while adding only ~10 ms latency.
const CHUNK_FRAMES = 1024
const CHANNELS = 2

// AudioWorklet globals aren't in the DOM lib; declare the minimal surface used here.
declare class AudioWorkletProcessor {
  readonly port: MessagePort
  constructor()
}
declare function registerProcessor(
  name: string,
  processorCtor: new () => AudioWorkletProcessor
): void

class BroadcastProcessor extends AudioWorkletProcessor {
  private pending = new Float32Array(CHUNK_FRAMES * CHANNELS)
  private pendingFrames = 0

  constructor() {
    super();
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>) {
    const input = inputs[0]
    const output = outputs[0]
    const channelCount = input?.length || 0
    // AudioWorklet render quanta are normally 128 frames. When the mixer has
    // no connected/live source yet, Chromium supplies no input channels, but
    // FFmpeg still needs PCM data before it can open the RTMP output. Use the
    // output quantum length (or the spec-default 128) to emit silence until
    // real audio arrives.
    const sampleCount = input?.[0]?.length || output?.[0]?.length || 128

    for (let i = 0; i < sampleCount; i++) {
      const left = channelCount > 0 ? (input[0][i] || 0) : 0
      const right = channelCount > 1 ? (input[1][i] || 0) : left
      const offset = this.pendingFrames * CHANNELS
      this.pending[offset] = left
      this.pending[offset + 1] = right
      this.pendingFrames++

      if (this.pendingFrames >= CHUNK_FRAMES) {
        this.port.postMessage(this.pending.buffer, [this.pending.buffer])
        this.pending = new Float32Array(CHUNK_FRAMES * CHANNELS)
        this.pendingFrames = 0
      }
    }
    
    // Returning true keeps the processor alive
    return true;
  }
}

registerProcessor('broadcast-processor', BroadcastProcessor);

export {}
