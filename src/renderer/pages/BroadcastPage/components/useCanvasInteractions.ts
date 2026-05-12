import { useState, useCallback, useRef } from 'react'
import type { StudioLayer } from '../../../../shared/studio'
import type { HandleDir, DragState, ResizeState, RotateState } from './CanvasEditor.types'

export function useCanvasInteractions(
  aspectRatio: '16:9' | '9:16',
  updateLayer: (sceneId: string, layerId: string, updates: Partial<StudioLayer>) => void,
  activeSceneId: string,
  saveHistory: () => void
) {
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [resizeState, setResizeState] = useState<ResizeState | null>(null)
  const [rotateState, setRotateState] = useState<RotateState | null>(null)
  const [croppingLayerId, setCroppingLayerId] = useState<string | null>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent, layer: StudioLayer) => {
    if (e.button !== 0 || layer.locked) return
    e.stopPropagation()
    saveHistory()
    setDragState({
      layerId: layer.id,
      startX: e.clientX,
      startY: e.clientY,
      initialX: layer.config.x || 0,
      initialY: layer.config.y || 0
    })
  }, [saveHistory])

  const handleResizeStart = useCallback((e: React.MouseEvent, layer: StudioLayer, handle: HandleDir) => {
    if (e.button !== 0 || layer.locked) return
    e.stopPropagation()
    saveHistory()
    setResizeState({
      layerId: layer.id,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      initialX: layer.config.x || 0,
      initialY: layer.config.y || 0,
      initialWidth: layer.config.width || 100,
      initialHeight: layer.config.height || 100
    })
  }, [saveHistory])

  const handleRotateStart = useCallback((e: React.MouseEvent, layer: StudioLayer) => {
    if (e.button !== 0 || layer.locked) return
    e.stopPropagation()
    saveHistory()
    setRotateState({
      layerId: layer.id,
      startX: e.clientX,
      startY: e.clientY,
      initialRotation: layer.config.rotation || 0
    })
  }, [saveHistory])

  return {
    dragState, setDragState,
    resizeState, setResizeState,
    rotateState, setRotateState,
    croppingLayerId, setCroppingLayerId,
    handleMouseDown,
    handleResizeStart,
    handleRotateStart
  }
}
