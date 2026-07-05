import { useEffect, useState } from 'react'
import { IconArrowsMove, IconLock, IconLockOpen, IconVideo, IconDeviceDesktop, IconStack2, IconWorld, IconTypography, IconPhoto as ImageIcon, IconAdjustments, IconLayersSubtract, IconMicrophone } from '@tabler/icons-react'
import { IconPlus, IconEye, IconEyeOff } from '../../../components/ui/icons'
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion'
import type { StudioLayer, StudioScene } from '../../../../shared/studio'
import { LayerProperties } from './LayerProperties'

interface SourceSidebarProps {
  activeScene: StudioScene
  selectedLayerId: string | null
  onSelectLayer: (id: string | null) => void
  onUpdateLayer: (id: string, update: any) => void
  onReorderLayer: (id: string, index: number) => void
  onShowSourceModal: () => void
  onContextMenu: (e: React.MouseEvent, layer: StudioLayer, aspectRatio: '16:9' | '9:16') => void
  aspectRatio: string
  broadcastLayoutMode: string
  widgets: any[]
  devices: any[]
  sidebarWidth: number
  onSidebarResizeStart: () => void
  selectionContext: '16:9' | '9:16'
  onSelectionContextChange: (ctx: '16:9' | '9:16') => void
  renamingLayerId?: string | null
  onRenamingLayerChange?: (id: string | null) => void
  /** Open the widget editor for a widget layer (canvas double-click does the same). */
  onEditWidgetLayer?: (layer: StudioLayer) => void
}

const LAYER_TYPE_ICONS: Record<string, any> = {
  camera: IconVideo,
  display: IconDeviceDesktop,
  widget: IconStack2,
  browser: IconWorld,
  text: IconTypography,
  image: ImageIcon,
  audio: IconMicrophone
}

interface SourceRowProps {
  layer: StudioLayer
  orientation: '16:9' | '9:16'
  isSelected: boolean
  isRenaming: boolean
  onSelect: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onUpdateLayer: (id: string, update: any) => void
  onRenameCommit: (name: string) => void
  onRenameStart: () => void
}

function SourceRow(props: SourceRowProps) {
  const { layer, orientation, isSelected, isRenaming, onSelect, onContextMenu, onUpdateLayer, onRenameCommit, onRenameStart } = props
  const dragControls = useDragControls()
  const [nameDraft, setNameDraft] = useState(layer.name)

  useEffect(() => {
    if (isRenaming) setNameDraft(layer.name)
  }, [isRenaming, layer.name])

  const Icon = LAYER_TYPE_ICONS[layer.type] || IconStack2
  const isPortraitList = orientation === '9:16'
  const isVisible = isPortraitList ? (layer.portraitVisible ?? layer.visible) : layer.visible
  const isLocked = isPortraitList ? (layer.portraitLocked ?? layer.locked) : layer.locked
  const isAudioLayer = layer.type === 'audio'

  return (
    <Reorder.Item
      value={layer.id}
      dragListener={false}
      dragControls={dragControls}
      onClick={(e: React.MouseEvent) => {
        e.stopPropagation()
        onSelect()
      }}
      onContextMenu={onContextMenu}
      className={`broadcast-source-row ${isSelected ? 'is-selected' : ''}`}
    >
      <div
        className="broadcast-source-drag cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => {
          e.stopPropagation()
          dragControls.start(e)
        }}
        title="Drag to reorder"
      >
        <IconArrowsMove size={12} />
      </div>

      <div className="broadcast-source-type">
        <Icon size={14} className={isSelected ? 'text-white' : ''} />
      </div>

      {isRenaming ? (
        <input
          value={nameDraft}
          autoFocus
          onFocus={(e) => e.target.select()}
          onChange={(e) => setNameDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={() => onRenameCommit(nameDraft)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRenameCommit(nameDraft)
            if (e.key === 'Escape') onRenameCommit(layer.name)
          }}
          className="broadcast-source-name bg-white/10 rounded px-1.5 outline-none border border-accent/40 min-w-0"
        />
      ) : (
        <span className="broadcast-source-name" onDoubleClick={(e) => { e.stopPropagation(); onRenameStart() }}>
          {layer.name}
        </span>
      )}

      {!isAudioLayer && (
        <div className="broadcast-source-actions">
          <button
            type="button"
            title={isLocked ? 'Unlock source' : 'Lock source'}
            onClick={(e) => { e.stopPropagation(); onUpdateLayer(layer.id, isPortraitList ? { portraitLocked: !isLocked } : { locked: !isLocked }) }}
            className="broadcast-icon-button"
          >
            {isLocked ? <IconLock size={13} className="text-amber-400" /> : <IconLockOpen size={13} className="text-white/20" />}
          </button>
          <button
            type="button"
            title={isVisible ? 'Hide source' : 'Show source'}
            onClick={(e) => { e.stopPropagation(); onUpdateLayer(layer.id, isPortraitList ? { portraitVisible: !isVisible } : { visible: !isVisible }) }}
            className="broadcast-icon-button"
          >
            {isVisible ? <IconEye size={13} className="text-white/40" /> : <IconEyeOff size={13} className="text-red-500/60" />}
          </button>
        </div>
      )}

      {isSelected && (
        <motion.div
          layoutId="active-indicator"
          className="broadcast-source-active-indicator"
        />
      )}
    </Reorder.Item>
  )
}

