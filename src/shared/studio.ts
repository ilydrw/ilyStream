export type LayerType = 'camera' | 'display' | 'widget' | 'browser' | 'image' | 'text' | 'audio'

export interface StudioLayer {
  id: string
  type: LayerType
  name: string
  zIndex: number
  opacity: number
  
  // SHARED configuration (e.g. camera ID, text content)
  config: {
    deviceId?: string
    widgetId?: string
    url?: string
    assetPath?: string
    text?: string
    color?: string
    fontSize?: number
    [key: string]: any
  }

  // LANDSCAPE (16:9) Transform
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  visible: boolean
  locked: boolean

  // PORTRAIT (9:16) Transform
  portraitX: number
  portraitY: number
  portraitWidth: number
  portraitHeight: number
  portraitRotation?: number
  portraitVisible: boolean
  portraitLocked: boolean

  // Cropping (Values are in pixels relative to original source size)
  crop?: { top: number; bottom: number; left: number; right: number }
  portraitCrop?: { top: number; bottom: number; left: number; right: number }

  // Video Enhancements
  enhancements?: {
    brightness?: number // 0-200 (Default: 100)
    contrast?: number   // 0-200 (Default: 100)
    saturation?: number // 0-200 (Default: 100)
    sharpen?: number    // 0-100 (Default: 0)
    beauty?: number     // 0-100 (Default: 0)
    temperature?: number // -100 to 100 (Default: 0)
    vignette?: number   // 0-100 (Default: 0)
    filterPreset?: string // 'none', 'bw', 'sepia', 'vintage', 'polaroid', etc.
    cornerRadius?: number // 0 to 100
    shape?: 'rect' | 'circle' | 'star' | 'heart' | 'hexagon' | 'diamond' | {
      type: 'rect' | 'circle' | 'star' | 'heart' | 'hexagon' | 'diamond'
      x: number // 0-100
      y: number // 0-100
      scale: number // 1-100
      scope: 'both' | '16:9' | '9:16'
    }
    focusCircle?: {
      enabled: boolean
      x: number // 0-100
      y: number // 0-100
      radius: number // 1-100
      blur: number // 0-100
    }
  }
}

export interface StudioScene {
  id: string
  name: string
  layers: StudioLayer[]
}

export interface AudioSource {
  id: string
  name: string
  label?: string
  color?: string
  deviceId?: string
  volume: number // 0 to 1
  muted: boolean
  monitoring: boolean // Hear it in headphones
  locked?: boolean
  type: 'system' | 'mic' | 'media' | 'layer'
  channelMode: 'mono' | 'stereo'
  pan: number // -1 (left) to 1 (right)
  fxChain: Array<{ id: string, type: string, params: any, enabled: boolean }>
}

export interface StudioState {
  scenes: StudioScene[]
  activeSceneId: string | null
  canvasWidth: number
  canvasHeight: number
  aspectRatio: '16:9' | '9:16'
  snapToGrid: boolean
  gridSize: number
  audioSources: AudioSource[]
  masterBus?: AudioSource
  routing?: Record<string, string>
}

export interface ResolvedLayout {
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  visible: boolean
  locked: boolean
  crop?: { top: number; bottom: number; left: number; right: number }
}

export function resolveLayerLayout(layer: StudioLayer, aspectRatio: '16:9' | '9:16'): StudioLayer & ResolvedLayout {
  if (aspectRatio === '9:16') {
    return {
      ...layer,
      x: layer.portraitX ?? layer.x,
      y: layer.portraitY ?? layer.y,
      width: layer.portraitWidth ?? layer.width,
      height: layer.portraitHeight ?? layer.height,
      rotation: layer.portraitRotation ?? layer.rotation ?? 0,
      visible: layer.portraitVisible ?? layer.visible,
      locked: layer.portraitLocked ?? layer.locked,
      crop: layer.portraitCrop ?? layer.crop
    }
  }
  return {
    ...layer,
    rotation: layer.rotation ?? 0,
    crop: layer.crop
  }
}

export const DEFAULT_STUDIO_STATE: StudioState = {
  scenes: [
    {
      id: 'default-scene',
      name: 'Default Scene',
      layers: []
    }
  ],
  activeSceneId: 'default-scene',
  canvasWidth: 1920,
  canvasHeight: 1080,
  aspectRatio: '16:9',
  snapToGrid: false,
  gridSize: 20,
  audioSources: [
    { id: 'desktop-audio', name: 'Desktop Audio', volume: 0.8, muted: false, monitoring: false, type: 'system', channelMode: 'stereo', pan: 0, fxChain: [] },
    { id: 'mic-audio', name: 'Mic/Aux', volume: 0.8, muted: false, monitoring: false, type: 'mic', channelMode: 'mono', pan: 0, fxChain: [] },
    { id: 'soundboard', name: 'Soundboard', volume: 0.8, muted: false, monitoring: true, type: 'media', channelMode: 'stereo', pan: 0, fxChain: [], locked: true },
    { id: 'tts-audio', name: 'TTS (Neural)', volume: 0.8, muted: false, monitoring: true, type: 'media', channelMode: 'stereo', pan: 0, fxChain: [], locked: true }
  ]
}
