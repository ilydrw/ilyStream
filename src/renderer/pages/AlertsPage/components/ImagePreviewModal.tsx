import { Sliders, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AssetFile } from '../../../hooks/useAssets'

interface ImagePreviewModalProps {
  image: AssetFile
  onClose: () => void
  onAdjust?: () => void
}

/**
 * Simple modal that displays the image at a large, comfortable size.
 * No editing controls — just for viewing.
 */
export function ImagePreviewModal({ image, onClose, onAdjust }: ImagePreviewModalProps) {
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null)

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <button
        type="button"
        aria-label="Close preview"
        onClick={onClose}
        className="absolute inset-0 bg-black/85 cursor-zoom-out"
      />

      <div className="relative max-w-[min(900px,90vw)] max-h-[85vh] flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-base font-bold text-white truncate">{image.name}</p>
            {naturalSize && (
              <p className="text-xs text-white/40 mt-0.5">
                {naturalSize.w} × {naturalSize.h} px
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onAdjust && (
              <button
                onClick={onAdjust}
                className="flex items-center gap-2 h-9 px-3 rounded-lg bg-white/5 border border-white/10 hover:bg-accent/10 hover:border-accent/30 hover:text-accent text-xs font-bold text-white/80 transition-all"
                title="Adjust positioning"
              >
                <Sliders size={13} />
                Adjust
              </button>
            )}
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-white/70 hover:text-white transition-all"
              title="Close (Esc)"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Image */}
        <div className="rounded-xl border border-white/10 bg-[#0a0b0d] overflow-hidden flex items-center justify-center min-h-[200px]">
          <img
            src={`asset:///app/${encodeURIComponent(image.id)}`}
            alt={image.name}
            onLoad={(e) => {
              const img = e.currentTarget
              setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
            }}
            className="max-w-full max-h-[70vh] object-contain"
            style={{
              backgroundImage:
                'linear-gradient(45deg, rgba(255,255,255,0.02) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.02) 75%), linear-gradient(45deg, rgba(255,255,255,0.02) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.02) 75%)',
              backgroundSize: '20px 20px',
              backgroundPosition: '0 0, 10px 10px'
            }}
          />
        </div>
      </div>
    </div>
  )
}