export function SourceSidebar(props: SourceSidebarProps) {
  const {
    activeScene, selectedLayerId, onSelectLayer, onUpdateLayer, onReorderLayer,
    onShowSourceModal, onContextMenu, aspectRatio, broadcastLayoutMode, widgets, devices, sidebarWidth, onSidebarResizeStart,
    selectionContext, onSelectionContextChange, renamingLayerId, onRenamingLayerChange,
    onEditWidgetLayer
  } = props

  const selectedLayer = activeScene.layers.find(l => l.id === selectedLayerId) || null
  const visibleSourceSections: readonly ('16:9' | '9:16')[] = (() => {
    if (broadcastLayoutMode === 'vertical') return ['9:16'] as const
    if (broadcastLayoutMode === 'horizontal') return ['16:9'] as const
    if (broadcastLayoutMode === 'dual-portrait') return ['9:16'] as const
    if (broadcastLayoutMode === 'dual-horizontal') return ['16:9'] as const
    return ['16:9', '9:16'] as const
  })()

  // Top of the list = top of the visual stack (highest zIndex), like OBS.
  const stackedIds = [...activeScene.layers]
    .sort((a, b) => a.zIndex - b.zIndex)
    .reverse()
    .map(l => l.id)

  const commitRename = (layerId: string, name: string) => {
    const trimmed = name.trim()
    if (trimmed) onUpdateLayer(layerId, { name: trimmed })
    onRenamingLayerChange?.(null)
  }

  const handleReorder = (orderedTopFirst: string[]) => {
    // Find the item whose position changed and commit it as a single move so
    // undo history stays one entry per drop.
    const previous = stackedIds
    const movedId = orderedTopFirst.find((id, index) => previous[index] !== id)
    if (!movedId) return
    const newTopFirstIndex = orderedTopFirst.indexOf(movedId)
    // Convert top-first display index to the forward zIndex position.
    const forwardIndex = orderedTopFirst.length - 1 - newTopFirstIndex
    onReorderLayer(movedId, forwardIndex)
  }

  const renderLayerList = (orientation: '16:9' | '9:16', title: string) => {
    const isCurrentContext = selectionContext === orientation

    return (
      <div className={`broadcast-source-section ${isCurrentContext ? 'is-active' : ''}`}>
        <div
          onClick={() => onSelectionContextChange(orientation)}
          className="broadcast-source-section-head"
        >
          <div className="broadcast-source-section-title">
            <div className="broadcast-source-section-mark" />
            <h3>{title}</h3>
          </div>
          {isCurrentContext && (
            <button
              type="button"
              title="Add source"
              onClick={(e) => { e.stopPropagation(); onShowSourceModal() }}
              className="broadcast-icon-button is-primary"
            >
              <IconPlus size={16} />
            </button>
          )}
        </div>

        <Reorder.Group
          axis="y"
          values={stackedIds}
          onReorder={handleReorder}
          as="div"
          className="broadcast-source-list custom-scrollbar"
        >
          {stackedIds.map((layerId) => {
            const layer = activeScene.layers.find(l => l.id === layerId)
            if (!layer) return null
            return (
              <SourceRow
                key={`${orientation}-${layer.id}`}
                layer={layer}
                orientation={orientation}
                isSelected={selectedLayerId === layer.id && isCurrentContext}
                isRenaming={renamingLayerId === layer.id && isCurrentContext}
                onSelect={() => {
                  onSelectLayer(layer.id)
                  onSelectionContextChange(orientation)
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  onSelectionContextChange(orientation)
                  onContextMenu(e, layer, orientation)
                }}
                onUpdateLayer={onUpdateLayer}
                onRenameCommit={(name) => commitRename(layer.id, name)}
                onRenameStart={() => {
                  onSelectionContextChange(orientation)
                  onRenamingLayerChange?.(layer.id)
                }}
              />
            )
          })}

          {activeScene.layers.length === 0 && (
            <div className="broadcast-source-empty">
              <div>
                <IconLayersSubtract size={24} />
              </div>
              <p>No sources</p>
            </div>
          )}
        </Reorder.Group>
      </div>
    )
  }

  return (
    <div className="broadcast-dock broadcast-sources-dock animate-in slide-in-from-right duration-300" style={{ width: sidebarWidth }}>
      {/* Resize Handle */}
      <div onPointerDown={onSidebarResizeStart} className="broadcast-dock-resize group">
        <div>
          <div className="w-0.5 h-4 bg-white/20 group-hover:bg-white/60" />
        </div>
      </div>

      <div className="broadcast-sources-inner">
        <div className="broadcast-dock-head">
          <div className="min-w-0">
            <h3>Sources</h3>
            <span>{activeScene.name}</span>
          </div>
          <button
            type="button"
            title="Add source"
            onClick={onShowSourceModal}
            className="broadcast-icon-button is-primary"
          >
            <IconPlus size={16} />
          </button>
        </div>

        {/* Source Lists */}
        <div className="broadcast-source-sections">
          {visibleSourceSections.includes('16:9') && renderLayerList('16:9', 'Desktop Environment')}
          {visibleSourceSections.includes('9:16') && renderLayerList('9:16', 'Mobile Environment')}
        </div>

        {/* Selected Layer Properties */}
        <AnimatePresence mode="wait">
          {selectedLayer ? (
            <motion.div
              key="properties"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="broadcast-inspector"
            >
              <div className="broadcast-inspector-head">
                <div>
                  <IconAdjustments size={14} className="text-accent" />
                  <span>Source Inspector</span>
                </div>
                <button
                  type="button"
                  title="Clear selection"
                  onClick={() => onSelectLayer(null)}
                  className="broadcast-icon-button"
                >
                  <IconPlus className="rotate-45" size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <LayerProperties
                  layer={selectedLayer}
                  sceneId={activeScene.id}
                  widgets={widgets}
                  devices={devices}
                  broadcastLayoutMode={broadcastLayoutMode}
                  activeOrientation={selectionContext}
                  onEditWidget={onEditWidgetLayer ? () => onEditWidgetLayer(selectedLayer) : undefined}
                />
              </div>
            </motion.div>
          ) : (
            <div className="broadcast-inspector-empty">
              <div>
                <IconAdjustments size={20} />
              </div>
              <p>No selection</p>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
