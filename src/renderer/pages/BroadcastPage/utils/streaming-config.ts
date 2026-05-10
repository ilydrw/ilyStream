export type BroadcastLayoutMode = 'horizontal' | 'vertical' | 'dual'
export type BroadcastLayoutId = 'horizontal' | 'vertical'
export type CaptureInputFormat = 'h264' | 'mjpeg'

export interface StreamPlatformDestination {
  id: string
  name: string
  url: string
  key: string
}

export const CAMERA_PRESETS: Record<string, { width: number; height: number; fps: number }> = {
  '1080p60': { width: 1920, height: 1080, fps: 60 },
  '1080p30': { width: 1920, height: 1080, fps: 30 },
  '720p60': { width: 1280, height: 720, fps: 60 },
  '720p30': { width: 1280, height: 720, fps: 30 }
}

const AVC_LEVELS: { level: string; maxMbps: number }[] = [
  { level: '1E', maxMbps: 40_500 },
  { level: '1F', maxMbps: 108_000 },
  { level: '20', maxMbps: 216_000 },
  { level: '28', maxMbps: 245_760 },
  { level: '29', maxMbps: 245_760 },
  { level: '2A', maxMbps: 522_240 },
  { level: '32', maxMbps: 589_824 },
  { level: '33', maxMbps: 983_040 }
]

export function buildStreamPlatforms(configs: any): StreamPlatformDestination[] {
  const available: StreamPlatformDestination[] = []
  const twitchKey = String(configs.twitch?.streamKey || '').trim()
  const youtubeKey = String(configs.youtube?.streamKey || '').trim()
  const tiktokKey = String(configs.tiktok?.streamKey || '').trim()
  const kickKey = String(configs.kick?.streamKey || '').trim()
  if (twitchKey) available.push({ id: 'twitch', name: 'Twitch', url: 'rtmp://ingest.global-contribute.live-video.net/app', key: twitchKey })
  if (youtubeKey) available.push({ id: 'youtube', name: 'YouTube', url: 'rtmp://a.rtmp.youtube.com/live2', key: youtubeKey })
  if (tiktokKey) available.push({ id: 'tiktok', name: 'TikTok', url: 'rtmp://open-rtmp.tiktok.com/stage', key: tiktokKey })
  if (kickKey) available.push({ id: 'kick', name: 'Kick', url: 'rtmp://fa7d171e3f81.global-contribute.live-video.net/app', key: kickKey })
  return available
}

export async function getOptimizedCaptureInputFormat(
  width: number,
  height: number,
  fps: number,
  bitrate: number
): Promise<CaptureInputFormat> {
  const videoEncoder = (window as any).VideoEncoder
  const hasWebCodecs = typeof videoEncoder === 'function' &&
                       typeof videoEncoder.isConfigSupported === 'function' &&
                       typeof (window as any).MediaStreamTrackProcessor === 'function'
  if (!hasWebCodecs) return 'mjpeg'

  try {
    const codec = pickAvcCodecString(width, height, fps)
    const support = await videoEncoder.isConfigSupported({
      codec,
      width,
      height,
      bitrate,
      framerate: fps,
      latencyMode: 'realtime',
      avc: { format: 'annexb' }
    })
    return support.supported ? 'h264' : 'mjpeg'
  } catch (err) {
    console.warn('[BroadcastPage] H.264 capture preflight failed; using MJPEG pipe:', err)
    return 'mjpeg'
  }
}

export function pickAvcCodecString(width: number, height: number, fps: number): string {
  const macroblocks = Math.ceil(width / 16) * Math.ceil(height / 16)
  const mbps = macroblocks * Math.max(1, fps)
  const chosen =
    AVC_LEVELS.find((entry) => entry.maxMbps >= mbps) ?? AVC_LEVELS[AVC_LEVELS.length - 1]
  return `avc1.6400${chosen.level}`
}
