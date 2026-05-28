import type { MutableRefObject } from 'react'
import type { StudioLayer, StudioScene } from '../../../../shared/studio'

export type CanvasOutputLayoutId = 'horizontal' | 'vertical' | 'virtual-camera-session'
export type CanvasOutputInputFormat = 'h264' | 'mjpeg' | 'bgra'
export type CanvasPreviewMode = 'single' | 'horizontal' | 'vertical' | 'dual' | 'dual-portrait' | 'dual-horizontal'
export type VirtualCameraFeedMode = 'layout' | 'source'
export type VirtualCameraFeedLayout = 'current' | 'landscape' | 'portrait'
export type VirtualCameraSourceFitMode = 'contain' | 'cover' | 'stretch'

export interface VirtualCameraFeedConfig {
  mode: VirtualCameraFeedMode
  layout: VirtualCameraFeedLayout
  sourceFitMode: VirtualCameraSourceFitMode
  sourceLayerId?: string
}

export interface VirtualCameraSourceOption {
  id: string
  name: string
  type: string
}

export interface CanvasStreamOutput {
  id: CanvasOutputLayoutId
  active: boolean
  width: number
  height: number
  fps: number
  bitrateKbps: number
  inputFormat: CanvasOutputInputFormat
  codec?: string
  feed?: VirtualCameraFeedConfig
}

export interface CanvasEditorProps {
  activeScene: StudioScene
  isStreaming: boolean
  isRecording: boolean
  captureInputFormat: 'h264' | 'mjpeg'
  outputFps: number
  outputBitrateKbps: number
  videoRefs: MutableRefObject<Record<string, HTMLVideoElement>>
  streamReady: number
  outputCodec?: string
  streamOutputs?: CanvasStreamOutput[]
  previewMode?: CanvasPreviewMode
  selectionContext?: '16:9' | '9:16'
  dualVerticalOverlayEnabled?: boolean
  isVisible?: boolean
  isPreview?: boolean
  // Force the per-aspect output canvases to render even when no stream or
  // overlay needs them. Used by the projector mirror feature so it can grab
  // a 9:16 (or 16:9) render on demand.
  forceVerticalCanvas?: boolean
  forceHorizontalCanvas?: boolean
  onContextMenu?: (e: React.MouseEvent, layer: StudioLayer | null, aspectRatio: '16:9' | '9:16') => void
  onSelectionContextChange?: (context: '16:9' | '9:16') => void
}

export type HandleDir = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w'

export interface Crop {
  top: number
  bottom: number
  left: number
  right: number
}

export interface DragState {
  id: string
  startX: number
  startY: number
  origX: number
  origY: number
  width: number
  height: number
}

export interface ResizeState {
  id: string
  handle: HandleDir
  startX: number
  startY: number
  origX: number
  origY: number
  origW: number
  origH: number
  ratio: number
  isCropping?: boolean
}

export interface RotateState {
  id: string
  centerX: number
  centerY: number
  startAngle: number
  origRotation: number
}

export interface BrowserFrameSurface {
  width: number
  height: number
  bitmap?: ImageBitmap
  lastUpdateAt?: number
}

export interface BrowserFramePayload {
  id: string
  bitmap: unknown
  width: number
  height: number
  transparentBackground?: boolean
}

export interface CachedMediaFrame {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  lastUpdateAt: number
}

export interface CanvasEditorHandle {
  takeScreenshot: () => Promise<void>
  getCanvas: () => HTMLCanvasElement | null
  // Per-aspect offscreen canvases used for dual-output rendering. Returns
  // null if that aspect isn't currently being rendered (e.g. vertical canvas
  // is only created when dual mode / vertical stream output is active).
  getOutputCanvas: (aspect: '16:9' | '9:16') => HTMLCanvasElement | null
}
