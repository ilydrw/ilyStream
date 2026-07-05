export const MAX_CAMERA_CAPTURE_WIDTH = 3840
export const MAX_CAMERA_CAPTURE_HEIGHT = 2160
export const MAX_CAMERA_CAPTURE_FPS = 144

export interface CameraCapturePreset {
  width: number
  height: number
  fps: number
  label: string
}

export const DEFAULT_CAMERA_CAPTURE_PRESET = '1080p30'
export const CAMERA_CAPTURE_PRESETS: Record<string, CameraCapturePreset> = {
  '2160p144': { width: 3840, height: 2160, fps: 144, label: '4K 144 FPS' },
  '2160p120': { width: 3840, height: 2160, fps: 120, label: '4K 120 FPS' },
  '2160p60': { width: 3840, height: 2160, fps: 60, label: '4K 60 FPS' },
  '1440p144': { width: 2560, height: 1440, fps: 144, label: '1440p 144 FPS' },
  '1440p120': { width: 2560, height: 1440, fps: 120, label: '1440p 120 FPS' },
  '1080p144': { width: 1920, height: 1080, fps: 144, label: '1080p 144 FPS' },
  '1080p120': { width: 1920, height: 1080, fps: 120, label: '1080p 120 FPS' },
  '1080p60': { width: 1920, height: 1080, fps: 60, label: '1080p 60 FPS' },
  '1080p30': { width: 1920, height: 1080, fps: 30, label: '1080p 30 FPS' },
  '720p60': { width: 1280, height: 720, fps: 60, label: '720p 60 FPS' },
  '720p30': { width: 1280, height: 720, fps: 30, label: '720p 30 FPS' }
}
