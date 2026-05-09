import { Clock, Search, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  EMOJI_CATEGORIES,
  clearRecentEmojis,
  getRecentEmojis,
  rememberEmoji,
  searchEmojis
} from '../../lib/emojis'

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

  // Load recents whenever the modal opens (or after clear/select).
  useEffect(() => {
    if (isOpen) {
      setRecents(getRecentEmojis())
      setSearchQuery('')
    }
  }, [isOpen])

  // Esc-to-close at the modal level.
  useEffect(() => {
    if (!isOpen) return
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [isOpen, onClose])

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
    // In edit mode, an empty value is valid (it clears the emoji).
    if (!emojiInput && mode !== 'edit') return
    if (emojiInput) rememberEmoji(emojiInput)
    onConfirm(emojiInput)
  }

  const clearEmoji = () => {
    setEmojiInput('')
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close emoji picker"
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm cursor-default"
      />

      <div className="relative w-full max-w-md studio-card !bg-[#050505] !p-10 animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center gap-6 mb-10">
          <div className="w-20 h-20 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-center text-4xl">
            {headerEmoji}
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-white tracking-tight mb-2">
              {mode === 'edit' ? 'Edit Asset Properties' : 'Configure New Asset'}
            </h2>
            <p className="text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">Properties & Metadata</p>
          </div>
        </div>

        <div className="space-y-8">
          {/* Asset Name */}
          <div className="space-y-4">
            <label className="text-[10px] font-bold uppercase tracking-widest text-white/20 px-1">Display Name</label>
            <input
              type="text"
              value={assetName}
              onChange={(e) => setAssetName(e.target.value)}
              placeholder="Enter asset name..."
              className="w-full bg-black/40 border border-white/5 rounded-xl px-5 h-14 text-sm text-white focus:border-accent/40 transition-all outline-none font-bold"
            />
          </div>

          {/* Emoji Selection (Optional) */}
          {activeCategory !== '__rename_only__' && (
            <div className="space-y-6">
              <label className="text-[10px] font-bold uppercase tracking-widest text-white/20 px-1">Associated Icon</label>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/10" size={16} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search emojis..."
                  className="w-full bg-black/40 border border-white/5 rounded-xl pl-12 pr-12 h-14 text-sm text-white focus:border-accent/40 transition-all outline-none"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 transition-all"
                    title="Clear search"
                    type="button"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Category strip — only when not searching and not in rename-only mode */}
          {!isSearching && activeCategory !== '__rename_only__' && (
            <div className="grid grid-cols-9 gap-1.5">
              <button
                onClick={() => setActiveCategory(RECENTS_KEY)}
                title="Recently used"
                type="button"
                className={`h-9 rounded-lg flex items-center justify-center transition-all ${
                  activeCategory === RECENTS_KEY
                    ? 'bg-accent text-black shadow-sm'
                    : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Clock size={14} />
              </button>
              {EMOJI_CATEGORIES.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setActiveCategory(category.id)}
                  title={category.label}
                  type="button"
                  className={`h-9 rounded-lg flex items-center justify-center text-base transition-all ${
                    activeCategory === category.id
                      ? 'bg-accent text-black shadow-sm'
                      : 'bg-white/5 text-white/80 hover:bg-white/10'
                  }`}
                >
                  {category.icon}
                </button>
              ))}
            </div>
          )}

          {/* Result meta row */}
          {activeCategory !== '__rename_only__' && (
            <div className="flex items-center justify-between px-1 text-[10px] font-bold uppercase tracking-widest text-white/30">
              <span>
                {isSearching
                  ? `${visibleEmojis.length} match${visibleEmojis.length === 1 ? '' : 'es'}`
                  : activeCategory === RECENTS_KEY
                    ? `${visibleEmojis.length} recent`
                    : activeCategoryDef?.label}
              </span>
              {!isSearching && activeCategory === RECENTS_KEY && recents.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    clearRecentEmojis()
                    setRecents([])
                  }}
                  className="text-white/30 hover:text-white/60 transition-colors normal-case tracking-normal"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {/* Emoji grid */}
          {activeCategory !== '__rename_only__' && (
            <div
              key={activeCategory + searchQuery}
              className="emoji-picker-grid grid grid-cols-7 gap-2 h-[220px] overflow-y-auto overflow-x-hidden p-3 bg-black/40 rounded-xl border border-white/5"
            >
              {visibleEmojis.map((emoji, idx) => (
                <button
                  key={`${emoji}-${idx}`}
                  type="button"
                  onClick={() => pickEmoji(emoji)}
                  onDoubleClick={() => {
                    pickEmoji(emoji)
                    rememberEmoji(emoji)
                    onConfirm(emoji)
                  }}
                  className={`text-2xl p-2 rounded-lg hover:bg-white/10 hover:scale-110 transition-transform ${
                    emojiInput === emoji
                      ? 'bg-accent/20 border border-accent/40'
                      : 'border border-transparent'
                  }`}
                  title={emoji}
                >
                  {emoji}
                </button>
              ))}

              {visibleEmojis.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center h-full text-white/30 space-y-2 py-8">
                  {isSearching ? (
                    <>
                      <Search size={28} />
                      <p className="text-xs font-semibold">No matches for "{searchQuery}"</p>
                      <p className="text-[10px] text-white/20">
                        Try a shorter word, an alias ("hype", "lol", "sad"), or paste an emoji directly.
                      </p>
                    </>
                  ) : (
                    <>
                      <Sparkles size={28} />
                      <p className="text-xs font-semibold">No recents yet</p>
                      <p className="text-[10px] text-white/20">
                        Pick an emoji and it'll show up here next time.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="app-button flex-1 opacity-70 hover:opacity-100"
            >
              Cancel
            </button>
            {mode === 'edit' && emojiInput && (
              <button
                type="button"
                onClick={clearEmoji}
                className="app-button px-4 text-white/60 hover:text-white"
                title="Remove emoji"
              >
                Remove
              </button>
            )}
            <button
              type="button"
              onClick={confirmAndClose}
              disabled={!emojiInput && mode !== 'edit'}
              className="app-button-primary flex-1 disabled:opacity-30 disabled:pointer-events-none"
            >
              {mode === 'edit' ? (emojiInput ? 'Save Emoji' : 'Clear Emoji') : 'Add Sound'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
