export const RENDERER_EVENT_CHANNELS = [
  'event:stream',
  'event:overlay-broadcast',
  'event:device-broadcast',
  'automation:run-receipt',
  'platform:status-change',
  'platform:error',
  'platform:reconnecting',
  'tiktok:native-auth-progress',
  'settings:changed',
  'obs:status-changed',
  'voice:changed',
  'tts:queue-update',
  'tts:speak',
  'tts:prefetch',
  'tts:stop-speaking',
  'tts:pause',
  'tts:resume',
  'sound:play',
  'streaming:status-changed',
  'streaming:bitrate-adjusted',
  'action:play-sound',
  'action:show-alert',
  'overlay:status-changed',
  'spotify:status-changed',
  'spotify:queue-update',
  'x:status-changed',
  'clip:created',
  'browser-source:frame',
  'browser-source:error',
  'app:close-request',
  'system:ping',
  'action:stop-all-sounds',
  'spotify:now-playing',
  'govee:status-changed',
  'govee:ble-device-list',
  'govee:ble-command',
  'lighting:state-changed',
  'razer:status-changed',
  'streaming:native-audio-clock',
  'system:log',
  'virtualcamera:status-changed',
  'system:update-status',
  'studio:active-scene-changed'
] as const

export type RendererEventChannel = (typeof RENDERER_EVENT_CHANNELS)[number]

const rendererEventChannelSet: ReadonlySet<string> = new Set(RENDERER_EVENT_CHANNELS)

export function isRendererEventChannel(channel: string): channel is RendererEventChannel {
  return rendererEventChannelSet.has(channel)
}
