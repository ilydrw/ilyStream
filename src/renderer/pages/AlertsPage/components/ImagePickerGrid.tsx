import { IconPhoto, IconPhotoOff, IconCheck } from '@tabler/icons-react'
import { IconPlus } from '../../../components/ui/icons'
import { useState } from 'react'
import { AssetFile } from '../../../hooks/useAssets'

interface ImagePickerGridProps {
  images: AssetFile[]
  selectedId: string
  onSelect: (id: string) => void
  onAdd?: () => void
}

/**
 * Compact picker grid for the editor's Image section. Same density and
 * interaction model as `SoundPickerGrid` — tiles ~88px square, 6–8 per row,
 * click to select, checkmark on the selected one.
 *
 * The "None" tile clears the asset selection. When `useEventImage` is on
 * (controlled by a separate toggle in the editor) the alert will fall back
 * to the event's own image (user avatar or gift icon) if nothing is picked
 * here — the picker is just the override.
 */
export function ImagePickerGrid({ images, selectedId, onSelect, onAdd }: ImagePickerGridProps) {
  const sortedImages = [...images].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3 max-h-[300px] overflow-y-auto">
      <div className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
        <NoneTile selected={!selectedId} onClick={() => onSelect('')} />
        {sortedImages.map((image) => (
          <ImageChip
            key={image.id}
            image={image}
            selected={image.id === selectedId}
            onSelect={() => onSelect(image.id)}
          />
        ))}
        {onAdd && <AddTile label="Add image" onClick={onAdd} />}
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
      title="No image"
    >
      <IconPhotoOff size={20} />
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

function ImageChip({
  image,
  selected,
  onSelect
}: {
  image: AssetFile
  selected: boolean
  onSelect: () => void
}) {
  const [broken, setBroken] = useState(false)
  const baseName = image.name.split('.').slice(0, -1).join('.') || image.name

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
      className={`group relative aspect-square rounded-md border cursor-pointer transition-all overflow-hidden ${
        selected
          ? 'border-accent ring-1 ring-accent/40 shadow-[0_0_16px_-6px_rgba(25,200,255,0.6)]'
          : 'border-white/[0.06] hover:border-white/20'
      }`}
      title={baseName}
    >
      {broken ? (
        <div className="absolute inset-0 flex items-center justify-center bg-white/[0.02] text-white/30">
          <IconPhoto size={22} />
        </div>
      ) : (
        <img
          src={`asset:///app/${encodeURIComponent(image.id)}`}
          alt={image.name}
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setBroken(true)}
        />
      )}

      {/* Selected check badge */}
      {selected && (
        <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-accent text-black flex items-center justify-center shadow-[0_0_6px_rgba(25,200,255,0.8)]">
          <IconCheck size={11} stroke={3} />
        </span>
      )}

      {/* Name label at bottom on hover */}
      <div className="absolute inset-x-0 bottom-0 px-1 py-0.5 bg-gradient-to-t from-black/85 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <p className="text-[10px] font-medium text-white/90 truncate text-center" title={baseName}>
          {baseName}
        </p>
      </div>
    </div>
  )
}
