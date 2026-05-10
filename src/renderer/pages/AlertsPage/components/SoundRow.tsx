import {IconMusic, IconPlayerPlay, IconMoodSmile, IconTrash} from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { SoundFile } from '../../../hooks/useSoundboard'

interface SoundRowProps {
  sound: SoundFile
  onPlay: () => Promise<void> | void
  onDelete: () => void
  onEditEmoji: () => void
}

export function SoundRow({ sound, onPlay, onDelete, onEditEmoji }: SoundRowProps) {
  const [isPreviewing, setIsPreviewing] = useState(false)
  const previewTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (previewTimerRef.current) {
        window.clearTimeout(previewTimerRef.current)
      }
    }
  }, [])

  const handlePlay = async () => {
    try {
      await onPlay()
      setIsPreviewing(true)
      if (previewTimerRef.current) {
        window.clearTimeout(previewTimerRef.current)
      }
      previewTimerRef.current = window.setTimeout(() => setIsPreviewing(false), 900)
    } catch (error) {
      console.error('Failed to preview sound:', error)
    }
  }

  return (
    <div className="flex items-center justify-between p-4 rounded-3xl bg-white/[0.015] border border-white/5 hover:border-white/10 hover:bg-white/[0.02] transition-all group animate-in fade-in slide-in-from-bottom-1 duration-500">
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center shrink-0 transition-all">
          {sound.emoji ? (
            <span
              className={`text-2xl select-none transition-transform duration-300 ${
                isPreviewing ? 'scale-110' : ''
              }`}
            >
              {sound.emoji}
            </span>
          ) : (
            <IconMusic
              size={16}
              className={isPreviewing ? 'text-accent animate-pulse' : 'text-white/20'}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black text-white truncate transition-colors">
            {sound.name.split('.')[0]}
          </p>
          <p className="text-[9px] font-black tracking-widest text-white/10 uppercase mt-1">Audio Module</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handlePlay}
          className={`app-button !h-10 !w-10 !p-0 ${
            isPreviewing
              ? '!text-accent !bg-accent/10'
              : '!bg-white/[0.03] !text-white/40 hover:!text-white'
          }`}
          title="Preview sound"
        >
          <IconPlayerPlay size={14} className="fill-current" />
        </button>
        <button
          onClick={onEditEmoji}
          className="app-button !h-10 !w-10 !p-0 !bg-white/[0.03] !text-white/40 hover:!text-white"
          title="Edit properties"
        >
          <IconMoodSmile size={14} />
        </button>
        <button
          onClick={onDelete}
          className="app-button !h-10 !w-10 !p-0 !bg-white/[0.03] !text-white/40 hover:!text-danger"
          title="Delete"
        >
          <IconTrash size={14} />
        </button>
      </div>
    </div>
  )
}
