import { IconAdjustments } from '@tabler/icons-react'
import { useState } from 'react'
import type { AssetFile } from '../../../hooks/useAssets'
import { Modal } from '../../../components/ui/Modal'

interface ImagePreviewModalProps {
  image: AssetFile
  onClose: () => void
  onAdjust?: () => void
}

export function ImagePreviewModal({ image, onClose, onAdjust }: ImagePreviewModalProps) {
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null)

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={image.name}
      className="max-w-4xl"
      headerActions={
        onAdjust && (
          <button
            onClick={onAdjust}
            className="flex items-center gap-2 h-9 px-4 rounded-xl bg-accent/10 border border-accent/20 hover:bg-accent/20 text-accent text-xs font-black uppercase tracking-widest transition-all cursor-pointer"
            title="Adjust positioning"
          >
            <IconAdjustments size={16} />
            Adjust
          </button>
        )
      }
    >
      <div className="p-8 space-y-4">
        {naturalSize && (
          <div className="flex justify-center">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20 bg-white/5 px-3 py-1 rounded-full border border-white/5">
              {naturalSize.w} × {naturalSize.h} PX
            </span>
          </div>
        )}
        
        <div className="rounded-2xl border border-white/10 bg-[#050505] overflow-hidden flex items-center justify-center min-h-[300px] shadow-inner relative group">
          <img
            src={`asset:///app/${encodeURIComponent(image.id)}`}
            alt={image.name}
            onLoad={(e) => {
              const img = e.currentTarget
              setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
            }}
            className="max-w-full max-h-[60vh] object-contain relative z-10 p-4"
            style={{
              backgroundImage:
                'linear-gradient(45deg, rgba(255,255,255,0.02) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.02) 75%), linear-gradient(45deg, rgba(255,255,255,0.02) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.02) 75%)',
              backgroundSize: '20px 20px',
              backgroundPosition: '0 0, 10px 10px'
            }}
          />
          <div className="absolute inset-0 bg-accent/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        </div>
      </div>
    </Modal>
  )
}
