import {IconPhoto as ImageIcon, IconPlus, IconUpload} from '@tabler/icons-react'
import { useState } from 'react'
import { AssetFile } from '../../hooks/useAssets'
import { ImageRow } from './components/ImageRow'
import { ImagePreviewModal } from './components/ImagePreviewModal'
import { ImageAdjustmentModal } from './components/ImageAdjustmentModal'

interface ImageLibraryProps {
  images: AssetFile[]
  onUpload: () => void
  onDelete: (image: AssetFile) => void
}

type ModalMode = 'preview' | 'adjust' | null

export function ImageLibrary({ images, onUpload, onDelete }: ImageLibraryProps) {
  const [activeImage, setActiveImage] = useState<AssetFile | null>(null)
  const [modalMode, setModalMode] = useState<ModalMode>(null)

  const closeModal = () => {
    setModalMode(null)
    setActiveImage(null)
  }

  return (
    <>
      <div className="flex flex-col min-h-[200px]">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center text-accent">
              <ImageIcon size={32} />
            </div>
            <div>
              <h2 className="text-sm font-black tracking-tight leading-none uppercase">Visual Assets</h2>
              <p className="text-[10px] opacity-40 font-black mt-2 uppercase tracking-widest">{images.length} Objects Loaded</p>
            </div>
          </div>
          <button
            onClick={onUpload}
            className="app-button !h-10 !px-6 !text-[10px] font-black tracking-widest"
          >
            <IconPlus size={14} />
            ADD VISUAL
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
          {images.length > 0 ? (
            <div className="flex flex-col gap-3">
              {images.map((image) => (
                <ImageRow
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
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center text-white/10 border border-dashed border-white/5 rounded-3xl">
              <IconUpload size={32} className="mb-4 opacity-10" />
              <p className="text-[10px] font-black uppercase tracking-widest">Library Empty</p>
            </div>
          )}
        </div>
      </div>

      {modalMode === 'preview' && activeImage && (
        <ImagePreviewModal
          image={activeImage}
          onClose={closeModal}
          onAdjust={() => setModalMode('adjust')}
        />
      )}

      {modalMode === 'adjust' && activeImage && (
        <ImageAdjustmentModal
          isOpen={true}
          image={activeImage}
          onClose={closeModal}
        />
      )}
    </>
  )
}
