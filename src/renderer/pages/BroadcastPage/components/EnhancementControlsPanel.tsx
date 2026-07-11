import {
  ChromaKeyControls,
  EnhancementFooter,
  FocusEngineControls,
  MasterControls,
  StylePresetControls
} from './EnhancementBasicControls'
import { SourceFramingControls } from './EnhancementSourceFramingControls'
import { VirtualBackgroundControls } from './EnhancementVirtualBackgroundControls'
import type { ClampShape, EnhancementPanelProps, UpdateShape } from './EnhancementModal.types'

interface EnhancementControlsPanelProps extends EnhancementPanelProps {
  aspectContext?: '16:9' | '9:16'
  clampShape: ClampShape
  updateShape: UpdateShape
  onReset: () => void
  onApply: () => void
}

export function EnhancementControlsPanel({
  enhancements,
  setEnhancements,
  aspectContext,
  clampShape,
  updateShape,
  onReset,
  onApply
}: EnhancementControlsPanelProps) {
  const panelProps = { enhancements, setEnhancements }

  return (
    <div className="w-[480px] border-l border-white/5 flex flex-col bg-[#0c0d10]/50">
      <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
        <FocusEngineControls {...panelProps} />
        <MasterControls {...panelProps} />
        <ChromaKeyControls {...panelProps} />
        <VirtualBackgroundControls {...panelProps} />
        <SourceFramingControls
          {...panelProps}
          aspectContext={aspectContext}
          clampShape={clampShape}
          updateShape={updateShape}
        />
        <StylePresetControls {...panelProps} />
      </div>

      <EnhancementFooter onReset={onReset} onApply={onApply} />
    </div>
  )
}
