let encoder: VideoEncoder | null = null
let frameCount = 0
let keyframeInterval = 60

/**
 * H.264 levels expressed as the codec-string suffix byte plus their
 * MaxMBPS (macroblocks/sec) capacity. Source: ITU-T H.264 Annex A,
 * Table A-1. We pick the lowest level that fits the requested resolution
 * × framerate so we don't burn extra encoder budget on lower modes.
 */
const AVC_LEVELS: { level: string; maxMbps: number }[] = [
  { level: '1E', maxMbps: 40_500 },    // 3.0  — 720x576 @ 25fps
  { level: '1F', maxMbps: 108_000 },   // 3.1  — 720p @ 30fps
  { level: '20', maxMbps: 216_000 },   // 3.2  — 720p @ 60fps
  { level: '28', maxMbps: 245_760 },   // 4.0  — 1080p @ 30fps
  { level: '29', maxMbps: 245_760 },   // 4.1  — 1080p @ 30fps (higher bitrate cap)
  { level: '2A', maxMbps: 522_240 },   // 4.2  — 1080p @ 60fps  ← what 1080p60 needs
  { level: '32', maxMbps: 589_824 },   // 5.0  — 2K @ 30fps
  { level: '33', maxMbps: 983_040 }    // 5.1  — 4K @ 30fps
]

/**
 * Pick the smallest H.264 level that can encode `width × height @ fps`,
 * then return the WebCodecs codec string. We use the High profile (`6400`)
 * for best compression on modern hardware — every browser encoder Twitch
 * ingests today supports it.
 */
function pickAvcCodecString(width: number, height: number, fps: number): string {
  const macroblocks = Math.ceil(width / 16) * Math.ceil(height / 16)
  const mbps = macroblocks * Math.max(1, fps)
  const chosen =
    AVC_LEVELS.find((entry) => entry.maxMbps >= mbps) ?? AVC_LEVELS[AVC_LEVELS.length - 1]
  return `avc1.6400${chosen.level}`
}

self.onmessage = async (event: MessageEvent) => {
  const { type, config, frame } = event.data

  if (type === 'init') {
    if (encoder && encoder.state !== 'closed') {
      await encoder.flush().catch(() => {})
      encoder.close()
    }

    frameCount = 0
    keyframeInterval = Math.max(1, Math.round((config.fps || 30) * 2))

    encoder = new VideoEncoder({
      output: (chunk) => {
        const buffer = new ArrayBuffer(chunk.byteLength)
        chunk.copyTo(buffer)
        self.postMessage({ type: 'chunk', buffer, isKey: chunk.type === 'key' }, [buffer])
      },
      error: (err) => self.postMessage({ type: 'error', message: String(err) })
    })

    const codec = pickAvcCodecString(config.width, config.height, config.fps || 30)
    const encoderConfig = {
      codec,
      width: config.width,
      height: config.height,
      bitrate: config.bitrate || 6000000,
      framerate: config.fps || 30,
      bitrateMode: 'constant',
      latencyMode: 'realtime',
      avc: { format: 'annexb' }
    } as VideoEncoderConfig & { bitrateMode?: 'constant' }

    encoder.configure(encoderConfig)

    self.postMessage({ type: 'ready', codec })
    return
  }

  if (type === 'frame') {
    const videoFrame = frame as VideoFrame | undefined
    if (!encoder || encoder.state !== 'configured' || !videoFrame) {
      videoFrame?.close()
      return
    }

    if (encoder.encodeQueueSize > 10) {
      videoFrame.close()
      return
    }

    encoder.encode(videoFrame, { keyFrame: frameCount % keyframeInterval === 0 })
    frameCount++
    videoFrame.close()
    return
  }

  if (type === 'shutdown') {
    if (encoder && encoder.state !== 'closed') {
      await encoder.flush().catch(() => {})
      encoder.close()
    }
    encoder = null
  }
}
