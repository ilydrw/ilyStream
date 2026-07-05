import { IconMusic, IconVolumeOff } from '@tabler/icons-react'
import { IconPlayerPlay, IconPlus } from '../../../components/ui/icons'
import { useEffect, useRef, useState } from 'react'
import { SoundFile } from '../../../hooks/useSoundboard'

interface SoundPickerGridProps {
  sounds: SoundFile[]
  selectedId: string
  volume: number
  onSelect: (id: string) => void
  onAdd?: () => void
}

/**
 * Compact picker grid for use inside the editor's Sound section.
 * Replaces the previous `<select>` dropdown. Each tile is a sound; click to
 * select. "None" tile clears the selection. "+ Add" tile uploads a new file.
 * Hover on a real sound surfaces a small play button for previewing.
 *
 * Density target: 6–8 tiles per row on desktop, ~88px square — so a streamer
 * can scan their whole sound library in the editor without scrolling past
 * the editor pane to find it.
 */
export function SoundPickerGrid({ sounds, selectedId, volume, onSelect, onAdd }: SoundPickerGridProps) {
  const sortedSounds = [...sounds].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3 max-h-[300px] overflow-y-auto">
      <div className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
        <NoneTile selected={!selectedId} onClick={() => onSelect('')} />
        {sortedSounds.map((sound) => (
          <SoundChip
            key={sound.id}
            sound={sound}
            selected={sound.id === selectedId}
            volume={volume}
            onSelect={() => onSelect(sound.id)}
          />
        ))}
        {onAdd && <AddTile label="Add sound" onClick={onAdd} />}
      </div>
    </div>
  )
}

function NoneTile({ selected, onClick }: { selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative aspect-square rounded-md border transition-all flex flex-col items-center justify-center gap-1 ${
        selected
          ? 'border-accent/60 bg-accent/10 text-white'
          : 'border-white/[0.06] bg-white/[0.015] text-white/40 hover:border-white/15 hover:text-white/70 hover:bg-white/[0.03]'
      }`}
      title="No sound"
    >
      <IconVolumeOff size={20} />
      <span className="text-[10px] font-semibold tracking-tight">None</span>
    </button>
  )
}

function AddTile({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative aspect-square rounded-md border border-dashed border-white/15 bg-transparent hover:border-accent/50 hover:bg-accent/5 transition-colors flex flex-col items-center justify-center gap-1 text-white/45 hover:text-accent"
      title={label}
    >
      <IconPlus size={20} />
      <span className="text-[10px] font-semibold tracking-tight">{label}</span>
    </button>
  )
}

function SoundChip({
  sound,
  selected,
  volume,
  onSelect
}: {
  sound: SoundFile
  selected: boolean
  volume: number
  onSelect: () => void
}) {
  const [isPreviewing, setIsPreviewing] = useState(false)
  const previewTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => { if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current) }
  }, [])

  const baseName = sound.name.split('.').slice(0, -1).join('.') || sound.name

  const preview = (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      void window.api?.sound?.play?.(sound.id, volume)
      setIsPreviewing(true)
      if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current)
      previewTimerRef.current = window.setTimeout(() => setIsPreviewing(false), 700)
    } catch (err) {
      console.error('Failed to preview sound:', err)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
      className={`group relative aspect-square rounded-md border cursor-pointer transition-all overflow-hidden ${
        selected
          ? 'border-accent ring-1 ring-accent/40 shadow-[0_0_16px_-6px_rgba(25,200,255,0.6)]'
          : 'border-white/[0.06] hover:border-white/20 hover:bg-white/[0.03]'
      } ${isPreviewing ? 'scale-[0.97]' : ''}`}
      title={baseName}
    >
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          background: selected
            ? 'linear-gradient(135deg, rgba(25,200,255,0.18), rgba(25,200,255,0.04))'
            : 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))'
        }}
      >
        {sound.emoji ? (
          <span
            className={`select-none transition-transform duration-200 ${isPreviewing ? 'scale-125' : 'group-hover:scale-110'}`}
            style={{ fontSize: 30, lineHeight: 1 }}
          >
            {sound.emoji}
          </span>
        ) : (
          <IconMusic size={22} className={isPreviewing ? 'text-accent animate-pulse' : 'text-white/40'} />
        )}
      </div>

      {/* Selected checkmark dot */}
      {selected && (
        <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-accent shadow-[0_0_6px_rgba(25,200,255,0.8)]" />
      )}

      {/* Play preview overlay on hover */}
      <button
        type="button"
        onClick={preview}
        className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-black/70 backdrop-blur-sm border border-white/15 text-white/85 opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-black transition-all flex items-center justify-center"
        title="Preview"
      >
        <IconPlayerPlay size={10} className="fill-current ml-0.5" />
      </button>

      {/* Name label at bottom on hover */}
      <div className="absolute inset-x-0 bottom-0 px-1 py-0.5 bg-gradient-to-t from-black/85 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <p className="text-[10px] font-medium text-white/90 truncate text-center" title={baseName}>
          {baseName}
        </p>
      </div>
    </div>
  )
}
