import { IconPhoto } from '@tabler/icons-react'
import { IconPencil, IconTrash } from '../../../components/ui/icons'
import { useState } from 'react'
import { AssetFile } from '../../../hooks/useAssets'

interface ImageTileProps {
  image: AssetFile
  onPreview: () => void
  onDelete: () => void
  onEdit: () => void
}

/**
 * Console-library style image tile: cover-fit thumbnail filling the visual
 * area, name strip below, edit / delete actions on hover. Click the tile
 * body to open the preview modal.
 */
export function ImageTile({ image, onPreview, onDelete, onEdit }: ImageTileProps) {
  const [imageBroken, setImageBroken] = useState(false)
  const ext = (image.name.split('.').pop() || '').toUpperCase()
  const baseName = image.name.split('.').slice(0, -1).join('.') || image.name

  return (
    <div className="group relative rounded-xl border border-white/[0.06] bg-white/[0.015] hover:border-white/[0.18] hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)] hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
      {/* Visual area — click to preview */}
      <button
        type="button"
        onClick={onPreview}
        className="block w-full aspect-[4/3] relative cursor-zoom-in focus:outline-none bg-gradient-to-br from-white/[0.04] to-white/[0.01]"
        title={`Preview ${image.name}`}
      >
        {imageBroken ? (
          <div className="absolute inset-0 flex items-center justify-center text-white/30">
            <IconPhoto size={48} />
          </div>
        ) : (
          <img
            src={`asset:///app/${encodeURIComponent(image.id)}`}
            alt={image.name}
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setImageBroken(true)}
          />
        )}

        {/* Subtle gradient overlay so name strip reads better on bright images */}
        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />

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
          onClick={(e) => { e.stopPropagation(); onEdit() }}
          className="w-7 h-7 rounded-md bg-black/60 backdrop-blur-sm border border-white/10 text-white/70 hover:text-white hover:bg-black/80 transition-colors flex items-center justify-center"
          title="Edit properties"
        >
          <IconPencil size={13} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="w-7 h-7 rounded-md bg-black/60 backdrop-blur-sm border border-white/10 text-white/70 hover:text-danger hover:border-danger/40 hover:bg-black/80 transition-colors flex items-center justify-center"
          title="Delete image"
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
