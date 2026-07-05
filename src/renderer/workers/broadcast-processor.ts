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
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelCount = input.length;
      const sampleCount = input[0].length;
      
      for (let i = 0; i < sampleCount; i++) {
        const offset = this.pendingFrames * 2
        this.pending[offset] = input[0][i]
        this.pending[offset + 1] = channelCount > 1 ? input[1][i] : input[0][i]
        this.pendingFrames++

        if (this.pendingFrames >= CHUNK_FRAMES) {
          this.port.postMessage(this.pending.buffer, [this.pending.buffer])
          this.pending = new Float32Array(CHUNK_FRAMES * CHANNELS)
          this.pendingFrames = 0
        }
      }
    }
    
    // Returning true keeps the processor alive
    return true;
  }
}

registerProcessor('broadcast-processor', BroadcastProcessor);
