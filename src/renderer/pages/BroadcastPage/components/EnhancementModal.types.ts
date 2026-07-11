import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react'
import type { StudioLayer } from '../../../../shared/studio'

export interface EnhancementModalProps {
  open: boolean
  onClose: () => void
  layer: StudioLayer | null
  onUpdate: (id: string, updates: Partial<StudioLayer>) => void
  videoRefs: MutableRefObject<Record<string, HTMLVideoElement>>
  aspectContext?: '16:9' | '9:16'
}

export type EnhancementState = Record<string, any>
export type ShapeState = Record<string, any>
export type DragTarget = 'mask' | 'capture'
export type SetEnhancements = Dispatch<SetStateAction<EnhancementState>>
export type ClampShape = (shape: unknown) => ShapeState
export type UpdateShape = (patch: Record<string, unknown>) => void

export interface EnhancementPanelProps {
  enhancements: EnhancementState
  setEnhancements: SetEnhancements
}

export interface EnhancementPreviewProps extends EnhancementPanelProps {
  open: boolean
  layer: StudioLayer
  videoRefs: MutableRefObject<Record<string, HTMLVideoElement>>
  canvasRef: RefObject<HTMLCanvasElement | null>
  clampShape: ClampShape
}
