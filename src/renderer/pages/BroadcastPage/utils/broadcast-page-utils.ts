import { DEFAULT_APP_SETTINGS, resolveAppSettings } from '../../../../shared/app-settings'
import type {
  VirtualCameraFeedConfig,
  VirtualCameraSourceFitMode
} from '../components/CanvasEditor.types'
import type { BroadcastLayoutMode } from './streaming-config'

export type ProjectorAspectRatio = '16:9' | '9:16'

export const LANDSCAPE_STAGE = { width: 1920, height: 1080 }
export const PORTRAIT_STAGE = { width: 1080, height: 1920 }

const VIRTUAL_CAMERA_FEED_STORAGE_KEY = 'ilystream-virtual-camera-feed'
const DEFAULT_VIRTUAL_CAMERA_FEED: VirtualCameraFeedConfig = {
  mode: 'layout',
  layout: 'current',
  sourceFitMode: 'cover'
}

const DEFAULT_BROADCAST_FPS = Math.min(60, Math.max(1, DEFAULT_APP_SETTINGS.streaming.fps))
const DEFAULT_BROADCAST_BITRATE_KBPS = DEFAULT_APP_SETTINGS.streaming.bitrate
const TWITCH_SAFE_FPS = 30
const TWITCH_SAFE_BITRATE_KBPS = 4500

interface BroadcastDestinationLike {
  platform?: {
    id?: string
    name?: string
    url?: string
  }
}

export function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function clampBroadcastFps(value: unknown): number {
  const fps = Number(value)
  const fallback = Number.isFinite(DEFAULT_BROADCAST_FPS) ? DEFAULT_BROADCAST_FPS : 60
  return Math.max(1, Math.min(60, Math.round(Number.isFinite(fps) ? fps : fallback)))
}

export function clampBroadcastBitrateKbps(value: unknown): number {
  const bitrate = Number(value)
  const fallback = Number.isFinite(DEFAULT_BROADCAST_BITRATE_KBPS) ? DEFAULT_BROADCAST_BITRATE_KBPS : 6000
  return Math.max(500, Math.min(51000, Math.round(Number.isFinite(bitrate) ? bitrate : fallback)))
}

export async function loadBroadcastOutputConfig(): Promise<{ fps: number; bitrateKbps: number }> {
  try {
    const settings = resolveAppSettings(await window.api.settings.getAll())
    return {
      fps: clampBroadcastFps(settings.streaming.fps),
      bitrateKbps: clampBroadcastBitrateKbps(settings.streaming.bitrate)
    }
  } catch (err) {
    console.warn('[BroadcastPage] Failed to load broadcast defaults; using safe fallback:', err)
    return {
      fps: clampBroadcastFps(DEFAULT_BROADCAST_FPS),
      bitrateKbps: clampBroadcastBitrateKbps(DEFAULT_BROADCAST_BITRATE_KBPS)
    }
  }
}

export function usesTwitchIngest(destination: BroadcastDestinationLike): boolean {
  const id = String(destination.platform?.id || '').toLowerCase()
  const url = String(destination.platform?.url || '').toLowerCase()
  return id === 'twitch' || url.includes('twitch.tv') || url.includes('global-contribute.live-video.net')
}

export function applyDestinationOutputCaps(
  config: { fps: number; bitrateKbps: number },
  destinations: BroadcastDestinationLike[]
): { fps: number; bitrateKbps: number } {
  if (!destinations.some(usesTwitchIngest)) return config

  const capped = {
    fps: Math.min(config.fps, TWITCH_SAFE_FPS),
    bitrateKbps: Math.min(config.bitrateKbps, TWITCH_SAFE_BITRATE_KBPS)
  }

  if (capped.fps !== config.fps || capped.bitrateKbps !== config.bitrateKbps) {
    console.warn(
      `[BroadcastPage] Applying Twitch-safe output cap: ${capped.fps} FPS / ${capped.bitrateKbps} Kbps`
    )
  }

  return capped
}

function isVirtualCameraSourceFitMode(value: unknown): value is VirtualCameraSourceFitMode {
  return value === 'contain' || value === 'cover' || value === 'stretch'
}

export function normalizeVirtualCameraFeed(value: unknown): VirtualCameraFeedConfig {
  const raw = value && typeof value === 'object' ? value as Partial<VirtualCameraFeedConfig> : {}
  const mode = raw.mode === 'source' ? 'source' : 'layout'
  const layout =
    raw.layout === 'landscape' || raw.layout === 'portrait' || raw.layout === 'current'
      ? raw.layout
      : DEFAULT_VIRTUAL_CAMERA_FEED.layout
  const sourceFitMode = isVirtualCameraSourceFitMode(raw.sourceFitMode)
    ? raw.sourceFitMode
    : DEFAULT_VIRTUAL_CAMERA_FEED.sourceFitMode
  const sourceLayerId = typeof raw.sourceLayerId === 'string' && raw.sourceLayerId.length > 0
    ? raw.sourceLayerId
    : undefined

  return sourceLayerId
    ? { mode, layout, sourceFitMode, sourceLayerId }
    : { mode, layout, sourceFitMode }
}

export function loadVirtualCameraFeed(): VirtualCameraFeedConfig {
  if (typeof window === 'undefined') return DEFAULT_VIRTUAL_CAMERA_FEED
  try {
    const raw = window.localStorage.getItem(VIRTUAL_CAMERA_FEED_STORAGE_KEY)
    return raw ? normalizeVirtualCameraFeed(JSON.parse(raw)) : DEFAULT_VIRTUAL_CAMERA_FEED
  } catch {
    return DEFAULT_VIRTUAL_CAMERA_FEED
  }
}

export function saveVirtualCameraFeed(feed: VirtualCameraFeedConfig): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(VIRTUAL_CAMERA_FEED_STORAGE_KEY, JSON.stringify(normalizeVirtualCameraFeed(feed)))
  } catch {
    // Renderer preference persistence is best-effort.
  }
}

export function getLayoutModeForAspectRatio(aspectRatio: ProjectorAspectRatio): BroadcastLayoutMode {
  return aspectRatio === '9:16' ? 'vertical' : 'horizontal'
}

export function getAspectRatioForLayoutMode(mode: BroadcastLayoutMode): ProjectorAspectRatio {
  return mode === 'vertical' || mode === 'dual-portrait' ? '9:16' : '16:9'
}

export function fitRect(
  stage: { width: number; height: number },
  sourceWidth: number,
  sourceHeight: number,
  fill = 0.72
) {
  const scale = Math.min(stage.width * fill / sourceWidth, stage.height * fill / sourceHeight)
  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))
  return {
    x: Math.round((stage.width - width) / 2),
    y: Math.round((stage.height - height) / 2),
    width,
    height
  }
}

export function fullStageRect(stage: { width: number; height: number }) {
  return { x: 0, y: 0, width: stage.width, height: stage.height }
}
