import { IconClock, IconSearch, IconSparkles } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import {
  EMOJI_CATEGORIES,
  clearRecentEmojis,
  getRecentEmojis,
  rememberEmoji,
  searchEmojis
} from '../../lib/emojis'
import { Modal } from './Modal'

interface EmojiPickerModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (emoji: string) => void
  emojiInput: string
  setEmojiInput: (val: string) => void
  assetName: string
  setAssetName: (val: string) => void
  activeCategory: string
  setActiveCategory: (val: string) => void
  /** "add" for a new upload (default), "edit" when changing an existing sound's emoji. */
  mode?: 'add' | 'edit'
}

const RECENTS_KEY = '__recents__'

export function EmojiPickerModal({
  isOpen,
  onClose,
  onConfirm,
  emojiInput,
  setEmojiInput,
  assetName,
  setAssetName,
  activeCategory,
  setActiveCategory,
  mode = 'add'
}: EmojiPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [recents, setRecents] = useState<string[]>([])

  useEffect(() => {
    if (isOpen) {
      setRecents(getRecentEmojis())
      setSearchQuery('')
    }
  }, [isOpen])

  const isSearching = searchQuery.trim().length > 0

  const visibleEmojis = useMemo(() => {
    if (isSearching) {
      return searchEmojis(searchQuery, undefined, 144)
    }
    if (activeCategory === RECENTS_KEY) {
      return recents
    }
    return searchEmojis('', activeCategory)
  }, [searchQuery, activeCategory, recents, isSearching])

  const activeCategoryDef = EMOJI_CATEGORIES.find((category) => category.id === activeCategory)
  const headerEmoji = emojiInput || activeCategoryDef?.icon || '😀'

  const pickEmoji = (emoji: string) => {
    setEmojiInput(emoji)
  }

  const confirmAndClose = () => {
    if (!emojiInput && mode !== 'edit') return
    if (emojiInput) rememberEmoji(emojiInput)
    onConfirm(emojiInput)
  }

  const clearEmoji = () => {
    setEmojiInput('')
  }

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={mode === 'edit' ? 'Edit Asset Properties' : 'Configure New Asset'}
      className="max-w-md"
    >
      <div className="p-8 space-y-8">
        <div className="flex items-center gap-6 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
          <div className="w-16 h-16 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center text-4xl shadow-inner">
            {headerEmoji}
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] mb-1">Preview</p>
            <p className="text-sm font-bold text-white truncate">{assetName || 'Unnamed Asset'}</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase tracking-widest text-white/20 px-1">Display Name</label>
            <input
              type="text"
              value={assetName}
              onChange={(e) => setAssetName(e.target.value)}
              placeholder="Enter asset name..."
              className="w-full bg-black/40 border border-white/5 rounded-xl px-5 h-14 text-sm text-white focus:border-accent/40 focus:bg-black/60 transition-all outline-none font-bold"
            />
          </div>

          {activeCategory !== '__rename_only__' && (
            <div className="space-y-4">
              <label className="text-[10px] font-black uppercase tracking-widest text-white/20 px-1">Associated Icon</label>
              
              <div className="relative">
                <IconSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-white/10" size={16} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search emojis..."
                  className="w-full bg-black/40 border border-white/5 rounded-xl pl-12 pr-12 h-14 text-sm text-white focus:border-accent/40 focus:bg-black/60 transition-all outline-none"
                />
              </div>

              {!isSearching && (
                <div className="grid grid-cols-9 gap-1.5 p-1 bg-white/[0.02] rounded-xl border border-white/5">
                  <button
                    onClick={() => setActiveCategory(RECENTS_KEY)}
                    type="button"
                    className={`h-9 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                      activeCategory === RECENTS_KEY
                        ? 'bg-accent text-black shadow-lg shadow-accent/20'
                        : 'text-white/40 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <IconClock size={16} />
                  </button>
                  {EMOJI_CATEGORIES.map((category) => (
                    <button
                      key={category.id}
                      onClick={() => setActiveCategory(category.id)}
                      type="button"
                      className={`h-9 rounded-lg flex items-center justify-center text-base transition-all cursor-pointer ${
                        activeCategory === category.id
                          ? 'bg-accent text-black shadow-lg shadow-accent/20'
                          : 'text-white/60 hover:bg-white/5'
                      }`}
                    >
                      {category.icon}
                    </button>
                  ))}
                </div>
              )}

              <div
                key={activeCategory + searchQuery}
                className="grid grid-cols-7 gap-2 h-[220px] overflow-y-auto p-3 bg-black/40 rounded-xl border border-white/5 scrollbar-thin"
              >
                {visibleEmojis.map((emoji, idx) => (
                  <button
                    key={`${emoji}-${idx}`}
                    type="button"
                    onClick={() => pickEmoji(emoji)}
                    className={`text-2xl p-2 rounded-lg hover:bg-accent/10 hover:scale-110 transition-all cursor-pointer flex items-center justify-center ${
                      emojiInput === emoji
                        ? 'bg-accent/20 border border-accent/40 shadow-lg shadow-accent/5'
                        : 'border border-transparent'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}

                {visibleEmojis.length === 0 && (
                  <div className="col-span-full flex flex-col items-center justify-center h-full text-white/20 space-y-2 py-8">
                    <IconSparkles size={32} strokeWidth={1} />
                    <p className="text-xs font-bold uppercase tracking-widest">No emojis found</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-4 border-t border-white/5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-12 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 font-bold text-xs uppercase tracking-widest transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmAndClose}
            disabled={!emojiInput && mode !== 'edit'}
            className="flex-[2] h-12 rounded-xl bg-accent text-black font-black text-xs uppercase tracking-[0.2em] transition-all cursor-pointer disabled:opacity-20 disabled:grayscale shadow-lg shadow-accent/10 hover:shadow-accent/20 hover:scale-[1.02] active:scale-[0.98]"
          >
            {mode === 'edit' ? (emojiInput ? 'Update Asset' : 'Clear Icon') : 'Confirm Setup'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
