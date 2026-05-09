import React, { useState, useEffect } from 'react'
import { Music2, Play, Copy, ExternalLink, Zap, Trash2, Plus, Volume2, Settings, Check, Edit3, X } from 'lucide-react'
import { useSoundboard, SoundFile } from '../../hooks/useSoundboard'
import { useDeckActions, DeckAction } from '../../hooks/useDeckActions'
import { EmojiPickerModal } from '../../components/ui/EmojiPickerModal'
import { motion, AnimatePresence } from 'framer-motion'

export default function SoundboardPage() {
  const { sounds, playSound, uploadSound, deleteSound, refreshSounds } = useSoundboard('board')
  const { actions, saveAction, deleteAction } = useDeckActions()
  const [activeTab, setActiveTab] = useState<'sounds' | 'actions'>('sounds')
  const [isEditMode, setIsEditMode] = useState(false)
  const [pendingUploadPath, setPendingUploadPath] = useState<string | null>(null)
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<{ id: string, name: string, emoji: string, type: 'sound' | 'action' } | null>(null)
  const [assetName, setAssetName] = useState('')
  const [emojiInput, setEmojiInput] = useState('')
  const [activeCategory, setActiveCategory] = useState('smileys-emotion')

  const handleAction = (id: string) => {
    if (isEditMode) return
    if (window.api?.overlay?.sendDeckAction) {
      window.api.overlay.sendDeckAction({ type: id })
    }
  }

  const copyTriggerUrl = (soundId: string) => {
    const port = 8899
    const url = `http://localhost:${port}/overlay/deck/action`
    const body = JSON.stringify({ type: 'PLAY_SOUND', payload: { soundId } })
    const command = `curl -X POST "${url}" -H "Content-Type: application/json" -d '${body}'`
    navigator.clipboard.writeText(command)
  }

  const startEditing = (item: any, type: 'sound' | 'action') => {
    setEditingItem({
      id: item.id,
      name: type === 'sound' ? item.name.split('.')[0] : item.name,
      emoji: (type === 'sound' ? item.emoji : item.icon) || '🔊',
      type
    })
    setAssetName(type === 'sound' ? item.name.split('.')[0] : item.name)
    setEmojiInput((type === 'sound' ? item.emoji : item.icon) || '🔊')
    setIsModalOpen(true)
  }

  const handleModalConfirm = async (emoji: string) => {
    if (!editingItem) return

    console.log(`[Soundboard] handleModalConfirm - emoji: ${emoji}, editingItem:`, editingItem)

    try {
      if (editingItem.type === 'sound') {
        if (editingItem.id === 'new' && pendingUploadPath) {
          console.log(`[Soundboard] Uploading new sound from ${pendingUploadPath} with emoji ${emoji}`)
          await uploadSound(pendingUploadPath, emoji)
          setPendingUploadPath(null)
        } else {
          // Rename sound file and set emoji
          console.log(`[Soundboard] Renaming sound ${editingItem.id} to ${assetName} and setting emoji ${emoji}`)
          const result = await window.api.sound.rename(editingItem.id, assetName)
          await window.api.sound.setEmoji(result.id, emoji)
          await refreshSounds()
        }
      } else {
        // Update or Create action
        console.log(`[Soundboard] Saving deck action ${editingItem.id} with emoji ${emoji}`)
        const existingAction = actions.find(a => a.id === editingItem.id)
        await saveAction({
          id: editingItem.id === 'new' ? `action_${Date.now()}` : editingItem.id,
          name: assetName,
          icon: emoji,
          type: existingAction?.type || 'RELOAD',
          color: existingAction?.color,
          sort_order: existingAction?.sort_order ?? actions.length
        })
      }
    } catch (err) {
      console.error('[Soundboard] Failed to save changes:', err)
    } finally {
      setIsModalOpen(false)
      setEditingItem(null)
    }
  }

  const handleUploadClick = async () => {
    if (!window.api?.sound?.pickFile) return
    const path = await window.api.sound.pickFile()
    if (path) {
      setPendingUploadPath(path)
      const fileName = path.split(/[\\/]/).pop()?.split('.')[0] || 'New Sound'
      setAssetName(fileName)
      setEditingItem({ id: 'new', type: 'sound', name: fileName, emoji: '🔊' })
      setEmojiInput('🔊')
      setIsModalOpen(true)
    }
  }

  const addNewAction = () => {
    const newId = `action_${Date.now()}`
    setEditingItem({
      id: newId,
      name: 'New Action',
      emoji: '⚡',
      type: 'action'
    })
    setAssetName('New Action')
    setEmojiInput('⚡')
    setIsModalOpen(true)
  }

  return (
    <div className="app-page">
      <header className="app-page-header">
        <div className="flex items-center gap-6">
          <div className="flex items-center justify-center">
            <Music2 size={32} className="text-accent" />
          </div>
          <div>
            <div className="app-header-eyebrow">
              <Music2 size={14} className="text-accent" />
              <span>Studio Control</span>
            </div>
            <h1>Audio Deck</h1>
            <p className="app-page-intro">
              Manage and trigger instant audio effects and system actions. 
              Customize your layout for physical stream deck integration.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex p-1 bg-white/[0.03] border border-white/5 rounded-2xl">
            <button
              onClick={() => setActiveTab('sounds')}
              className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                activeTab === 'sounds' ? 'bg-white/10 text-white shadow-xl' : 'text-white/30 hover:text-white/60'
              }`}
            >
              Sounds
            </button>
            <button
              onClick={() => setActiveTab('actions')}
              className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                activeTab === 'actions' ? 'bg-white/10 text-white shadow-xl' : 'text-white/30 hover:text-white/60'
              }`}
            >
              Actions
            </button>
          </div>

          <button
            onClick={() => setIsEditMode(!isEditMode)}
            className={`app-button !h-12 !px-6 !text-[10px] font-black tracking-widest transition-all ${
              isEditMode ? 'bg-accent/20 text-accent border-accent/40' : ''
            }`}
          >
            {isEditMode ? <Check size={14} /> : <Settings size={14} />}
            {isEditMode ? 'SAVE DECK' : 'CONFIGURE DECK'}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-8 mt-12">
        {/* Main Grid Area */}
        <div className="col-span-8">
          <div className="app-section-card glass min-h-[400px] relative overflow-hidden">
            {isEditMode && (
              <div className="absolute inset-x-0 top-0 h-1 bg-accent/30 animate-pulse z-10" />
            )}
            
            <div className="app-section-head">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center text-accent">
                  <Music2 size={32} />
                </div>
                <div>
                  <h2>{activeTab === 'sounds' ? 'Audio Library' : 'System Actions'}</h2>
                  <p>{isEditMode ? 'Customizing deck layout' : 'Click to trigger instant effects'}</p>
                </div>
              </div>
              {activeTab === 'sounds' && !isEditMode && (
                <button
                  onClick={handleUploadClick}
                  className="app-button !h-10 !px-5 !text-[10px] font-black tracking-widest"
                >
                  <Plus size={14} />
                  UPLOAD NEW
                </button>
              )}
              {activeTab === 'actions' && isEditMode && (
                <button
                  onClick={addNewAction}
                  className="app-button !h-10 !px-5 !text-[10px] font-black tracking-widest"
                >
                  <Plus size={14} />
                  ADD ACTION
                </button>
              )}
            </div>

            <div className="app-section-content">
              <div className="grid grid-cols-5 gap-6">
                {activeTab === 'sounds' ? (
                  sounds.map((sound) => (
                    <DeckButton
                      key={sound.id}
                      label={sound.name.split('.')[0]}
                      icon={sound.emoji || '🔊'}
                      isEditMode={isEditMode}
                      onClick={() => playSound(sound.id)}
                      onCopy={() => copyTriggerUrl(sound.id)}
                      onDelete={() => deleteSound(sound.id)}
                      onEdit={() => startEditing(sound, 'sound')}
                    />
                  ))
                ) : (
                  actions.map((action) => (
                    <DeckButton
                      key={action.id}
                      label={action.name}
                      icon={action.icon}
                      color={action.color}
                      isEditMode={isEditMode}
                      onClick={() => handleAction(action.id)}
                      onDelete={() => deleteAction(action.id)}
                      onEdit={() => startEditing(action, 'action')}
                    />
                  ))
                )}
                
                {/* Empty state fillers for that stream deck look */}
                {Array.from({ length: Math.max(0, 15 - (activeTab === 'sounds' ? sounds.length : actions.length)) }).map((_, i) => (
                  <div key={`empty-${i}`} className="aspect-square rounded-3xl bg-white/[0.01] border border-white/[0.02] border-dashed" />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Info & External Control */}
        <div className="col-span-4 flex flex-col gap-8">
          <div className="app-section-card glass !bg-accent/5 !border-accent/10">
            <div className="app-section-head">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center text-accent">
                  <Zap size={32} />
                </div>
                <div>
                  <h2>Stream Deck</h2>
                  <p>External control.</p>
                </div>
              </div>
            </div>
            
            <div className="app-section-content">
              <p className="text-xs text-white/40 leading-relaxed font-medium">
              Every button in your soundboard can be triggered externally via HTTP requests. 
              Use the <span className="text-white/80">Copy Trigger</span> button on any tile to get a 
              ready-to-use curl command for your Elgato or Touch Portal.
            </p>
            <div className="mt-8 p-4 rounded-2xl bg-black/40 border border-white/5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Local API URL</span>
                <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-[8px] font-black uppercase">Active</span>
              </div>
              <code className="text-[10px] text-accent font-mono block truncate">http://localhost:8899/overlay/deck/action</code>
            </div>
          </div>
        </div>

          <div className="app-section-card glass">
            <div className="app-section-head">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center text-accent">
                  <ExternalLink size={32} />
                </div>
                <div>
                  <h2>Deck Overlay</h2>
                  <p>Remote browser deck.</p>
                </div>
              </div>
            </div>
            
            <div className="app-section-content">
              <p className="text-xs text-white/40 leading-relaxed font-medium mb-6">
              Access your soundboard from any browser or tablet by opening the deck overlay. 
              Perfect for secondary monitors.
            </p>
            <button 
              onClick={() => window.open('http://localhost:8899/overlay/deck', '_blank', 'noopener,noreferrer')}
              className="app-button !w-full !h-12 !text-[10px] font-black tracking-widest"
            >
              OPEN STUDIO DECK
            </button>
          </div>
        </div>
      </div>
      </div>

      <EmojiPickerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleModalConfirm}
        emojiInput={emojiInput}
        setEmojiInput={setEmojiInput}
        assetName={assetName}
        setAssetName={setAssetName}
        activeCategory={activeCategory}
        setActiveCategory={setActiveCategory}
        mode="edit"
      />
    </div>
  )
}

