/**
 * Toggle to surface the per-like log cascade across main, IPC, overlay, and
 * renderer. Off by default — TikTok bursts dozens of likes/sec and the logs
 * swamp stdout. Flip to `true` locally when actually debugging the like path.
 */
export const LIKE_LOG_VERBOSE = false
