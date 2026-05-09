import type { MutableRefObject } from 'react'
import type { StudioLayer, StudioScene } from '../../../../shared/studio'

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
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  imageData: ImageData
  rgba: Uint8ClampedArray
  pixels: Uint32Array
  width: number
  height: number
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
