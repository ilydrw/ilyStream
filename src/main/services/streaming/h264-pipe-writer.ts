import type { VideoFramePayload } from '../streaming-types'

interface H264Pipe {
  write(data: Uint8Array): boolean
  discard(data: Uint8Array): void
  discardQueued(): void
}

/**
 * Once an H.264 access unit is dropped, following P/B frames may depend on it.
 * Discard through the next IDR instead of feeding FFmpeg a corrupt prediction
 * chain and pretending the output is healthy.
 */
export class H264PipeWriter {
  private awaitingKeyFrame = false

  constructor(private readonly pipe: H264Pipe) {}

  write(frame: VideoFramePayload): boolean {
    if (this.awaitingKeyFrame) {
      if (!frame.isKeyFrame) {
        this.pipe.discard(frame.data)
        return false
      }
      this.pipe.discardQueued()
      this.awaitingKeyFrame = false
    }

    const accepted = this.pipe.write(frame.data)
    if (!accepted) this.awaitingKeyFrame = true
    return accepted
  }
}
