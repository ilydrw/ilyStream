export type LayerType = 'camera' | 'display' | 'widget' | 'browser' | 'image' | 'text' | 'audio'

/** OBS-style blend modes, mapped onto canvas globalCompositeOperation. */
export type StudioBlendMode =
  | 'normal'
  | 'additive'
  | 'screen'
  | 'multiply'
  | 'lighten'
  | 'darken'
  | 'overlay'
  | 'soft-light'
  | 'difference'

export const BLEND_MODE_OPTIONS: Array<{ value: StudioBlendMode; label: string }> = [
  { value: 'normal', label: 'Normal' },
  { value: 'additive', label: 'Additive' },
  { value: 'screen', label: 'Screen' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'darken', label: 'Darken' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'soft-light', label: 'Soft Light' },
  { value: 'difference', label: 'Difference' }
]

/**
 * Translate a blend mode into the canvas composite operation that implements
 * it. Returns a literal union (not DOM's GlobalCompositeOperation) because
 * this shared file is also compiled for the main process without DOM libs.
 */
export function blendModeToCompositeOp(
  mode: StudioBlendMode | undefined
): 'source-over' | 'lighter' | 'screen' | 'multiply' | 'lighten' | 'darken' | 'overlay' | 'soft-light' | 'difference' {
  switch (mode) {
    case 'additive': return 'lighter'
    case 'screen': return 'screen'
    case 'multiply': return 'multiply'
    case 'lighten': return 'lighten'
    case 'darken': return 'darken'
    case 'overlay': return 'overlay'
    case 'soft-light': return 'soft-light'
    case 'difference': return 'difference'
    default: return 'source-over'
  }
}

/** Built-in mask shapes a source can be cut into. */
export type StudioShapeType = 'rect' | 'square' | 'circle' | 'star' | 'heart' | 'hexagon' | 'diamond' | 'none'

/** Glowing/animated border drawn around a masked source. */
export interface StudioShapeBorder {
  enabled: boolean
  type: 'chroma' | 'cyber' | 'gob-the-stopper' | 'solid' | 'custom'
  thickness: number // 1-20
  color?: string
  color1?: string
  color2?: string
  opacity?: number // 0-100
  speed?: number // 1-20 seconds
  audioReactive?: boolean
  reactivity?: number // 0-200 (Default: 100)
}

/** Drop shadow cast by a masked source. */
export interface StudioShapeShadow {
  enabled: boolean
  color: string
  blur: number // 0-100
  offsetX: number // -50 to 50
  offsetY: number // -50 to 50
}

/** Full object form of a source mask (position, scale, decoration). */
export interface StudioShapeMask {
  type: StudioShapeType
  x: number // 0-100
  y: number // 0-100
  scale: number // 1-100
  cutDepth?: number // 0-100, for notched masks such as heart/star
  scope: 'both' | '16:9' | '9:16'
  captureX?: number // 0-100 (Offset within source)
  captureY?: number // 0-100
  border?: StudioShapeBorder
  shadow?: StudioShapeShadow
}

export interface StudioLayer {
  id: string
  type: LayerType
  name: string
  zIndex: number
  opacity: number
  /** How this layer composites over the layers below it. Default: 'normal'. */
  blendMode?: StudioBlendMode

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
  flipH?: boolean
  flipV?: boolean
  visible: boolean
  locked: boolean

  // PORTRAIT (9:16) Transform
  portraitX: number
  portraitY: number
  portraitWidth: number
  portraitHeight: number
  portraitRotation?: number
  portraitFlipH?: boolean
  portraitFlipV?: boolean
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
    shape?: StudioShapeType | StudioShapeMask
    focusCircle?: {
      enabled: boolean
      x: number // 0-100
      y: number // 0-100
      radius: number // 1-100
      blur: number // 0-100
    }
    /**
     * OBS-style image mask: an image whose alpha (or luminance) cuts the
     * layer's shape. Works with any transparent PNG for custom-shaped sources.
     */
    imageMask?: {
      enabled: boolean
      /** `asset://<id>` or an absolute file path. */
      assetPath?: string
      /** 'alpha' uses the image's transparency; 'luma' uses its brightness. */
      mode?: 'alpha' | 'luma'
      invert?: boolean
    }
  }
}

export interface StudioScene {
  id: string
  name: string
  layers: StudioLayer[]
  layoutMode?: string
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

export const DEFAULT_AUDIO_SOURCE_VOLUME = 1

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
    codec: 'h264' | 'h265'
    encoder: 'auto' | 'libx264' | 'h264_nvenc' | 'h264_amf' | 'h264_qsv' | 'libx265' | 'hevc_nvenc' | 'hevc_amf' | 'hevc_qsv'
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
  flipH?: boolean
  flipV?: boolean
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
      flipH: layer.portraitFlipH ?? layer.flipH ?? false,
      flipV: layer.portraitFlipV ?? layer.flipV ?? false,
      visible: layer.portraitVisible ?? layer.visible,
      locked: layer.portraitLocked ?? layer.locked,
      crop: layer.portraitCrop ?? layer.crop
    }
  }
  return {
    ...layer,
    rotation: layer.rotation ?? 0,
    flipH: layer.flipH ?? false,
    flipV: layer.flipV ?? false,
    crop: layer.crop
  }
}

/** Canvas size for a given orientation — the studio's two fixed compositions. */
export function canvasSizeFor(aspectRatio: '16:9' | '9:16'): { width: number; height: number } {
  return aspectRatio === '9:16' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 }
}

/** The orientation-specific transform of a layer, used by copy/paste transform. */
export interface LayerTransformSnapshot {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  flipH: boolean
  flipV: boolean
  crop: { top: number; bottom: number; left: number; right: number } | null
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
    { id: 'desktop-audio', name: 'Desktop Audio', volume: DEFAULT_AUDIO_SOURCE_VOLUME, muted: false, monitoring: false, type: 'system', channelMode: 'stereo', pan: 0, filters: [] },
    { id: 'mic-audio', name: 'Mic/Aux', volume: DEFAULT_AUDIO_SOURCE_VOLUME, muted: false, monitoring: false, type: 'mic', channelMode: 'mono', pan: 0, filters: [] },
    { id: 'soundboard', name: 'Soundboard', volume: DEFAULT_AUDIO_SOURCE_VOLUME, muted: false, monitoring: true, type: 'media', channelMode: 'stereo', pan: 0, filters: [], locked: true },
    { id: 'tts-audio', name: 'TTS (Neural)', volume: DEFAULT_AUDIO_SOURCE_VOLUME, muted: false, monitoring: true, type: 'media', channelMode: 'stereo', pan: 0, filters: [], locked: true }
  ],
  stingerSettings: {
    path: '',
    cutPoint: 1000,
    duration: 2000
  },
  recordingSettings: {
    container: 'mkv',
    codec: 'h264',
    encoder: 'auto',
    crf: 18,
    audioBitrate: 192,
    bitrateKbps: 12000
  },
  audioReactivity: {
    smoothing: 0.6
  }
}
