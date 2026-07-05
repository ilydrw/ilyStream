export const MAX_CAMERA_CAPTURE_FPS = 60
export const MAX_CAMERA_CAPTURE_HEIGHT = 2160
export const MAX_CAMERA_CAPTURE_WIDTH = 3840
export const CAMERA_CAPTURE_PRESETS = [
  { id: '1080p60', label: '1080p 60fps', width: 1920, height: 1080, fps: 60 },
  { id: '1080p30', label: '1080p 30fps', width: 1920, height: 1080, fps: 30 },
  { id: '720p60', label: '720p 60fps', width: 1280, height: 720, fps: 60 },
  { id: '720p30', label: '720p 30fps', width: 1280, height: 720, fps: 30 },
  { id: '4k30', label: '4K 30fps', width: 3840, height: 2160, fps: 30 }
]
export const DEFAULT_CAMERA_CAPTURE_PRESET = '1080p30'
