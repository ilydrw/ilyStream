/**
 * Helper to play a sequence of PCM audio chunks gaplessly using Web Audio API.
 */
export class AudioStreamPlayer {
  private static sharedContext: AudioContext | null = null
  private nextStartTime: number = 0
  private volume: number = 1
  private gainNode: GainNode | null = null
  private activeSources: Set<AudioBufferSourceNode> = new Set()

  constructor() {}

  /**
   * Initialize or resume the audio context.
   * We reuse a single context to avoid hitting the browser's context limit.
   */
  private async getContext(): Promise<AudioContext> {
    if (!AudioStreamPlayer.sharedContext) {
      AudioStreamPlayer.sharedContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    const ctx = AudioStreamPlayer.sharedContext
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume()
      } catch (e) {
        console.warn('[audio] Failed to resume AudioContext:', e)
      }
    }
    return ctx
  }

  setVolume(volume: number): void {
    this.volume = volume
    if (this.gainNode) {
      this.gainNode.gain.value = volume
    }
  }

  /**
   * Push a chunk of PCM data to the playback queue.
   */
  async pushChunk(pcm: Float32Array, sampleRate: number): Promise<void> {
    const ctx = await this.getContext()
    
    if (!this.gainNode) {
      this.gainNode = ctx.createGain()
      this.gainNode.gain.value = this.volume
      this.gainNode.connect(ctx.destination)
    }

    const buffer = ctx.createBuffer(1, pcm.length, sampleRate)
    buffer.copyToChannel(pcm, 0)
    
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(this.gainNode)
    
    // Schedule playback gaplessly
    const now = ctx.currentTime
    const startTime = Math.max(now, this.nextStartTime)
    
    source.start(startTime)
    this.nextStartTime = startTime + buffer.duration

    // Track source so we can stop it if needed
    this.activeSources.add(source)
    source.onended = () => {
      this.activeSources.delete(source)
    }
  }

  /**
   * Returns a promise that resolves when all currently queued audio has finished playing.
   */
  async waitForFinish(): Promise<void> {
    const ctx = await this.getContext()
    const remainingTime = this.nextStartTime - ctx.currentTime
    if (remainingTime <= 0) return
    
    return new Promise((resolve) => {
      setTimeout(resolve, (remainingTime * 1000) + 50)
    })
  }

  /**
   * Reset the player timing for a new stream.
   */
  reset(): void {
    if (AudioStreamPlayer.sharedContext) {
      this.nextStartTime = AudioStreamPlayer.sharedContext.currentTime
    } else {
      this.nextStartTime = 0
    }
  }

  /**
   * Stop all playback immediately and clear the queue.
   */
  stop(): void {
    for (const source of this.activeSources) {
      try {
        source.stop()
      } catch (e) {
        // Source might have already finished or not started
      }
    }
    this.activeSources.clear()
    
    if (AudioStreamPlayer.sharedContext) {
      this.nextStartTime = AudioStreamPlayer.sharedContext.currentTime
    }
  }
}