function DeckButton({ 
  label, 
  icon, 
  onClick, 
  onCopy,
  onDelete,
  onEdit,
  isEditMode,
  color = "bg-white/[0.03] text-white" 
}: { 
  label: string; 
  icon: string; 
  onClick: () => void; 
  onCopy?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  isEditMode?: boolean;
  color?: string;
}) {
  return (
    <motion.button
      whileHover={{ scale: isEditMode ? 1 : 1.05, y: isEditMode ? 0 : -2 }}
      whileTap={{ scale: 0.95 }}
      onClick={isEditMode ? onEdit : onClick}
      className={`relative aspect-square rounded-3xl border border-white/5 hover:border-white/20 transition-all group overflow-hidden ${color.split(' ')[0]}`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="flex flex-col items-center justify-center h-full p-4 gap-2">
        <span className="text-4xl">{icon}</span>
        <span className={`text-[9px] font-black uppercase tracking-tighter text-center truncate w-full ${color.split(' ')[1] || 'text-white/40'}`}>
          {label}
        </span>
      </div>
      
      {/* Edit Mode Overlay */}
      <AnimatePresence>
        {isEditMode && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3 z-20"
          >
            <div className="flex gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit?.()
                }}
                className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all"
              >
                <Edit3 size={16} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete?.()
                }}
                className="w-10 h-10 rounded-xl bg-red-500/20 hover:bg-red-500/40 flex items-center justify-center text-red-400 transition-all"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {!isEditMode && onCopy && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onCopy()
          }}
          className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/40 border border-white/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-accent/20 hover:border-accent/30"
        >
          <Copy size={12} className="text-white/60" />
        </button>
      )}
    </motion.button>
  )
}
