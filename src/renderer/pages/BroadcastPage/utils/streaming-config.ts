export type BroadcastLayoutMode = 'horizontal' | 'vertical' | 'dual' | 'dual-portrait' | 'dual-horizontal'
export type BroadcastLayoutId = 'horizontal' | 'vertical'
export type CaptureInputFormat = 'h264' | 'mjpeg'

export interface StreamPlatformDestination {
  id: string
  name: string
  url: string
  key: string
  /** Resolves short-lived ingest credentials at go-live time. */
  keyProvider?: 'youtube' | 'tiktok-native'
}

export const CAMERA_PRESETS: Record<string, { width: number; height: number; fps: number }> = {
  '2160p144': { width: 3840, height: 2160, fps: 144 },
  '2160p120': { width: 3840, height: 2160, fps: 120 },
  '2160p60': { width: 3840, height: 2160, fps: 60 },
  '1440p144': { width: 2560, height: 1440, fps: 144 },
  '1440p120': { width: 2560, height: 1440, fps: 120 },
  '1080p144': { width: 1920, height: 1080, fps: 144 },
  '1080p120': { width: 1920, height: 1080, fps: 120 },
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

const DEFAULT_KICK_STREAM_URL = 'rtmps://fa723fc1b171.global-contribute.live-video.net:443/app'
const DEFAULT_TIKTOK_STREAM_URL = 'rtmp://open-rtmp.tiktok.com/stage'

export function buildStreamPlatforms(configs: any): StreamPlatformDestination[] {
  const available: StreamPlatformDestination[] = []
  const twitchKey = String(configs.twitch?.streamKey || '').trim()
  const youtubeKey = String(configs.youtube?.streamKey || '').trim()
  const tiktokKey = String(configs.tiktok?.streamKey || '').trim()
  const kickKey = String(configs.kick?.streamKey || '').trim()
  // Signed in with Google → the stream key is fetched (or provisioned) from
  // the YouTube API at go-live time; no pasted key needed. A manual key, if
  // present, still wins as an explicit override.
  const youtubeOAuthReady = Boolean(
    String(configs.youtube?.accessToken || '').trim() ||
    String(configs.youtube?.refreshToken || '').trim()
  )
  const tiktokNativeReady = Boolean(
    configs.tiktok?.nativeAuthConnected && configs.tiktok?.nativeLiveAccess === 'approved'
  )
  if (twitchKey) available.push({ id: 'twitch', name: 'Twitch', url: 'rtmp://ingest.global-contribute.live-video.net/app', key: twitchKey })
  if (youtubeKey) {
    available.push({ id: 'youtube', name: 'YouTube', url: 'rtmp://a.rtmp.youtube.com/live2', key: youtubeKey })
  } else if (youtubeOAuthReady) {
    available.push({ id: 'youtube', name: 'YouTube', url: 'rtmp://a.rtmp.youtube.com/live2', key: '', keyProvider: 'youtube' })
  }
  if (tiktokKey) {
    available.push({
      id: 'tiktok',
      name: 'TikTok',
      url: normalizeTikTokStreamUrl(configs.tiktok?.streamUrl),
      key: tiktokKey
    })
  } else if (tiktokNativeReady) {
    available.push({ id: 'tiktok', name: 'TikTok', url: '', key: '', keyProvider: 'tiktok-native' })
  }
  if (kickKey) available.push({ id: 'kick', name: 'Kick', url: normalizeKickStreamUrl(configs.kick?.streamUrl), key: kickKey })
  return available
}

export function normalizeTikTokStreamUrl(value: unknown): string {
  const url = String(value || '').trim()
  if (!url) return DEFAULT_TIKTOK_STREAM_URL
  return url.replace(/\/+$/, '')
}

export function normalizeKickStreamUrl(value: unknown): string {
  const url = String(value || '').trim()
  if (!url) return DEFAULT_KICK_STREAM_URL

  const withoutKey = url.replace(/\/+$/, '').replace(/\/app\/[^/]+$/, '/app')
  if (/\/app$/i.test(withoutKey)) return withoutKey
  if (/global-contribute\.live-video\.net(?::\d+)?$/i.test(withoutKey)) return `${withoutKey}/app`

  return withoutKey
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
