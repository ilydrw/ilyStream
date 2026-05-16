import { useEffect, useState, useCallback } from 'react'

export interface SoundFile {
  id: string
  name: string
  path: string
  emoji?: string
}

export function useSoundboard(category?: 'alerts' | 'board') {
  const [sounds, setSounds] = useState<SoundFile[]>([])

  const refreshSounds = useCallback(async () => {
    if (!window.api?.sound) return
    const allSounds = await window.api.sound.getAll(category)
    setSounds(allSounds)
  }, [category])

  useEffect(() => {
    refreshSounds()
  }, [refreshSounds])

  const uploadSound = async (path: string, emoji?: string) => {
    try {
      console.log(`[useSoundboard] Uploading sound from: ${path} (category: ${category})`)
      await window.api.sound.upload(path, emoji, category)
      console.log(`[useSoundboard] Upload successful, refreshing...`)
      await refreshSounds()
    } catch (err) {
      console.error('[useSoundboard] Upload failed:', err)
    }
  }

  const deleteSound = async (id: string) => {
    try {
      console.log(`[useSoundboard] Deleting sound: ${id}`)
      await window.api.sound.delete(id)
      await refreshSounds()
    } catch (err) {
      console.error('[useSoundboard] Delete failed:', err)
    }
  }

  const playSound = async (id: string, volume = 1.0) => {
    await window.api.sound.play(id, volume)
  }

  const stopAllSounds = async () => {
    await window.api.sound.stopAll()
  }

  return {
    sounds,
    refreshSounds,
    uploadSound,
    deleteSound,
    playSound,
    stopAllSounds
  }
}
