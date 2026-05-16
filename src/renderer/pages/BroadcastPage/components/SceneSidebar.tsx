import {IconPlus} from '@tabler/icons-react'
import type { StudioScene } from '../../../../shared/studio'

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
  onContextMenu: (e: React.MouseEvent, sceneId: string) => void
}

export function SceneSidebar(props: SceneSidebarProps) {
  const { scenes, activeSceneId, onSelectScene, onAddScene, onRenameScene, editingSceneId, setEditingSceneId, editingSceneName, setEditingSceneName, onContextMenu } = props

  return (
    <div className="w-64 shrink-0 border-r border-white/[0.04] flex flex-col bg-[#050505] animate-in slide-in-from-left duration-300">
      <div className="px-5 py-5 flex items-center justify-between border-b border-white/[0.02] bg-white/[0.01]">
        <h3 className="kicker !opacity-100">Scenes</h3>
        <button onClick={() => onAddScene(`Scene ${scenes.length + 1}`)} className="text-accent hover:text-white transition-colors">
          <IconPlus size={20} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
        {scenes.map(scene => (
          <button
            key={scene.id}
            onClick={() => onSelectScene(scene.id)}
            onDoubleClick={() => { setEditingSceneId(scene.id); setEditingSceneName(scene.name) }}
            onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, scene.id) }}
            className={`w-full text-left px-4 py-4 rounded-xl text-[13px] font-black transition-all ${activeSceneId === scene.id ? 'bg-brand-gradient text-white shadow-xl shadow-glow translate-x-1' : 'text-white/20 hover:text-white/40 hover:bg-white/5'}`}
          >
            {editingSceneId === scene.id ? (
              <input
                value={editingSceneName}
                onChange={e => setEditingSceneName(e.target.value)}
                onBlur={() => { onRenameScene(scene.id, editingSceneName); setEditingSceneId(null) }}
                onKeyDown={e => { if (e.key === 'Enter') { onRenameScene(scene.id, editingSceneName); setEditingSceneId(null) }; if (e.key === 'Escape') setEditingSceneId(null) }}
                className="w-full bg-transparent text-[13px] font-black text-white outline-none border-b border-accent/50"
                autoFocus
              />
            ) : scene.name}
          </button>
        ))}
      </div>
    </div>
  )
}
