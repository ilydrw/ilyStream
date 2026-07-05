import { IconMusicOff } from '@tabler/icons-react'
import { SoundFile } from '../../hooks/useSoundboard'
import { SoundTile } from './components/SoundTile'

interface SoundLibraryProps {
  sounds: SoundFile[]
  onPlay: (id: string) => void
  onDelete: (sound: SoundFile) => void
  onEditEmoji: (sound: SoundFile) => void
}

export function SoundLibrary({ sounds, onPlay, onDelete, onEditEmoji }: SoundLibraryProps) {
  const sortedSounds = [...sounds].sort((left, right) => left.name.localeCompare(right.name))

  if (sortedSounds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-white/10 rounded-xl bg-white/[0.01]">
        <IconMusicOff size={40} className="text-white/20 mb-4" stroke={1.5} />
        <p className="text-[14px] font-semibold text-white/75">No sounds yet</p>
        <p className="text-[12px] text-white/45 mt-1.5 max-w-xs">Use “Add sound” above to import an MP3 or WAV. Each one becomes a tile you can pick from any route.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {sortedSounds.map((sound) => (
        <SoundTile
          key={sound.id}
          sound={sound}
          onPlay={() => onPlay(sound.id)}
          onDelete={() => onDelete(sound)}
          onEditEmoji={() => onEditEmoji(sound)}
        />
      ))}
    </div>
  )
}
