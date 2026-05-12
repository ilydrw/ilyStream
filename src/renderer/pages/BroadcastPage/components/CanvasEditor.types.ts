import type { MutableRefObject } from 'react'
import type { StudioLayer, StudioScene } from '../../../../shared/studio'

export type CanvasOutputLayoutId = 'horizontal' | 'vertical'
export type CanvasPreviewMode = 'single' | 'horizontal' | 'vertical' | 'dual' | 'dual-portrait' | 'dual-horizontal'

export interface CanvasStreamOutput {
  id: CanvasOutputLayoutId
  active: boolean
  width: number
  height: number
  fps: number
  bitrateKbps: number
  inputFormat: 'h264' | 'mjpeg'
  codec?: string
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
}
