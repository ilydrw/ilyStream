import {IconMusic, IconPlus, IconUpload} from '@tabler/icons-react'
import { SoundFile } from '../../hooks/useSoundboard'
import { SoundRow } from './components/SoundRow'

interface SoundLibraryProps {
  sounds: SoundFile[]
  onUpload: () => void
  onPlay: (id: string) => void
  onDelete: (sound: SoundFile) => void
  onEditEmoji: (sound: SoundFile) => void
}

export function SoundLibrary({
  sounds,
  onUpload,
  onPlay,
  onDelete,
  onEditEmoji
}: SoundLibraryProps) {
  const sortedSounds = [...sounds].sort((left, right) => left.name.localeCompare(right.name))

  return (
    <div className="flex flex-col min-h-[200px]">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center text-accent">
            <IconMusic size={32} />
          </div>
          <div>
            <h2 className="text-sm font-black tracking-tight leading-none uppercase">Audio Assets</h2>
            <p className="text-[10px] opacity-40 font-black mt-2 uppercase tracking-widest">{sortedSounds.length} Files Ready</p>
          </div>
        </div>
        <button
          onClick={onUpload}
          className="app-button !h-10 !px-6 !text-[10px] font-black tracking-widest"
        >
          <IconPlus size={14} />
          ADD AUDIO
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
        {sortedSounds.length > 0 ? (
          <div className="flex flex-col gap-3">
            {sortedSounds.map((sound) => (
              <SoundRow
                key={sound.id}
                sound={sound}
                onPlay={() => onPlay(sound.id)}
                onDelete={() => onDelete(sound)}
                onEditEmoji={() => onEditEmoji(sound)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center text-white/10 border border-dashed border-white/5 rounded-3xl">
            <IconUpload size={32} className="mb-4 opacity-10" />
            <p className="text-[10px] font-black uppercase tracking-widest">Library Empty</p>
          </div>
        )}
      </div>
    </div>
  )
}
