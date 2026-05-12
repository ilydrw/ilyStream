import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useStudioStore } from '../../../../stores/studio-store'
import type { AudioSource, StudioScene } from '../../../../../shared/studio'
import {
  IconEraser,
  IconHeadphones,
  IconLock,
  IconLockOpen,
  IconPalette,
  IconPencil,
  IconRefresh,
  IconRoute,
  IconSparkles,
  IconTrash,
  IconVolume,
  IconVolumeOff
} from '@tabler/icons-react'
import type { ContextMenuItem } from '../../../../components/ui/ContextMenu'
import { sanitizeChannelMode } from '../../../../utils/audio-engine'
import {
  sanitizeAudioSourceUpdates,
  normalizeTrackColor,
  dbToLinear,
  linearToDb,
  getTrackStatuses,
  mixMeters
} from './utils'
import { TRACK_COLOR_PRESETS, type FxPreset } from './constants'
import { useLiveMeters } from './useLiveMeters'

export function useAudioMixerLogic(
  activeScene: StudioScene,
  videoRefs: React.MutableRefObject<Record<string, HTMLVideoElement>>,
  devices: MediaDeviceInfo[],
  streamReady: number = 0
) {
  const audioSources = useStudioStore(s => s.audioSources)
  const masterBus = useStudioStore(s => s.masterBus)
  const selectedAudioSourceId = useStudioStore(s => s.selectedAudioSourceId)
  const updateAudioSource = useStudioStore(s => s.updateAudioSource)
  const removeAudioSource = useStudioStore(s => s.removeAudioSource)
  const setSelectedAudioSource = useStudioStore(s => s.setSelectedAudioSource)
  const reorderAudioSource = useStudioStore(s => s.reorderAudioSource)
  const updateLayer = useStudioStore(s => s.updateLayer)

  const sidebarWidth = useStudioStore(s => s.mixerSidebarWidth)
  const setSidebarWidth = useStudioStore(s => s.setMixerSidebarWidth)
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)

  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; source: AudioSource } | null>(null)

  const handleSidebarResize = useCallback((e: PointerEvent) => {
    const newWidth = window.innerWidth - e.clientX
    const clampedWidth = Math.max(280, Math.min(newWidth, window.innerWidth * 0.6))
    setSidebarWidth(clampedWidth)
  }, [setSidebarWidth])

  const handleSidebarResizeEnd = useCallback(() => {
    setIsResizingSidebar(false)
  }, [])

  useEffect(() => {
    if (!isResizingSidebar) return
    window.addEventListener('pointermove', handleSidebarResize)
    window.addEventListener('pointerup', handleSidebarResizeEnd)
    return () => {
      window.removeEventListener('pointermove', handleSidebarResize)
      window.removeEventListener('pointerup', handleSidebarResizeEnd)
    }
  }, [isResizingSidebar, handleSidebarResize])

  const meters = useLiveMeters(activeScene, videoRefs, audioSources, devices, streamReady)
  const trackStatuses = useMemo(
    () => getTrackStatuses(activeScene, videoRefs, audioSources),
    [activeScene, videoRefs, audioSources, meters]
  )

  const channels = useMemo(() => [masterBus, ...audioSources], [masterBus, audioSources])
  const selectedSource = channels.find(source => source.id === selectedAudioSourceId) || masterBus
  const selectedMeter = meters[selectedSource.id] || { left: 0, right: 0, peak: 0 }

  const updateSource = (id: string, updates: Partial<AudioSource>) => {
    const safeUpdates = sanitizeAudioSourceUpdates(updates)
    if (id === 'master') {
      useStudioStore.setState(state => ({ masterBus: { ...state.masterBus, ...safeUpdates, channelMode: 'stereo' } }))
      return
    }
    updateAudioSource(id, safeUpdates)
  }

  const addFx = (source: AudioSource, preset: FxPreset) => {
    const nextFx = {
      id: crypto.randomUUID(),
      type: preset.type,
      params: preset.params,
      enabled: true
    }
    updateSource(source.id, { fxChain: [...(source.fxChain || []), nextFx] })
  }

  const updateFx = (source: AudioSource, fxId: string, updates: Record<string, unknown>) => {
    updateSource(source.id, {
      fxChain: (source.fxChain || []).map(fx => fx.id === fxId ? { ...fx, ...updates } : fx)
    })
  }

  const updateFxParam = (source: AudioSource, fxId: string, key: string, value: number) => {
    updateSource(source.id, {
      fxChain: (source.fxChain || []).map(fx =>
        fx.id === fxId ? { ...fx, params: { ...(fx.params || {}), [key]: value } } : fx
      )
    })
  }

  const removeFx = (source: AudioSource, fxId: string) => {
    updateSource(source.id, { fxChain: (source.fxChain || []).filter(fx => fx.id !== fxId) })
  }

  const removeMixerTrack = (source: AudioSource) => {
    if (source.id === 'master') return
    const layer = activeScene.layers.find(item => item.id === source.id)
    if (layer) {
      updateLayer(activeScene.id, layer.id, {
        config: {
          ...layer.config,
          audioMixerHidden: true,
          audioDeviceId: 'none'
        }
      })
      setSelectedAudioSource('master')
      return
    }
    removeAudioSource(source.id)
    setSelectedAudioSource('master')
  }

  const handleDrop = (targetIndex: number) => {
    if (dragIndex == null || dragIndex === targetIndex) return
    if (audioSources[dragIndex]?.locked || audioSources[targetIndex]?.locked) return
    reorderAudioSource(dragIndex, targetIndex)
    setDragIndex(null)
  }

  const lockMixerTrack = (source: AudioSource, locked: boolean) => {
    updateSource(source.id, { locked })
    const layer = activeScene.layers.find(item => item.id === source.id)
    if (layer) updateLayer(activeScene.id, layer.id, { locked, portraitLocked: locked })
  }

  const getTrackLocked = (source: AudioSource) => {
    const layer = activeScene.layers.find(item => item.id === source.id)
    return Boolean(source.locked || layer?.locked || layer?.portraitLocked)
  }

  const renameMixerTrack = (source: AudioSource) => {
    setSelectedAudioSource(source.id)
    setTimeout(() => {
      const input = document.querySelector('input[placeholder="Track Label"]') as HTMLInputElement
      if (input) {
        input.focus()
        input.select()
      } else {
        const nextName = window.prompt('Rename mixer track', source.label || source.name)
        if (nextName !== null) {
          const trimmed = nextName.trim()
          updateSource(source.id, { label: trimmed || undefined })
          const layer = activeScene.layers.find(l => l.id === source.id)
          if (layer && trimmed) updateLayer(activeScene.id, layer.id, { name: trimmed })
        }
      }
    }, 100)
  }

  const setCustomTrackColor = (source: AudioSource) => {
    const current = normalizeTrackColor(source.color) || '#64c7ff'
    const nextColor = window.prompt('Track color hex value', current)
    if (nextColor === null) return
    const normalized = normalizeTrackColor(nextColor)
    if (!normalized) return
    updateSource(source.id, { color: normalized })
  }

  const buildColorMenu = (source: AudioSource): ContextMenuItem[] => [
    ...TRACK_COLOR_PRESETS.map(preset => ({
      id: `color-${preset.id}`,
      label: preset.label,
      icon: <span className="h-3.5 w-3.5 rounded-full ring-1 ring-white/20" style={{ backgroundColor: preset.value }} />,
      onClick: () => updateSource(source.id, { color: preset.value })
    })),
    { id: 'color-divider', label: '', divider: true },
    {
      id: 'color-custom',
      label: 'Custom Color',
      icon: <IconPalette size={16} />,
      onClick: () => setCustomTrackColor(source)
    },
    {
      id: 'color-clear',
      label: 'Use Default Color',
      icon: <IconEraser size={16} />,
      onClick: () => updateSource(source.id, { color: undefined })
    }
  ]

  const buildTrackMenu = (source: AudioSource): ContextMenuItem[] => {
    const locked = getTrackLocked(source)
    const isMaster = source.id === 'master'
    return [
      {
        id: 'rename',
        label: 'Rename Track',
        icon: <IconPencil size={16} />,
        onClick: () => renameMixerTrack(source)
      },
      {
        id: 'color',
        label: 'Track Color',
        icon: <IconPalette size={16} />,
        submenu: buildColorMenu(source)
      },
      {
        id: 'reset',
        label: 'Reset Mix Settings',
        icon: <IconRefresh size={16} />,
        onClick: () => updateSource(source.id, {
          volume: 0.8,
          pan: 0,
          muted: false,
          monitoring: source.id === 'master',
          channelMode: source.type === 'mic' ? 'mono' : 'stereo'
        })
      },
      { id: 'divider-edit', label: '', divider: true },
      {
        id: 'lock',
        label: locked ? 'Unlock Track' : 'Lock Track',
        icon: locked ? <IconLockOpen size={16} /> : <IconLock size={16} />,
        disabled: isMaster,
        onClick: () => lockMixerTrack(source, !locked)
      },
      {
        id: 'mute',
        label: source.muted ? 'Unmute Track' : 'Mute Track',
        icon: source.muted ? <IconVolume size={16} /> : <IconVolumeOff size={16} />,
        onClick: () => updateSource(source.id, { muted: !source.muted })
      },
      {
        id: 'monitor',
        label: source.monitoring ? 'Disable Monitor' : 'Monitor Track',
        icon: <IconHeadphones size={16} />,
        onClick: () => updateSource(source.id, { monitoring: !source.monitoring })
      },
      {
        id: 'channel-mode',
        label: sanitizeChannelMode(source.channelMode, source.type === 'mic' ? 'mono' : 'stereo') === 'mono' ? 'Switch to Stereo' : 'Switch to Mono',
        icon: <IconRoute size={16} />,
        disabled: isMaster,
        onClick: () => {
          const current = sanitizeChannelMode(source.channelMode, source.type === 'mic' ? 'mono' : 'stereo')
          updateSource(source.id, { channelMode: current === 'mono' ? 'stereo' : 'mono' })
        }
      },
      {
        id: 'clear-fx',
        label: 'Clear Inserts',
        icon: <IconSparkles size={16} />,
        disabled: !(source.fxChain || []).length,
        onClick: () => updateSource(source.id, { fxChain: [] })
      },
      { id: 'divider-2', label: '', divider: true },
      {
        id: 'delete',
        label: locked ? 'Unlock to Delete' : 'Delete Mixer Track',
        icon: <IconTrash size={16} />,
        danger: true,
        disabled: locked || isMaster,
        onClick: () => removeMixerTrack(source)
      }
    ]
  }

  return {
    audioSources,
    masterBus,
    selectedSource,
    selectedMeter,
    trackStatuses,
    meters,
    sidebarWidth,
    isResizingSidebar,
    setIsResizingSidebar,
    dragIndex,
    setDragIndex,
    contextMenu,
    setContextMenu,
    updateSource,
    addFx,
    updateFx,
    updateFxParam,
    removeFx,
    removeMixerTrack,
    handleDrop,
    getTrackLocked,
    setSelectedAudioSource,
    buildTrackMenu,
    mixMeters
  }
}
