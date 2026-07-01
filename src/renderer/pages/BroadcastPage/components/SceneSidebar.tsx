import { IconCopy, IconPlus, IconTrash } from '../../../components/ui/icons'
import type { StudioLayer, StudioScene } from '../../../../shared/studio'
import { resolveLayerLayout } from '../../../../shared/studio'

interface SceneSidebarProps {
  scenes: StudioScene[]
  activeSceneId: string | null
  onSelectScene: (id: string) => void
  onAddScene: (name: string) => void
  onRenameScene: (id: string, name: string) => void
  onDuplicateScene: (id: string) => void
  onRemoveScene: (id: string) => void
  editingSceneId: string | null
  setEditingSceneId: (id: string | null) => void
  editingSceneName: string
  setEditingSceneName: (name: string) => void
  activeOrientation?: '16:9' | '9:16'
  onContextMenu: (e: React.MouseEvent, sceneId: string) => void
}

const THUMB_CANVAS = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 }
}

function clampPercent(value: number) {
  return Math.max(-8, Math.min(108, value))
}

function getLayerColor(type: StudioLayer['type']) {
  switch (type) {
    case 'camera':
      return 'camera'
    case 'display':
      return 'display'
    case 'browser':
      return 'browser'
    case 'text':
      return 'text'
    case 'image':
      return 'image'
    case 'widget':
      return 'widget'
    default:
      return 'default'
  }
}

function SceneThumbnail({ scene, activeOrientation }: { scene: StudioScene; activeOrientation: '16:9' | '9:16' }) {
  const thumbCanvas = THUMB_CANVAS[activeOrientation]
  const visibleLayers = scene.layers
    .map(layer => ({ layer, layout: resolveLayerLayout(layer, activeOrientation) }))
    .filter(({ layer, layout }) => layer.type !== 'audio' && layout.visible !== false)
    .sort((a, b) => a.layer.zIndex - b.layer.zIndex)
    .slice(-8)

  return (
    <span className="broadcast-scene-thumb" aria-hidden="true">
      <span className="broadcast-scene-thumb-grid" />
      {visibleLayers.length === 0 ? (
        <span className="broadcast-scene-thumb-empty" />
      ) : (
        visibleLayers.map(({ layer, layout }) => {
          const left = clampPercent((layout.x / thumbCanvas.width) * 100)
          const top = clampPercent((layout.y / thumbCanvas.height) * 100)
          const width = clampPercent((layout.width / thumbCanvas.width) * 100)
          const height = clampPercent((layout.height / thumbCanvas.height) * 100)

          return (
            <span
              key={layer.id}
              className={`broadcast-scene-thumb-layer is-${getLayerColor(layer.type)}`}
              style={{
                left: `${left}%`,
                top: `${top}%`,
                width: `${Math.max(4, width)}%`,
                height: `${Math.max(4, height)}%`,
                opacity: Math.max(0.25, Math.min(1, layer.opacity ?? 1))
              }}
            />
          )
        })
      )}
    </span>
  )
}

export function SceneSidebar(props: SceneSidebarProps) {
  const {
    scenes,
    activeSceneId,
    onSelectScene,
    onAddScene,
    onRenameScene,
    onDuplicateScene,
    onRemoveScene,
    editingSceneId,
    setEditingSceneId,
    editingSceneName,
    setEditingSceneName,
    activeOrientation = '16:9',
    onContextMenu
  } = props

  const activeScene = scenes.find(scene => scene.id === activeSceneId) || scenes[0] || null

  return (
    <div className="broadcast-dock broadcast-scenes-dock animate-in slide-in-from-left duration-300">
      <div className="broadcast-dock-head">
        <div className="min-w-0">
          <h3>Scenes</h3>
          <span>{scenes.length} total</span>
        </div>
        <button
          type="button"
          title="Add scene"
          onClick={() => onAddScene(`Scene ${scenes.length + 1}`)}
          className="broadcast-icon-button is-primary"
        >
          <IconPlus size={16} />
        </button>
      </div>

      <div className="broadcast-scene-list custom-scrollbar">
        {scenes.map((scene, index) => (
          <button
            key={scene.id}
            onClick={() => onSelectScene(scene.id)}
            onDoubleClick={() => { setEditingSceneId(scene.id); setEditingSceneName(scene.name) }}
            onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, scene.id) }}
            className={`broadcast-scene-row ${activeSceneId === scene.id ? 'is-active' : ''}`}
          >
            <SceneThumbnail scene={scene} activeOrientation={activeOrientation} />
            <span className="broadcast-scene-copy">
              <span className="broadcast-scene-index">{String(index + 1).padStart(2, '0')}</span>
              {editingSceneId === scene.id ? (
                <input
                  value={editingSceneName}
                  onChange={e => setEditingSceneName(e.target.value)}
                  onBlur={() => { onRenameScene(scene.id, editingSceneName); setEditingSceneId(null) }}
                  onKeyDown={e => { if (e.key === 'Enter') { onRenameScene(scene.id, editingSceneName); setEditingSceneId(null) }; if (e.key === 'Escape') setEditingSceneId(null) }}
                  className="broadcast-scene-input"
                  autoFocus
                />
              ) : (
                <span className="broadcast-scene-name">{scene.name}</span>
              )}
            </span>
            <span className="broadcast-scene-meta">{scene.layers.length}</span>
          </button>
        ))}
      </div>

      <div className="broadcast-dock-actions">
        <button
          type="button"
          title="Add scene"
          onClick={() => onAddScene(`Scene ${scenes.length + 1}`)}
          className="broadcast-icon-button"
        >
          <IconPlus size={15} />
        </button>
        <button
          type="button"
          title="Duplicate scene"
          disabled={!activeScene}
          onClick={() => activeScene && onDuplicateScene(activeScene.id)}
          className="broadcast-icon-button"
        >
          <IconCopy size={15} />
        </button>
        <button
          type="button"
          title="Remove scene"
          disabled={!activeScene || scenes.length <= 1}
          onClick={() => activeScene && onRemoveScene(activeScene.id)}
          className="broadcast-icon-button is-danger"
        >
          <IconTrash size={15} />
        </button>
      </div>
    </div>
  )
}
