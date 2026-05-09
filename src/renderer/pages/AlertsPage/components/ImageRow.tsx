import { Edit2, Trash2 } from 'lucide-react'
import { AssetFile } from '../../../hooks/useAssets'

interface ImageRowProps {
  image: AssetFile
  onPreview: () => void
  onDelete: () => void
  onEdit: () => void
}

export function ImageRow({ image, onPreview, onDelete, onEdit }: ImageRowProps) {
  return (
    <div className="flex items-center justify-between p-4 rounded-3xl bg-white/[0.015] border border-white/5 hover:border-white/10 hover:bg-white/[0.02] transition-all group animate-in fade-in slide-in-from-bottom-1 duration-500">
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <button
          type="button"
          onClick={onPreview}
          className="w-12 h-12 rounded-2xl bg-white/[0.03] flex items-center justify-center shrink-0 border border-white/5 relative overflow-hidden transition-all cursor-zoom-in"
          title={`Preview ${image.name}`}
        >
          <img
            src={`asset:///app/${encodeURIComponent(image.id)}`}
            className="w-full h-full object-cover"
            alt={image.name}
            onError={(e) => {
              ;(e.currentTarget as HTMLImageElement).style.display = 'none'
            }}
          />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black text-white truncate transition-colors">
            {image.name.split('.')[0]}
          </p>
          <p className="text-[9px] font-black tracking-widest text-white/10 uppercase mt-1">Visual Ingest</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onEdit}
          className="app-button !h-10 !w-10 !p-0 !bg-white/[0.03] !text-white/40 hover:!text-white"
          title="Edit Properties"
        >
          <Edit2 size={14} />
        </button>
        <button
          onClick={onDelete}
          className="app-button !h-10 !w-10 !p-0 !bg-white/[0.03] !text-white/40 hover:!text-danger"
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}
