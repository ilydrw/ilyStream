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
    fitMode?: 'contain' | 'cover' | 'stretch'
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
    blur?: number       // 0-100 (Default: 0)
    filterPreset?: string // 'none', 'bw', 'sepia', 'vintage', 'polaroid', etc.
    cornerRadius?: number // 0 to 100
    chromaKey?: {
      enabled: boolean
      color: string
      similarity: number // 1-100
      smoothness: number // 0-100
      spill: number // 0-100
    }
    virtualBackground?: {
      enabled: boolean
      type: 'image' | 'blur' | 'color'
      value?: string // image path or hex color
      blurStrength?: number // 0-100
      opacity?: number // 0-100
      scalingMode?: 'cover' | 'contain' | 'stretch'
    }
    shape?: 'rect' | 'circle' | 'star' | 'heart' | 'hexagon' | 'diamond' | 'none' | {
      type: 'rect' | 'circle' | 'star' | 'heart' | 'hexagon' | 'diamond' | 'none'
      x: number // 0-100
      y: number // 0-100
      scale: number // 1-100
      scope: 'both' | '16:9' | '9:16'
      captureX?: number // 0-100 (Offset within source)
      captureY?: number // 0-100
      border?: {
        enabled: boolean
        type: 'chroma' | 'cyber' | 'solid'
        thickness: number // 1-20
        color?: string
        opacity?: number // 0-100
        audioReactive?: boolean
        reactivity?: number // 0-200 (Default: 100)
      }
      shadow?: {
        enabled: boolean
        color: string
        blur: number // 0-100
        offsetX: number // -50 to 50
        offsetY: number // -50 to 50
      }
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
  filters?: Array<{
    id: string
    type: 'gate' | 'compressor' | 'limiter' | 'gain' | 'eq' | 'radio' | 'echo'
    enabled: boolean
    params: {
      threshold?: number // dB
      ratio?: number
      attack?: number // ms
      release?: number // ms
      knee?: number
      gain?: number // dB
      frequency?: number // for EQ
      q?: number // for EQ
    }
  }>
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
  stingerSettings: {
    path: string
    cutPoint: number // ms
    duration: number // ms
  }
  recordingSettings: {
    container: 'mkv' | 'mp4' | 'flv' | 'mov'
    encoder: 'auto' | 'libx264' | 'h264_nvenc' | 'h264_amf' | 'h264_qsv'
    crf: number
    audioBitrate: number
    bitrateKbps: number
  }
  audioReactivity: {
    smoothing: number
  }
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
    { id: 'desktop-audio', name: 'Desktop Audio', volume: 0.8, muted: false, monitoring: false, type: 'system', channelMode: 'stereo', pan: 0, filters: [] },
    { id: 'mic-audio', name: 'Mic/Aux', volume: 0.8, muted: false, monitoring: false, type: 'mic', channelMode: 'mono', pan: 0, filters: [] },
    { id: 'soundboard', name: 'Soundboard', volume: 0.8, muted: false, monitoring: true, type: 'media', channelMode: 'stereo', pan: 0, filters: [], locked: true },
    { id: 'tts-audio', name: 'TTS (Neural)', volume: 0.8, muted: false, monitoring: true, type: 'media', channelMode: 'stereo', pan: 0, filters: [], locked: true }
  ],
  stingerSettings: {
    path: '',
    cutPoint: 1000,
    duration: 2000
  },
  recordingSettings: {
    container: 'mkv',
    encoder: 'auto',
    crf: 18,
    audioBitrate: 192,
    bitrateKbps: 12000
  },
  audioReactivity: {
    smoothing: 0.6
  }
}
