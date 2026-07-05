import { IconMusic, IconMoodSmile } from '@tabler/icons-react'
import { IconPlayerPlay, IconTrash } from '../../../components/ui/icons'
import { useEffect, useRef, useState } from 'react'
import { SoundFile } from '../../../hooks/useSoundboard'

interface SoundTileProps {
  sound: SoundFile
  onPlay: () => Promise<void> | void
  onDelete: () => void
  onEditEmoji: () => void
}

/**
 * Console-library style tile: big emoji / icon on a tinted gradient panel,
 * name + format below. Hover reveals the action buttons. Click anywhere on
 * the tile body to preview the sound.
 */
export function SoundTile({ sound, onPlay, onDelete, onEditEmoji }: SoundTileProps) {
  const [isPreviewing, setIsPreviewing] = useState(false)
  const previewTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current)
    }
  }, [])

  const handlePlay = async () => {
    try {
      await onPlay()
      setIsPreviewing(true)
      if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current)
      previewTimerRef.current = window.setTimeout(() => setIsPreviewing(false), 900)
    } catch (error) {
      console.error('Failed to preview sound:', error)
    }
  }

  const ext = (sound.name.split('.').pop() || '').toUpperCase()
  const baseName = sound.name.split('.').slice(0, -1).join('.') || sound.name

  return (
    <div
      className={`group relative rounded-xl border bg-white/[0.015] transition-all duration-200 overflow-hidden ${
        isPreviewing
          ? 'border-accent/60 shadow-[0_0_24px_-6px_rgba(25,200,255,0.5)]'
          : 'border-white/[0.06] hover:border-white/[0.18] hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)] hover:-translate-y-0.5'
      }`}
    >
      {/* Visual area — click to play */}
      <button
        type="button"
        onClick={handlePlay}
        className="block w-full aspect-square relative cursor-pointer focus:outline-none"
        title={`Preview ${baseName}`}
      >
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            background: isPreviewing
              ? 'linear-gradient(135deg, rgba(25,200,255,0.25), rgba(25,200,255,0.06))'
              : 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))'
          }}
        >
          {sound.emoji ? (
            <span
              className={`select-none transition-transform duration-300 ${isPreviewing ? 'scale-125' : 'group-hover:scale-110'}`}
              style={{ fontSize: 64, lineHeight: 1 }}
            >
              {sound.emoji}
            </span>
          ) : (
            <IconMusic
              size={48}
              className={isPreviewing ? 'text-accent animate-pulse' : 'text-white/30 group-hover:text-white/50 transition-colors'}
            />
          )}
        </div>

        {/* Hover play overlay */}
        <div className={`absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity ${
          isPreviewing ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'
        }`}>
          <div className="w-14 h-14 rounded-full bg-accent text-black flex items-center justify-center shadow-lg">
            <IconPlayerPlay size={22} className="fill-current ml-0.5" />
          </div>
        </div>

        {/* Format badge top-left */}
        {ext && (
          <span className="absolute top-2 left-2 px-1.5 h-5 rounded-md bg-black/55 text-white/75 text-[10px] font-bold tracking-wide inline-flex items-center backdrop-blur-sm">
            {ext}
          </span>
        )}
      </button>

      {/* Hover actions top-right */}
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onEditEmoji() }}
          className="w-7 h-7 rounded-md bg-black/60 backdrop-blur-sm border border-white/10 text-white/70 hover:text-white hover:bg-black/80 transition-colors flex items-center justify-center"
          title="Edit emoji & name"
        >
          <IconMoodSmile size={13} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="w-7 h-7 rounded-md bg-black/60 backdrop-blur-sm border border-white/10 text-white/70 hover:text-danger hover:border-danger/40 hover:bg-black/80 transition-colors flex items-center justify-center"
          title="Delete sound"
        >
          <IconTrash size={13} />
        </button>
      </div>

      {/* Name strip */}
      <div className="px-3 py-2.5 border-t border-white/[0.05] bg-black/20">
        <p className="text-[13px] font-medium text-white/85 truncate" title={baseName}>{baseName}</p>
      </div>
    </div>
  )
}
