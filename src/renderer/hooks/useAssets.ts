import { useEffect, useState, useCallback } from 'react'

export interface AssetFile {
  id: string
  name: string
  path: string
  type: 'image' | 'video' | 'audio'
}

export function useAssets() {
  const [images, setImages] = useState<AssetFile[]>([])

  const refreshImages = useCallback(async () => {
    if (!window.api?.assets) return
    const allImages = await window.api.assets.images.getAll()
    setImages(allImages)
  }, [])

  useEffect(() => {
    refreshImages()
  }, [refreshImages])

  const uploadImage = async (path: string) => {
    await window.api.assets.images.upload(path)
    await refreshImages()
  }

  const deleteImage = async (id: string) => {
    await window.api.assets.images.delete(id)
    await refreshImages()
  }

  const pickImage = async () => {
    return await window.api.assets.images.pickFile()
  }

  return {
    images,
    refreshImages,
    uploadImage,
    deleteImage,
    pickImage
  }
}
