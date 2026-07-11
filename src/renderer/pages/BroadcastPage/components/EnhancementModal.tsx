import { useCallback, useEffect, useRef, useState } from 'react'
import { IconSparkles } from '@tabler/icons-react'
import { Modal } from '../../../components/ui/Modal'
import type { StudioLayer } from '../../../../shared/studio'
import { clampShapeMaskTransform } from './CanvasEditor.utils'
import { EnhancementControlsPanel } from './EnhancementControlsPanel'
import type { EnhancementModalProps, EnhancementState } from './EnhancementModal.types'
import { defaultShape } from './EnhancementModal.utils'
import { EnhancementPreview } from './EnhancementPreview'

export function EnhancementModal({
  open,
  onClose,
  layer,
  onUpdate,
  videoRefs,
  aspectContext
}: EnhancementModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [localEnhancements, setLocalEnhancements] = useState<EnhancementState>(layer?.enhancements || {})

  const clampShape = useCallback((shape: unknown) => {
    const canvas = canvasRef.current
    return clampShapeMaskTransform(defaultShape(shape), canvas?.width || 1920, canvas?.height || 1080)
  }, [])

  const updateShape = useCallback((patch: Record<string, unknown>) => {
    const curr = defaultShape(localEnhancements.shape)
    setLocalEnhancements({ ...localEnhancements, shape: clampShape({ ...curr, ...patch }) })
  }, [clampShape, localEnhancements])

  useEffect(() => {
    if (layer) setLocalEnhancements(layer.enhancements || {})
  }, [layer?.id])

  const apply = () => {
    if (!layer) return
    const nextEnhancements = typeof localEnhancements.shape === 'object'
      ? { ...localEnhancements, shape: clampShape(localEnhancements.shape) }
      : localEnhancements
    onUpdate(layer.id, { enhancements: nextEnhancements as StudioLayer['enhancements'] })
    onClose()
  }

  if (!layer) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      className="max-w-[1440px] w-[96vw] h-[92vh] !rounded-[10px]"
      noScroll
      headerActions={
        <div className="flex items-center gap-4">
          <div className="p-2.5 rounded-xl bg-accent/10 text-accent">
            <IconSparkles size={20} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white tracking-tight leading-none">Enhance Source</h2>
            <p className="text-[10px] text-white/30 font-semibold tracking-tight mt-1">{layer.name}</p>
          </div>
        </div>
      }
    >
      <div className="flex flex-1 min-h-0">
        <EnhancementPreview
          open={open}
          layer={layer}
          videoRefs={videoRefs}
          canvasRef={canvasRef}
          clampShape={clampShape}
          enhancements={localEnhancements}
          setEnhancements={setLocalEnhancements}
        />
        <EnhancementControlsPanel
          enhancements={localEnhancements}
          setEnhancements={setLocalEnhancements}
          aspectContext={aspectContext}
          clampShape={clampShape}
          updateShape={updateShape}
          onReset={() => setLocalEnhancements({})}
          onApply={apply}
        />
      </div>
    </Modal>
  )
}
