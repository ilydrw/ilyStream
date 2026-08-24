const MICROSECONDS_PER_SECOND = 1_000_000

/**
 * The encoder owns one clock regardless of which compositor produced a frame.
 * Native-engine frames use a performance.now() timeline while canvas fallback
 * frames historically restarted near zero; deriving timestamps here prevents
 * producer switches from sending backward DTS/PTS into WebCodecs and FFmpeg.
 */
export function nextEncoderTimestamp(previousTimestamp: number | null, fps: number): number {
  const safeFps = Number.isFinite(fps) && fps > 0 ? Math.min(60, Math.max(1, Math.round(fps))) : 30
  const frameDuration = Math.max(1, Math.round(MICROSECONDS_PER_SECOND / safeFps))
  if (previousTimestamp === null || !Number.isFinite(previousTimestamp)) return 0
  return previousTimestamp + frameDuration
}
