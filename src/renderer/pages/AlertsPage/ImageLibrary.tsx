import { IconPhotoOff } from '@tabler/icons-react'
import { useState } from 'react'
import { AssetFile } from '../../hooks/useAssets'
import { ImageTile } from './components/ImageTile'
import { ImagePreviewModal } from './components/ImagePreviewModal'
import { ImageAdjustmentModal } from './components/ImageAdjustmentModal'

interface ImageLibraryProps {
  images: AssetFile[]
  onDelete: (image: AssetFile) => void
}

type ModalMode = 'preview' | 'adjust' | null

export function ImageLibrary({ images, onDelete }: ImageLibraryProps) {
  const [activeImage, setActiveImage] = useState<AssetFile | null>(null)
  const [modalMode, setModalMode] = useState<ModalMode>(null)

  const closeModal = () => {
    setModalMode(null)
    setActiveImage(null)
  }

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-white/10 rounded-xl bg-white/[0.01]">
        <IconPhotoOff size={40} className="text-white/20 mb-4" stroke={1.5} />
        <p className="text-[14px] font-semibold text-white/75">No images yet</p>
        <p className="text-[12px] text-white/45 mt-1.5 max-w-xs">Use “Add image” above to import a PNG, GIF, or short video. Each one becomes a tile you can pick from any route.</p>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {images.map((image) => (
          <ImageTile
            key={image.id}
            image={image}
            onPreview={() => {
              setActiveImage(image)
              setModalMode('preview')
            }}
            onDelete={() => onDelete(image)}
            onEdit={() => {
              setActiveImage(image)
              setModalMode('adjust')
            }}
          />
        ))}
      </div>

      {modalMode === 'preview' && activeImage && (
        <ImagePreviewModal
          image={activeImage}
          onClose={closeModal}
          onAdjust={() => setModalMode('adjust')}
        />
      )}

      {modalMode === 'adjust' && activeImage && (
        <ImageAdjustmentModal isOpen={true} image={activeImage} onClose={closeModal} />
      )}
    </>
  )
}
