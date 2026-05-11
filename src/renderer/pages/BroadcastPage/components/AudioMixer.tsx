import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {IconActivity, IconGripVertical, IconHeadphones, IconLock, IconMicrophone, IconMusic, IconPlus, IconPower, IconRadio, IconRoute, IconAdjustmentsHorizontal, IconSparkles, IconTrash, IconVolume2, IconVolume, IconVolumeOff, IconWaveSine, IconLockOpen, IconPencil, IconPalette, IconRefresh, IconEraser, IconLayoutSidebarLeftCollapse, IconLayoutSidebarRightCollapse} from '@tabler/icons-react'
import { useStudioStore } from '../../../stores/studio-store'
import type { AudioSource, StudioScene } from '../../../../shared/studio'
import { ContextMenu, type ContextMenuItem } from '../../../components/ui/ContextMenu'
import {
  audioEngine,
  createChannelModeStage,
  sanitizeChannelMode,
  sanitizePan,
  sanitizeVolume,
  type ChannelModeStage
} from '../../../utils/audio-engine'
import { reconcileFxChain } from '../../../utils/audio-fx'
import { resolveCameraAudioDeviceId } from '../utils/media-init'

interface Props {
  activeScene: StudioScene
  videoRefs: React.MutableRefObject<Record<string, HTMLVideoElement>>
  devices: MediaDeviceInfo[]
  streamReady?: number
}

interface MeterFrame {
  left: number
  right: number
  peak: number
  spectrum?: number[]
}

interface LiveMeterNode {
  stream: MediaStream
  context: AudioContext
  source: MediaStreamAudioSourceNode
  splitter: ChannelSplitterNode
  analyserL: AnalyserNode
  analyserR: AnalyserNode
  channelMode: ChannelModeStage
  fxInput: GainNode
  fxOutput: GainNode
  fxNodes: any[]
  meterPan: StereoPannerNode | null
  silentSink: GainNode
  freqData: Uint8Array
  dataL: Float32Array
  dataR: Float32Array
  lastMode?: string
  lastFxHash?: any[]
  elements?: {
    peakL: HTMLElement[]
    peakR: HTMLElement[]
    clipL: HTMLElement[]
    clipR: HTMLElement[]
    spectrum: HTMLCanvasElement | null
  }
}

interface AudioTrackStatus {
  hasStream: boolean
  hasAudio: boolean
  live: boolean
  label: string
}

type FxPreset = {
  type: string
  label: string
  params: Record<string, number>
}

const FX_PRESETS: FxPreset[] = [
  { type: 'noise_gate', label: 'Noise Gate', params: { threshold: -48, reduction: 0.08 } },
  { type: 'compressor', label: 'Compressor', params: { threshold: -24, ratio: 4, attack: 0.006, release: 0.18 } },
  { type: 'eq', label: '3-Band EQ', params: { low: 0, mid: 0, high: 0 } },
  { type: 'limiter', label: 'Limiter', params: { threshold: -3 } },
  { type: 'radio', label: 'Radio Color', params: { drive: 12 } },
  { type: 'echo', label: 'Delay Send', params: { delay: 0.22, feedback: 0.28, mix: 0.22 } }
]

const TRACK_COLOR_PRESETS = [
  { id: 'blue', label: 'Blue', value: '#64c7ff' },
  { id: 'violet', label: 'Violet', value: '#a56bff' },
  { id: 'green', label: 'Green', value: '#6ee787' },
  { id: 'amber', label: 'Amber', value: '#f7c948' },
  { id: 'pink', label: 'Pink', value: '#ff70b8' },
  { id: 'red', label: 'Red', value: '#ff6b6b' }
]

const VOLUME_MARKS = [
  { db: 6, label: '+6' },
  { db: 0, label: '0' },
  { db: -6, label: '-6' },
  { db: -12, label: '-12' },
  { db: -24, label: '-24' },
  { db: -48, label: '-48' }
]

function sanitizeAudioSourceUpdates(updates: Partial<AudioSource>): Partial<AudioSource> {
  const next = { ...updates }
  if ('volume' in next) next.volume = sanitizeVolume(next.volume)
  if ('pan' in next) next.pan = sanitizePan(next.pan)
  if ('channelMode' in next) next.channelMode = sanitizeChannelMode(next.channelMode)
  if ('color' in next) next.color = normalizeTrackColor(next.color)
  if ('fxChain' in next && !Array.isArray(next.fxChain)) next.fxChain = []
  return next
}

function normalizeTrackColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed : undefined
}

function getTrackColor(source: AudioSource): string {
  return normalizeTrackColor(source.color) || 'rgb(var(--accent-rgb))'
}

export const AudioMixer: React.FC<Props> = ({ activeScene, videoRefs, devices, streamReady = 0 }) => {
  const audioSources = useStudioStore(s => s.audioSources)
  const masterBus = useStudioStore(s => s.masterBus)
  const selectedAudioSourceId = useStudioStore(s => s.selectedAudioSourceId)
  const updateAudioSource = useStudioStore(s => s.updateAudioSource)
  const removeAudioSource = useStudioStore(s => s.removeAudioSource)
  const setSelectedAudioSource = useStudioStore(s => s.setSelectedAudioSource)
  const reorderAudioSource = useStudioStore(s => s.reorderAudioSource)
  const updateLayer = useStudioStore(s => s.updateLayer)
  const removeLayer = useStudioStore(s => s.removeLayer)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; source: AudioSource } | null>(null)
  
  const sidebarWidth = useStudioStore(s => s.mixerSidebarWidth)
  const setSidebarWidth = useStudioStore(s => s.setMixerSidebarWidth)
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)

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
      // Don't remove the layer, just hide the audio track
      updateLayer(activeScene.id, layer.id, { 
        config: { 
          ...layer.config, 
          audioMixerHidden: true,
          audioDeviceId: 'none' // Effectively remove audio for cameras
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
    // Select the source first to show the inspector
    selectSource(source.id)
    
    // Focus the label input in the inspector for a sleek experience
    setTimeout(() => {
      const input = document.querySelector('input[placeholder="Track Label"]') as HTMLInputElement
      if (input) {
        input.focus()
        input.select()
      } else {
        // Fallback for edge cases
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

  const recolorMixerTrack = (source: AudioSource) => {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316']
    const currentIndex = colors.indexOf(source.color || '')
    const nextColor = colors[(currentIndex + 1) % colors.length]
    updateSource(source.id, { color: nextColor })
  }

  const resetMixerTrack = (source: AudioSource) => {
    updateSource(source.id, {
      volume: 0.8,
      pan: 0,
      muted: false,
      monitoring: source.id === 'master' ? true : false,
      channelMode: source.type === 'mic' ? 'mono' : 'stereo'
    })
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
        onClick: () => resetMixerTrack(source)
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

  return (
    <div className="relative flex h-full min-h-0 bg-[#030303] text-white overflow-hidden select-none">
      <section className="flex-1 min-w-0 flex flex-col">
        <div className="h-12 shrink-0 px-5 border-b border-white/[0.06] flex items-center justify-between bg-[#070707]">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-lg bg-accent/12 border border-accent/25 text-accent flex items-center justify-center">
              <IconAdjustmentsHorizontal size={15} />
            </div>
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.26em] text-white/55">Audio Console</div>
              <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/18">Program mix, monitor mix, inserts</div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-white/25">
            <IconActivity size={13} className="text-accent" />
              48 kHz stereo engine
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-x-auto custom-scrollbar-horizontal">
          <div className="h-full flex items-stretch gap-3 p-4">
            <ChannelStrip
              source={masterBus}
              meter={meters.master || mixMeters(audioSources.map(source => meters[source.id]))}
              status={trackStatuses.master || { hasStream: true, hasAudio: true, live: true, label: 'Master' }}
              selected={selectedSource.id === 'master'}
              isMaster
              onSelect={() => setSelectedAudioSource('master')}
              onUpdate={updates => updateSource('master', updates)}
              onContextMenu={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setSelectedAudioSource('master')
                setContextMenu({ x: event.clientX, y: event.clientY, source: masterBus })
              }}
            />

            <div className="w-px shrink-0 bg-white/[0.07] my-3" />

            {audioSources.map((source, index) => (
              <ChannelStrip
                key={source.id}
                source={source}
                meter={meters[source.id] || { left: 0, right: 0, peak: 0 }}
                status={trackStatuses[source.id] || { hasStream: false, hasAudio: false, live: false, label: 'No stream' }}
                selected={selectedSource.id === source.id}
                locked={getTrackLocked(source)}
                dragActive={dragIndex === index}
                onSelect={() => setSelectedAudioSource(source.id)}
                onUpdate={updates => updateSource(source.id, updates)}
                onDragStart={() => setDragIndex(index)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => handleDrop(index)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setSelectedAudioSource(source.id)
                  setContextMenu({ x: event.clientX, y: event.clientY, source })
                }}
              />
            ))}
          </div>
        </div>
      </section>

      {selectedSource && (
        <>
          {/* Horizontal Resize Handle */}
          <div
            onPointerDown={(e) => { e.preventDefault(); setIsResizingSidebar(true) }}
            className={`absolute top-0 bottom-0 w-1.5 cursor-ew-resize z-50 transition-colors group ${isResizingSidebar ? 'bg-accent/40' : 'hover:bg-accent/20'}`}
            style={{ right: sidebarWidth - 1 }}
          >
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-12 rounded-full bg-white/5 group-hover:bg-accent/40 transition-colors" />
          </div>

          <aside 
            className="shrink-0 border-l border-white/[0.07] bg-[#080808] flex flex-col min-h-0 relative z-10 shadow-[-30px_0_70px_rgba(0,0,0,0.45)]"
            style={{ width: sidebarWidth }}
          >
        <div className="p-6 border-b border-white/[0.06] bg-black/20">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-accent/80 whitespace-nowrap">Source Configuration</span>
                <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_12px_rgba(var(--accent-rgb),0.9)]" />
              </div>
              <input
                value={selectedSource.label || selectedSource.name}
                onChange={event => updateSource(selectedSource.id, { label: event.target.value })}
                className="w-full bg-transparent text-lg font-black text-white outline-none uppercase tracking-tighter focus:text-accent transition-colors"
                placeholder="Track Label"
              />
              <div className="mt-2 flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-white/5 text-[9px] font-bold uppercase tracking-widest text-white/40">{selectedSource.type}</span>
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/20 truncate">
                  {selectedSource.name}
                </span>
              </div>
              {selectedSource.id !== 'master' && (
                <div className={`mt-4 inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest ${getStatusClasses(trackStatuses[selectedSource.id])}`}>
                  <span className="h-2 w-2 rounded-full bg-current shadow-[0_0_8px_currentColor]" />
                  {trackStatuses[selectedSource.id]?.label || 'No stream'}
                </div>
              )}
            </div>
            <MiniPeak id={selectedSource.id} meter={selectedMeter} />
          </div>

          <div className={`mt-6 grid gap-3 ${sidebarWidth < 300 ? 'grid-cols-1' : sidebarWidth < 480 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            <InspectorToggle
              active={!selectedSource.muted}
              label="Output"
              icon={selectedSource.muted ? IconVolumeOff : IconVolume}
              onClick={() => updateSource(selectedSource.id, { muted: !selectedSource.muted })}
            />
            <InspectorToggle
              active={selectedSource.monitoring}
              label="Monitor"
              icon={IconHeadphones}
              onClick={() => updateSource(selectedSource.id, { monitoring: !selectedSource.monitoring })}
            />
            <InspectorToggle
              active={(selectedSource.fxChain || []).some((fx: any) => fx.enabled)}
              label="Inserts"
              icon={IconSparkles}
              onClick={() => {
                const hasActive = (selectedSource.fxChain || []).some((fx: any) => fx.enabled)
                updateSource(selectedSource.id, {
                  fxChain: (selectedSource.fxChain || []).map((fx: any) => ({ ...fx, enabled: !hasActive }))
                })
              }}
            />
          </div>
          {selectedSource.id !== 'master' && (
            <button
              onClick={() => removeMixerTrack(selectedSource)}
              disabled={getTrackLocked(selectedSource)}
              className="mt-4 h-11 w-full rounded-xl border border-red-500/20 bg-red-500/5 text-red-400/60 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-all flex items-center justify-center gap-2.5 text-[10px] font-black uppercase tracking-[0.2em]"
              title="Remove this channel from the mixer"
            >
              <IconTrash size={15} />
              Remove Channel
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-5 space-y-5">
          <section>
            <div className="flex items-center justify-between mb-3">
              <HeaderLabel icon={IconRoute} label="Routing" />
              <span className="text-[9px] font-black uppercase tracking-[0.18em] text-white/22">Master bus</span>
            </div>
            {selectedSource.id !== 'master' && (
              <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-white/[0.025] p-1 ring-1 ring-white/[0.06]">
                {(['mono', 'stereo'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => updateSource(selectedSource.id, { channelMode: mode })}
                    className={`h-9 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                      sanitizeChannelMode(selectedSource.channelMode, selectedSource.type === 'mic' ? 'mono' : 'stereo') === mode
                        ? 'bg-accent/15 text-accent ring-1 ring-accent/30'
                        : 'text-white/28 hover:bg-white/[0.035] hover:text-white/55'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            )}
            <div className={`grid gap-3 ${sidebarWidth < 460 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              <Knob
                label="Pan"
                value={selectedSource.pan || 0}
                min={-1}
                max={1}
                compact={sidebarWidth < 520 && sidebarWidth >= 460}
                display={formatPan(selectedSource.pan || 0)}
                onChange={value => updateSource(selectedSource.id, { pan: value })}
              />
              <Knob
                label="Trim"
                value={linearToDb(selectedSource.volume)}
                min={-60}
                max={6}
                compact={sidebarWidth < 520 && sidebarWidth >= 460}
                display={`${Math.round(linearToDb(selectedSource.volume))} dB`}
                onChange={value => updateSource(selectedSource.id, { volume: dbToLinear(value) })}
              />
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <HeaderLabel icon={IconWaveSine} label="Insert Rack" />
              <select
                value=""
                onChange={event => {
                  const preset = FX_PRESETS.find(item => item.type === event.target.value)
                  if (preset) addFx(selectedSource, preset)
                  event.currentTarget.value = ''
                }}
                className="h-8 rounded-lg bg-white/[0.04] border border-white/[0.07] px-2 text-[10px] font-bold text-white/50 outline-none [&>option]:bg-[#1a1a1a]"
              >
                <option value="">Add FX</option>
                {FX_PRESETS.map(fx => <option key={fx.type} value={fx.type}>{fx.label}</option>)}
              </select>
            </div>

            <div className="space-y-3">
              {(selectedSource.fxChain || []).length === 0 ? (
                <div className="h-28 rounded-xl border border-dashed border-white/[0.08] bg-white/[0.015] flex flex-col items-center justify-center gap-2 text-white/20">
                  <IconPlus size={18} />
                  <span className="text-[10px] font-black uppercase tracking-[0.22em]">No inserts loaded</span>
                </div>
              ) : (
                (selectedSource.fxChain || []).map((fx: any, index: number) => (
                  <FxCard
                    key={fx.id}
                    index={index}
                    fx={fx}
                    onToggle={() => updateFx(selectedSource, fx.id, { enabled: !fx.enabled })}
                    onRemove={() => removeFx(selectedSource, fx.id)}
                    onParam={(key, value) => updateFxParam(selectedSource, fx.id, key, value)}
                  />
                ))
              )}
            </div>
          </section>

          <section>
            <HeaderLabel icon={IconActivity} label="Spectrum" />
            <Spectrum id={selectedSource.id} />
          </section>
        </div>
      </aside>
    </>
  )}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildTrackMenu(contextMenu.source)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}

function cleanupLiveMeterNode(node: LiveMeterNode): void {
  try { node.source.disconnect() } catch {}
  try { node.splitter.disconnect() } catch {}
  try { node.analyserL.disconnect() } catch {}
  try { node.analyserR.disconnect() } catch {}
  node.channelMode.disconnect()
  try { node.fxInput.disconnect() } catch {}
  try { node.fxOutput.disconnect() } catch {}
  try { node.meterPan?.disconnect() } catch {}
  try { node.silentSink.disconnect() } catch {}
  for (const fxNode of node.fxNodes) {
    try { fxNode?.disconnect?.() } catch {}
  }
}

function useLiveMeters(
  activeScene: StudioScene,
  videoRefs: React.MutableRefObject<Record<string, HTMLVideoElement>>,
  audioSources: AudioSource[],
  devices: MediaDeviceInfo[],
  streamReady: number
): Record<string, MeterFrame> {
  const [meters, setMeters] = useState<Record<string, MeterFrame>>({})
  const lastUpdateRef = useRef(0)
  const nodesRef = useRef(new Map<string, LiveMeterNode>())
  const micStreams = useRef<Record<string, MediaStream>>({})
  const pendingMics = useRef<Set<string>>(new Set())

  useEffect(() => {
    let disposed = false
    let frameId = 0

    const ensureNode = async (source: AudioSource) => {
      let stream: MediaStream | null = null
      
      if (source.id === 'soundboard') {
        stream = (window as any).__soundboardStream || null
      } else if (source.id === 'tts-audio') {
        stream = audioEngine.getTtsStream()
      } else if (source.type === 'mic' && source.deviceId) {
        const globalMic = (window as any).__ilyMicStreams?.[source.id]
        if (globalMic) {
          stream = globalMic
        } else if (micStreams.current[source.id]) {
          stream = micStreams.current[source.id]
        } else {
          // If this source is a layer in the current scene, wait for BroadcastPage to init it
          const isLayer = activeScene.layers.some(l => l.id === source.id)
          if (isLayer) {
            // IconCheck videoRefs one more time
            const el = videoRefs.current[source.id] as any
            stream = (el?.__ilyRawStream || el?.srcObject) as MediaStream | null
            if (!stream) return // Wait for BroadcastPage
          } else {
            if (pendingMics.current.has(source.id)) return
            pendingMics.current.add(source.id)

            try {
              let deviceId = source.deviceId
              if (deviceId === 'match') {
                const layer = activeScene.layers.find(l => l.id === source.id)
                const matchId = layer ? resolveCameraAudioDeviceId(layer, devices) : undefined
                
                if (matchId) {
                  deviceId = matchId
                } else {
                  pendingMics.current.delete(source.id)
                  return 
                }
              }

              console.log(`[AudioMixer] Initializing standalone mic: ${source.name} (${deviceId})`)
              stream = await navigator.mediaDevices.getUserMedia({
                audio: { 
                  deviceId: { exact: deviceId },
                  echoCancellation: false,
                  noiseSuppression: false,
                  autoGainControl: false
                }
            })
              micStreams.current[source.id] = stream
            } catch (err) {
              console.error('[AudioMixer] Failed to get standalone mic stream:', err)
            } finally {
              pendingMics.current.delete(source.id)
            }
          }
        }
      } else {
        const video = videoRefs.current[source.id] as any
        stream = (video?.__ilyRawStream || video?.srcObject) as MediaStream | null
      }

      if (stream) {
        const audioTracks = stream.getAudioTracks()
        if (audioTracks.length === 0 || audioTracks.every(t => t.readyState === 'ended')) {
          stream = null
        }
      }

      if (!stream) return
      const existing = nodesRef.current.get(source.id)
      if (existing?.stream === stream) return
      
      // Clean up previous source if stream changed
      if (existing) {
        cleanupLiveMeterNode(existing)
        nodesRef.current.delete(source.id)
      }

      try {
        const context = audioEngine.getContext()
        const mediaSource = context.createMediaStreamSource(stream)
        const splitter = context.createChannelSplitter(2)
        const analyserL = context.createAnalyser()
        const analyserR = context.createAnalyser()
        const channelMode = createChannelModeStage(
          context,
          sanitizeChannelMode(source.channelMode, source.type === 'mic' ? 'mono' : 'stereo')
        )
        const fxInput = context.createGain()
        const fxOutput = context.createGain()
        
        analyserL.fftSize = 512
        analyserL.smoothingTimeConstant = 0.4
        analyserR.fftSize = 512
        analyserR.smoothingTimeConstant = 0.4
        
        mediaSource.connect(channelMode.input)
        channelMode.output.connect(fxInput)
        fxInput.connect(fxOutput)
        
        // Metering path (post-fader/post-pan)
        const meterPan = context.createStereoPanner()
        fxOutput.connect(meterPan)
        meterPan.connect(splitter)
        
        splitter.connect(analyserL, 0)
        splitter.connect(analyserR, 1)

        // Silent sink to keep graph alive and ensure analyzers aren't garbage collected
        const silentSink = context.createGain()
        silentSink.gain.value = 0
        fxOutput.connect(silentSink)
        analyserL.connect(silentSink)
        analyserR.connect(silentSink)
        silentSink.connect(context.destination)
        // DO NOT connect to destination here - useBroadcastAudio handles the final output

        void context.resume()
        nodesRef.current.set(source.id, {
          stream,
          context,
          source: mediaSource,
          splitter,
          analyserL,
          analyserR,
          channelMode,
          fxInput,
          fxOutput,
          fxNodes: [],
          meterPan,
          silentSink,
          dataL: new Float32Array(analyserL.fftSize),
          dataR: new Float32Array(analyserR.fftSize),
          freqData: new Uint8Array(analyserL.frequencyBinCount)
        })
      } catch {
        // Some browser streams can only be attached once per context. The UI falls back to silence.
      }
    }

    const activeAudioIds = new Set(
      activeScene.layers
        .filter(layer => layer.type === 'camera' || layer.type === 'display' || layer.type === 'audio')
        .map(layer => layer.id)
    )
    
    // Always consider soundboard and TTS active if they exist
    if (audioSources.some(s => s.id === 'soundboard')) {
      activeAudioIds.add('soundboard')
    }
    if (audioSources.some(s => s.id === 'tts-audio')) {
      activeAudioIds.add('tts-audio')
    }

    audioSources.forEach(source => {
      if (activeAudioIds.has(source.id)) {
        void ensureNode(source)
      }
    })

    // Poll for missing media elements every 1s (in case they initialized late)
    const initPollTimer = window.setInterval(() => {
      audioSources.forEach(source => {
        if (activeAudioIds.has(source.id)) ensureNode(source)
      })
      // Heartbeat resume for audio engine
      if (audioEngine.getContext().state === 'suspended') {
        void audioEngine.getContext().resume()
      }
    }, 1000)

    for (const [id, node] of nodesRef.current) {
      if (activeAudioIds.has(id)) continue
      cleanupLiveMeterNode(node)
      nodesRef.current.delete(id)
    }

    const lastTickRef = { current: 0 }
    const tick = (timestamp: number) => {
      if (disposed) return

      // Throttle metering logic to ~30fps to save CPU for the audio worklet and broadcast bus
      const elapsed = timestamp - lastTickRef.current
      if (elapsed < 32) {
        frameId = requestAnimationFrame(tick)
        return
      }
      lastTickRef.current = timestamp

      const next: Record<string, MeterFrame> = {}
      let masterL = 0, masterR = 0, masterPeak = 0
      let activeCount = 0

      for (const source of audioSources) {
        const node = nodesRef.current.get(source.id)
        if (!node) {
          next[source.id] = { left: 0, right: 0, peak: 0 }
          continue
        }

        // Update FX parameters and chain structure ONLY if changed (optimization)
        const currentMode = sanitizeChannelMode(source.channelMode, source.type === 'mic' ? 'mono' : 'stereo')
        if (node.lastMode !== currentMode) {
          node.channelMode.setMode(currentMode)
          node.lastMode = currentMode
        }

        // Use reference comparison instead of JSON.stringify for performance
        if (node.lastFxHash !== (source.fxChain || [])) {
          const fxState = { input: node.fxInput, output: node.fxOutput, nodes: node.fxNodes }
          reconcileFxChain(node.context, fxState, source.fxChain || [])
          node.fxNodes = fxState.nodes
          node.lastFxHash = source.fxChain || []
        }

        // Apply volume and pan to processing nodes
        node.fxOutput.gain.setTargetAtTime(source.volume, node.context.currentTime, 0.01)
        
        if (node.meterPan) {
          node.meterPan.pan.setTargetAtTime(source.pan || 0, node.context.currentTime, 0.01)
        }

        // We always process the analyser data now that it's connected pre-monitor-gain
        node.analyserL.getFloatTimeDomainData(node.dataL as any)
        node.analyserR.getFloatTimeDomainData(node.dataR as any)
        
        let sumL = 0, sumR = 0
        let peakL = 0, peakR = 0
        const len = node.dataL.length
        
        for (let i = 0; i < len; i++) {
          const sL = node.dataL[i], sR = node.dataR[i]
          sumL += sL * sL
          sumR += sR * sR
          if (Math.abs(sL) > peakL) peakL = Math.abs(sL)
          if (Math.abs(sR) > peakR) peakR = Math.abs(sR)
        }
        
        const rmsL = Math.sqrt(sumL / len) * 2.2
        const rmsR = Math.sqrt(sumR / len) * 2.2
        const peakTotal = Math.max(peakL, peakR) * 1.1
        
        const meter = {
          left: Math.min(1, rmsL),
          right: Math.min(1, rmsR),
          peak: Math.min(1, peakTotal)
        }
        next[source.id] = meter
        
        masterL += meter.left
        masterR += meter.right
        masterPeak = Math.max(masterPeak, meter.peak)
        activeCount++
      }

      next.master = {
        left: activeCount > 0 ? Math.min(1, masterL / Math.sqrt(activeCount)) : 0,
        right: activeCount > 0 ? Math.min(1, masterR / Math.sqrt(activeCount)) : 0,
        peak: masterPeak
      }
      
      // Update DOM directly for performance (bypassing React for 60fps meters)
      Object.entries(next).forEach(([id, data]) => {
        let elements: any = null

        if (id === 'master') {
          // Special case for master meter elements as it has no node
          if (!(window as any).__ilyMasterElements) {
            (window as any).__ilyMasterElements = {
              peakL: Array.from(document.querySelectorAll(`.meter-peak-l-master`)),
              peakR: Array.from(document.querySelectorAll(`.meter-peak-r-master`)),
              clipL: Array.from(document.querySelectorAll(`.meter-clip-l-master`)),
              clipR: Array.from(document.querySelectorAll(`.meter-clip-r-master`))
            }
          }
          elements = (window as any).__ilyMasterElements
        } else {
          const node = nodesRef.current.get(id)
          if (!node) return

          // Lazy-load element references once to avoid querySelectorAll every frame
          if (!node.elements) {
            node.elements = {
              peakL: Array.from(document.querySelectorAll(`.meter-peak-l-${id}`)) as HTMLElement[],
              peakR: Array.from(document.querySelectorAll(`.meter-peak-r-${id}`)) as HTMLElement[],
              clipL: Array.from(document.querySelectorAll(`.meter-clip-l-${id}`)) as HTMLElement[],
              clipR: Array.from(document.querySelectorAll(`.meter-clip-r-${id}`)) as HTMLElement[],
              spectrum: document.getElementById(`spectrum-canvas-${id}`) as HTMLCanvasElement | null
            }
          }
          elements = node.elements
        }

        if (!elements) return

        const peakPercentL = `${Math.max(4, data.left * 100)}%`
        const peakPercentR = `${Math.max(4, data.right * 100)}%`
        
        elements.peakL.forEach((el: HTMLElement) => { el.style.height = peakPercentL })
        elements.peakR.forEach((el: HTMLElement) => { el.style.height = peakPercentR })
        
        const dbL = data.left <= 0.001 ? -60 : 20 * Math.log10(data.left)
        const dbR = data.right <= 0.001 ? -60 : 20 * Math.log10(data.right)
        const clipL = `${100 - Math.max(0, (dbL + 60) / 60) * 100}%`
        const clipR = `${100 - Math.max(0, (dbR + 60) / 60) * 100}%`
        
        elements.clipL.forEach((el: HTMLElement) => { el.style.clipPath = `inset(${clipL} 0 0 0)` })
        elements.clipR.forEach((el: HTMLElement) => { el.style.clipPath = `inset(${clipR} 0 0 0)` })

        // Update spectrum canvas if it exists (only for tracks, not master)
        const canvas = elements.spectrum
        if (canvas && data.spectrum) {
          const ctx = canvas.getContext('2d', { alpha: false })
          if (ctx) {
            const w = canvas.width
            const h = canvas.height
            ctx.fillStyle = '#000000'
            ctx.fillRect(0, 0, w, h)
            
            const bars = data.spectrum
            const barW = (w / bars.length) - 1
            
            // Reuse gradient or use simple color for max performance
            ctx.fillStyle = '#6366f1'
            bars.forEach((level, i) => {
              const barH = level * h
              const x = i * (barW + 1)
              const y = h - barH
              ctx.globalAlpha = 0.3 + (level * 0.7)
              ctx.fillRect(x, y, barW, barH)
            })
            ctx.globalAlpha = 1.0
          }
        }
      })

      // Throttle React state updates to 10fps to prevent main-thread lag
      const now = Date.now()
      if (now - lastUpdateRef.current >= 100) {
        if (!disposed) setMeters(next)
        lastUpdateRef.current = now
      }

      frameId = requestAnimationFrame(tick)
    }

    frameId = requestAnimationFrame(tick)
    return () => {
      disposed = true
      cancelAnimationFrame(frameId)
      window.clearInterval(initPollTimer)
    }
  }, [activeScene, audioSources, videoRefs, streamReady, devices])

  useEffect(() => () => {
    for (const node of nodesRef.current.values()) {
      cleanupLiveMeterNode(node)
    }
    nodesRef.current.clear()
    for (const stream of Object.values(micStreams.current)) {
      stream.getTracks().forEach(t => t.stop())
    }
    micStreams.current = {}
  }, [])

  return meters
}

function ChannelStrip({
  source,
  meter,
  status,
  selected,
  locked,
  isMaster,
  dragActive,
  onSelect,
  onUpdate,
  onDragStart,
  onDragOver,
  onDrop,
  onContextMenu
}: {
  source: AudioSource
  meter: MeterFrame
  status: AudioTrackStatus
  selected: boolean
  locked?: boolean
  isMaster?: boolean
  dragActive?: boolean
  onSelect: () => void
  onUpdate: (updates: Partial<AudioSource>) => void
  onDragStart?: () => void
  onDragOver?: (event: React.DragEvent) => void
  onDrop?: () => void
  onContextMenu?: (event: React.MouseEvent) => void
}) {
  const Icon = isMaster ? IconRadio : source.type === 'mic' ? IconMicrophone : source.type === 'media' ? IconMusic : IconVolume2
  const db = linearToDb(source.volume)
  const trackColor = getTrackColor(source)
  const [trackHeight, setTrackHeight] = useState(160)
  const [folded, setFolded] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)
  const stripStyle = {
    backfaceVisibility: 'hidden',
    transform: 'translateZ(0)',
    background: selected ? `color-mix(in srgb, ${trackColor} 13%, transparent)` : undefined,
    boxShadow: selected ? `0 0 0 2px color-mix(in srgb, ${trackColor} 45%, transparent), 0 0 50px color-mix(in srgb, ${trackColor} 18%, transparent)` : undefined
  } as React.CSSProperties

  useEffect(() => {
    if (!trackRef.current) return
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setTrackHeight(entry.contentRect.height)
      }
    })
    observer.observe(trackRef.current)
    return () => observer.disconnect()
  }, [])

  // --- FOLDED (compact) view ---
  if (folded) {
    return (
      <div
        onClick={onSelect}
        onContextMenu={onContextMenu}
        className={`relative w-[64px] shrink-0 rounded-2xl flex flex-col overflow-hidden transition-all duration-300 ease-out ${
          selected
            ? 'ring-0'
            : 'bg-white/[0.05] ring-1 ring-white/[0.1] hover:bg-white/[0.08] hover:ring-white/[0.15]'
        }`}
        style={stripStyle}
      >
        <div className="absolute inset-y-0 left-0 w-1 opacity-80" style={{ backgroundColor: trackColor }} />

        {/* Tiny header: icon + unfold */}
        <div
          className={`h-10 flex flex-col items-center justify-center gap-0.5 border-b border-white/[0.035] cursor-pointer ${isMaster ? 'bg-accent/[0.12]' : 'bg-black/20'}`}
          onDoubleClick={e => { e.stopPropagation(); setFolded(false) }}
          title="Double-click to expand"
        >
          <Icon size={12} style={{ color: trackColor }} />
          <span className="text-[6px] font-black uppercase tracking-tight text-white/40 max-w-[52px] truncate text-center leading-none">
            {(source.label || source.name).slice(0, 6)}
          </span>
        </div>

        {/* Meters + Fader */}
        <div className="flex-1 min-h-0 flex items-stretch overflow-hidden py-2 px-1.5 gap-1" ref={trackRef}>
          {/* Left meter */}
          <div className="w-[5px] shrink-0 rounded-sm bg-black/75 border border-white/[0.04] relative overflow-hidden">
            <div
              className={`absolute inset-0 bg-gradient-to-t from-emerald-500 via-lime-400 to-red-400 meter-clip-l-${source.id}`}
              style={{ clipPath: `inset(${100 - Math.max(0, ((source.muted ? -60 : (meter.left <= 0.001 ? -60 : 20 * Math.log10(meter.left))) + 60) / 60) * 100}% 0 0 0)` }}
            />
          </div>

          {/* Fader */}
          <div className="relative flex-1 flex items-center justify-center">
            <div className="absolute inset-y-1 left-1/2 -translate-x-1/2 w-0.5 rounded-full bg-black/60 border border-white/[0.04]" />
            <input
              aria-label={`${source.name} volume`}
              type="range"
              min={-60}
              max={6}
              step={0.1}
              value={linearToDb(source.volume)}
              onChange={event => onUpdate({ volume: dbToLinear(Number(event.target.value)) })}
              onContextMenu={e => { e.preventDefault(); onUpdate({ volume: 1.0 }) }}
              onPointerDown={event => {
                event.stopPropagation()
                useStudioStore.getState().saveHistory()
              }}
              onDragStart={event => event.preventDefault()}
              className="absolute h-6 rotate-[-90deg] cursor-ns-resize accent-accent origin-center"
              style={{ width: `${trackHeight - 8}px` }}
            />
          </div>

          {/* Right meter */}
          <div className="w-[5px] shrink-0 rounded-sm bg-black/75 border border-white/[0.04] relative overflow-hidden">
            <div
              className={`absolute inset-0 bg-gradient-to-t from-emerald-500 via-lime-400 to-red-400 meter-clip-r-${source.id}`}
              style={{ clipPath: `inset(${100 - Math.max(0, ((source.muted ? -60 : (meter.right <= 0.001 ? -60 : 20 * Math.log10(meter.right))) + 60) / 60) * 100}% 0 0 0)` }}
            />
          </div>
        </div>

        {/* dB readout */}
        <div className="shrink-0 text-center py-1">
          <span className={`text-[8px] font-black tabular-nums tracking-tighter ${selected ? 'text-accent' : 'text-white/35'}`}>
            {db <= -59.5 ? '-∞' : `${Math.round(db)}`}
          </span>
        </div>

        {/* Monitor + Mute */}
        <div className="h-10 px-1 border-t border-white/[0.035] bg-[#090909] flex items-center justify-center gap-1">
          <button
            onClick={event => { event.stopPropagation(); onUpdate({ monitoring: !source.monitoring }) }}
            className={`flex-1 h-7 rounded-lg ring-1 ring-white/5 flex items-center justify-center transition-all ${source.monitoring ? 'bg-accent/15 ring-accent/35 text-accent' : 'bg-white/[0.03] text-white/20 hover:text-white/45'}`}
            title="Monitor"
          >
            <IconHeadphones size={12} />
          </button>
          <button
            onClick={event => { event.stopPropagation(); onUpdate({ muted: !source.muted }) }}
            className={`flex-1 h-7 rounded-lg ring-1 ring-white/5 flex items-center justify-center transition-all ${source.muted ? 'bg-red-500/15 ring-red-500/35 text-red-300' : 'bg-white/[0.03] text-white/20 hover:text-white/45'}`}
            title="Mute"
          >
            {source.muted ? <IconVolumeOff size={12} /> : <IconVolume size={12} />}
          </button>
        </div>
      </div>
    )
  }

  // --- UNFOLDED (full) view ---
  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={`relative w-[140px] shrink-0 rounded-2xl flex flex-col overflow-hidden transition-all duration-300 ease-out ${
        selected
          ? 'ring-0'
          : 'bg-white/[0.05] ring-1 ring-white/[0.1] hover:bg-white/[0.08] hover:ring-white/[0.15]'
      } ${dragActive ? 'opacity-40 scale-95' : ''}`}
      style={stripStyle}
    >
      <div className="absolute inset-y-0 left-0 w-1 opacity-80" style={{ backgroundColor: trackColor }} />
      <div
        className={`h-12 px-2 border-b border-white/[0.035] flex items-center gap-2 ${isMaster ? 'bg-accent/[0.12]' : 'bg-black/20'}`}
        onDoubleClick={e => { e.stopPropagation(); setFolded(true) }}
        title="Double-click to collapse"
      >
        {!isMaster && (
          <span
            draggable={!locked}
            onDragStart={(event) => {
              event.stopPropagation()
              onDragStart?.()
            }}
            className={`shrink-0 ${locked ? 'cursor-not-allowed text-amber-400/45' : 'cursor-grab active:cursor-grabbing text-white/12'}`}
            title={locked ? 'Track locked' : 'Drag to reorder'}
          >
            {locked ? <IconLock size={12} /> : <IconGripVertical size={12} />}
          </span>
        )}
        <Icon size={14} className={selected || isMaster ? '' : 'text-white/28'} style={selected || isMaster ? { color: trackColor } : undefined} />
        <span className="min-w-0 truncate text-[10px] font-black uppercase tracking-tight text-white/55">
          {source.label || source.name}
        </span>
      </div>

      <div className="flex-1 min-h-0 py-3 pr-3 pl-5 flex gap-3 overflow-hidden">
        <StereoMeter id={source.id} meter={meter} muted={source.muted} />
        <div className="flex-1 flex flex-col items-center gap-2 min-h-0">
          <div className="shrink-0">
            <PanControl value={source.pan || 0} onChange={pan => onUpdate({ pan })} />
          </div>
          {!isMaster && (
            <button
              onClick={event => {
                event.stopPropagation()
                const current = sanitizeChannelMode(source.channelMode, source.type === 'mic' ? 'mono' : 'stereo')
                onUpdate({ channelMode: current === 'mono' ? 'stereo' : 'mono' })
              }}
              className={`h-6 w-full rounded-md ring-1 text-[8px] font-black uppercase tracking-widest transition-all ${
                sanitizeChannelMode(source.channelMode, source.type === 'mic' ? 'mono' : 'stereo') === 'mono'
                  ? 'bg-accent/12 ring-accent/25 text-accent'
                  : 'bg-white/[0.03] ring-white/[0.06] text-white/28 hover:text-white/50'
              }`}
              title="Toggle mono/stereo"
            >
              {sanitizeChannelMode(source.channelMode, source.type === 'mic' ? 'mono' : 'stereo') === 'mono' ? 'Mono' : 'Stereo'}
            </button>
          )}
          <div className="relative flex-1 w-full min-h-[40px] flex items-center justify-center overflow-hidden" ref={trackRef}>
            <div className="absolute inset-y-1 left-1/2 -translate-x-1/2 w-1 rounded-full bg-black/60 border border-white/[0.04]" />
            <div className="absolute inset-y-2 left-0 flex flex-col w-full h-full pointer-events-none opacity-40">
              {VOLUME_MARKS.map(mark => {
                const percent = (mark.db + 60) / 66 * 100
                return (
                  <span
                    key={mark.label}
                    className="absolute left-0 text-[5px] font-black text-white/40 -translate-y-1/2"
                    style={{ bottom: `${percent}%` }}
                  >
                    {mark.label}
                  </span>
                )
              })}
            </div>
            <input
              aria-label={`${source.name} volume`}
              type="range"
              min={-60}
              max={6}
              step={0.1}
              value={linearToDb(source.volume)}
              onChange={event => onUpdate({ volume: dbToLinear(Number(event.target.value)) })}
              onContextMenu={e => { e.preventDefault(); onUpdate({ volume: 1.0 }) }}
              onPointerDown={event => {
                event.stopPropagation()
                useStudioStore.getState().saveHistory()
              }}
              onDragStart={event => event.preventDefault()}
              className="absolute h-8 rotate-[-90deg] cursor-ns-resize accent-accent origin-center hover:scale-x-110 transition-transform"
              style={{ width: `${trackHeight - 8}px` }}
            />
          </div>
          <div className="shrink-0 flex flex-col items-center gap-1.5 pb-1">
            <span className={`text-[10px] font-black tabular-nums tracking-tighter ${selected ? 'text-accent' : 'text-white/35'}`}>
              {db <= -59.5 ? '-inf' : `${db > 0.5 ? '+' : ''}${Math.round(db)}`} dB
            </span>
            {!isMaster && (
              <span className={`w-full rounded-md ring-1 ring-white/5 px-1.5 py-0.5 text-center text-[7px] font-black uppercase tracking-tight ${getStatusClasses(status)}`}>
                {status.label}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="h-12 px-3 border-t border-white/[0.035] bg-[#090909] flex items-center gap-2 relative z-10 shadow-[0_-4px_12px_rgba(0,0,0,0.5)]">
        <button
          onClick={event => { event.stopPropagation(); onUpdate({ monitoring: !source.monitoring }) }}
          className={`flex-1 h-8 rounded-lg ring-1 ring-white/5 flex items-center justify-center transition-all ${source.monitoring ? 'bg-accent/15 ring-accent/35 text-accent' : 'bg-white/[0.03] text-white/20 hover:text-white/45'}`}
          title="Monitor"
        >
          <IconHeadphones size={14} />
        </button>
        <button
          onClick={event => { event.stopPropagation(); onUpdate({ muted: !source.muted }) }}
          className={`flex-1 h-8 rounded-lg ring-1 ring-white/5 flex items-center justify-center transition-all ${source.muted ? 'bg-red-500/15 ring-red-500/35 text-red-300' : 'bg-white/[0.03] text-white/20 hover:text-white/45'}`}
          title="Mute"
        >
          {source.muted ? <IconVolumeOff size={14} /> : <IconVolume size={14} />}
        </button>
      </div>
    </div>
  )
}

function StereoMeter({ id, meter, muted }: { id: string; meter: MeterFrame; muted: boolean }) {
  return (
    <div className="w-6 h-full flex gap-1 shrink-0" style={{ marginLeft: 8 }}>
      {(['left', 'right'] as const).map((side, i) => {
        const linearLevel = muted ? 0 : meter[side]
        const db = linearLevel <= 0.001 ? -60 : 20 * Math.log10(linearLevel)
        const percent = Math.max(0, (db + 60) / 60) * 100
        
        return (
          <div key={side} className="flex-1 rounded-md bg-black/75 border border-white/[0.04] relative overflow-hidden">
            <div
              className={`absolute inset-0 bg-gradient-to-t from-emerald-500 via-lime-400 to-red-400 ${i === 0 ? `meter-clip-l-${id}` : `meter-clip-r-${id}`}`}
              style={{ clipPath: `inset(${100 - percent}% 0 0 0)` }}
            />
            <div className="absolute inset-0 pointer-events-none">
              {[-6, -12, -24].map(tick => (
                <div 
                  key={tick}
                  className="absolute inset-x-0 h-px bg-black/40"
                  style={{ bottom: `${((tick + 60) / 60) * 100}%` }}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function PanControl({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const rotation = value * 130
  const [isDragging, setIsDragging] = useState(false)
  const startY = useRef(0)
  const startVal = useRef(0)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setIsDragging(true)
    startY.current = e.clientY
    startVal.current = value
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return
    const delta = startY.current - e.clientY
    const next = Math.max(-1, Math.min(1, startVal.current + delta * 0.01))
    onChange(next)
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch (err) {}
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const menuItems: ContextMenuItem[] = [
    { id: 'reset', label: 'Reset to Center', icon: <IconActivity size={14} />, onClick: () => onChange(0) },
    { id: 'input', label: 'Enter Value (-1 to 1)', icon: <IconPlus size={14} />, onClick: () => setIsEditing(true) }
  ]

  return (
    <div className="flex flex-col items-center gap-1">
      <div 
        className="relative w-8 h-8 rounded-full bg-black ring-1 ring-white/[0.08] shadow-inner cursor-ns-resize group"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onContextMenu={handleContextMenu}
        title="Drag to pan, Right-click for options"
      >
        <div
          className="absolute left-1/2 top-1.5 w-0.5 h-3 rounded-full bg-accent origin-[50%_10px] transition-transform duration-75"
          style={{ transform: `translateX(-50%) rotate(${rotation}deg)` }}
        />
        {/* Visual ring */}
        <div className="absolute inset-0 rounded-full border border-accent/0 group-hover:border-accent/20 transition-colors" />
      </div>
      {isEditing ? (
        <input
          autoFocus
          type="number"
          step="0.1"
          className="w-12 bg-black border border-accent/50 text-[8px] text-accent px-1 rounded text-center"
          defaultValue={value}
          onBlur={e => {
            setIsEditing(false)
            onChange(Math.max(-1, Math.min(1, Number(e.target.value))))
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              setIsEditing(false)
              onChange(Math.max(-1, Math.min(1, Number((e.target as HTMLInputElement).value))))
            }
          }}
        />
      ) : (
        <span className="text-[7px] font-black uppercase tracking-widest text-white/20">{formatPan(value)}</span>
      )}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={menuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}

function InspectorToggle({ active, label, icon: Icon, onClick }: {
  active: boolean
  label: string
  icon: typeof IconVolume
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`h-11 rounded-xl border flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all px-2 overflow-hidden ${
        active ? 'bg-accent/13 border-accent/30 text-accent shadow-[0_0_15px_rgba(var(--accent-rgb),0.1)]' : 'bg-white/[0.025] border-white/[0.07] text-white/25 hover:text-white/50'
      }`}
    >
      <Icon size={14} className="shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  )
}

function HeaderLabel({ icon: Icon, label }: { icon: typeof IconActivity; label: string }) {
  return (
    <div className="flex items-center gap-2 text-white/50 mb-3">
      <Icon size={15} className="text-accent/75" />
      <span className="text-[10px] font-black uppercase tracking-[0.24em]">{label}</span>
    </div>
  )
}

function Knob({ label, value, min, max, display, onChange, compact }: {
  label: string
  value: number
  min: number
  max: number
  display: string
  onChange: (value: number) => void
  compact?: boolean
}) {
  const normalized = (value - min) / (max - min)
  const rotation = -135 + normalized * 270
  const [isDragging, setIsDragging] = useState(false)
  const startY = useRef(0)
  const startVal = useRef(0)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    useStudioStore.getState().saveHistory()
    setIsDragging(true)
    startY.current = e.clientY
    startVal.current = value
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return
    const delta = startY.current - e.clientY
    const range = max - min
    const step = range / 200 // 200 pixels for full range
    const next = Math.max(min, Math.min(max, startVal.current + delta * step))
    onChange(next)
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch (err) {}
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const menuItems: ContextMenuItem[] = [
    { id: 'reset', label: 'Reset to Default', icon: <IconActivity size={14} />, onClick: () => onChange(label === 'Pan' ? 0 : label === 'Trim' ? 1.0 : 0) },
    { id: 'input', label: 'Enter Specific Value', icon: <IconPlus size={14} />, onClick: () => setIsEditing(true) }
  ]

  return (
    <div className="rounded-xl bg-white/[0.025] ring-1 ring-white/[0.065] p-4 transition-[background-color,ring-color] duration-200 ease-out">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-black uppercase tracking-widest text-white/35">{label}</span>
        {isEditing ? (
          <input
            autoFocus
            type="number"
            className="w-16 bg-black border border-accent/50 text-[10px] text-accent px-1 rounded"
            defaultValue={value}
            onBlur={e => {
              setIsEditing(false)
              onChange(Number(e.target.value))
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                setIsEditing(false)
                onChange(Number((e.target as HTMLInputElement).value))
              }
            }}
          />
        ) : (
          <span className="text-[10px] font-black text-accent">{display}</span>
        )}
      </div>
      <div className={`flex items-center gap-4 ${compact ? 'flex-col' : ''}`}>
        <div 
          className="relative w-14 h-14 rounded-full bg-black border border-white/[0.08] shadow-inner cursor-ns-resize group shrink-0"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onContextMenu={handleContextMenu}
          title="Drag to adjust, Right-click for options"
        >
          {/* Track background */}
          <svg className="absolute inset-0 w-full h-full -rotate-90 overflow-visible pointer-events-none">
            <circle
              cx="28" cy="28" r="22"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeDasharray="104 138"
              strokeLinecap="round"
              className="opacity-[0.03]"
              style={{ transformOrigin: 'center', transform: 'rotate(-135deg)' }}
            />
            <circle
              cx="28" cy="28" r="22"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray={`${normalized * 104} 138`}
              strokeLinecap="round"
              className="text-accent shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]"
              style={{ transformOrigin: 'center', transform: 'rotate(-135deg)', transition: 'stroke-dasharray 0.1s cubic-bezier(0.4, 0, 0.2, 1)' }}
            />
          </svg>
          <div
            className="absolute left-1/2 top-2 w-1 h-5 rounded-full bg-accent origin-[50%_20px] shadow-[0_0_12px_rgba(var(--accent-rgb),0.8)] transition-transform duration-100 ease-out"
            style={{ transform: `translateX(-50%) rotate(${rotation}deg)` }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={0.01}
          value={value}
          onChange={event => onChange(Number(event.target.value))}
          className={`accent-accent ${compact ? 'w-full' : 'flex-1'}`}
        />
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={menuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}

function FxCard({ fx, index, onToggle, onRemove, onParam }: {
  fx: { id: string; type: string; params: Record<string, number>; enabled: boolean }
  index: number
  onToggle: () => void
  onRemove: () => void
  onParam: (key: string, value: number) => void
}) {
  const preset = FX_PRESETS.find(item => item.type === fx.type)
  const params = fx.params || {}
  return (
    <div className={`rounded-2xl ring-1 p-6 transition-all duration-400 ${fx.enabled ? 'bg-white/[0.06] ring-white/[0.15] shadow-2xl' : 'bg-white/[0.02] ring-white/[0.06] opacity-30'}`}>
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-black text-white/20 tabular-nums leading-none mb-1.5">{String(index + 1).padStart(2, '0')}</span>
            <div className={`w-1.5 h-6 rounded-full transition-all duration-500 ${fx.enabled ? 'bg-accent shadow-[0_0_12px_rgba(var(--accent-rgb),0.8)]' : 'bg-white/10'}`} />
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-black uppercase tracking-[0.08em] text-white/95 truncate">{preset?.label || fx.type}</div>
            <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-accent/40">Insert Node</div>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-black/50 p-1.5 rounded-xl border border-white/10">
          <button onClick={onToggle} className={`h-9 w-9 flex items-center justify-center rounded-lg transition-all ${fx.enabled ? 'bg-accent/25 text-accent shadow-inner' : 'text-white/20 hover:text-white/40'}`} title="Toggle Bypass">
            <IconPower size={15} />
          </button>
          <button onClick={onRemove} className="h-9 w-9 flex items-center justify-center rounded-lg text-white/20 hover:text-red-400 hover:bg-red-400/20 transition-all" title="Remove Insert">
            <IconTrash size={15} />
          </button>
        </div>
      </div>
      <div className="space-y-4">
        {Object.entries(params).map(([key, value]) => (
          <div key={key} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-[9px] font-black uppercase tracking-widest text-white/35">{key}</span>
              <span className="text-[9px] font-black text-white/50 tabular-nums">{formatParam(key, value)}</span>
            </div>
            <input
              type="range"
              min={getParamRange(key).min}
              max={getParamRange(key).max}
              step={getParamRange(key).step}
              value={value}
              onChange={event => onParam(key, Number(event.target.value))}
              onContextMenu={e => {
                e.preventDefault()
                const defaultValue = preset?.params[key] ?? 0
                onParam(key, defaultValue)
              }}
              className="accent-accent w-full h-1.5 rounded-full bg-white/[0.05] appearance-none cursor-pointer"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function MiniPeak({ id, meter }: { id: string; meter: MeterFrame }) {
  return (
    <div className="w-16 h-11 rounded-lg border border-white/[0.07] bg-black/45 px-2 py-1 flex items-end gap-1.5">
      <div 
        className={`flex-1 rounded-sm bg-accent/70 meter-peak-l-${id}`} 
        style={{ height: `${Math.max(4, meter.left * 100)}%` }} 
      />
      <div 
        className={`flex-1 rounded-sm bg-accent/45 meter-peak-r-${id}`} 
        style={{ height: `${Math.max(4, meter.right * 100)}%` }} 
      />
    </div>
  )
}

function Spectrum({ id }: { id: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * window.devicePixelRatio
      canvas.height = rect.height * window.devicePixelRatio
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  return (
    <div className="h-32 rounded-2xl ring-1 ring-white/5 bg-black/40 overflow-hidden relative group">
      <div className="absolute inset-0 bg-gradient-to-t from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      <canvas 
        id={`spectrum-canvas-${id}`}
        ref={canvasRef}
        className="w-full h-full"
      />
    </div>
  )
}

function getTrackStatuses(
  activeScene: StudioScene,
  videoRefs: React.MutableRefObject<Record<string, HTMLVideoElement>>,
  audioSources: AudioSource[]
): Record<string, AudioTrackStatus> {
  const activeLayerIds = new Set(activeScene.layers.map(layer => layer.id))
  const statuses: Record<string, AudioTrackStatus> = {}

  for (const source of audioSources) {

    if (source.id !== 'soundboard' && source.id !== 'tts-audio' && !activeLayerIds.has(source.id)) {
      statuses[source.id] = { hasStream: false, hasAudio: false, live: false, label: 'Not in scene' }
      continue
    }

    const stream = source.id === 'soundboard'
      ? ((window as any).__soundboardStream as MediaStream | null) || null
      : source.id === 'tts-audio'
        ? audioEngine.getTtsStream()
        : videoRefs.current[source.id]?.srcObject as MediaStream | null
    const audioTracks = stream?.getAudioTracks() || []
    const liveTrack = audioTracks.find(track => track.readyState === 'live')

    if (!stream) {
      statuses[source.id] = { hasStream: false, hasAudio: false, live: false, label: 'Loading' }
    } else if (!audioTracks.length) {
      statuses[source.id] = { hasStream: true, hasAudio: false, live: false, label: 'No audio' }
    } else if (!liveTrack) {
      statuses[source.id] = { hasStream: true, hasAudio: true, live: false, label: 'Track ended' }
    } else if (source.muted) {
      statuses[source.id] = { hasStream: true, hasAudio: true, live: true, label: 'Muted' }
    } else {
      statuses[source.id] = { hasStream: true, hasAudio: true, live: true, label: liveTrack.label ? 'Audio live' : 'Live' }
    }
  }

  return statuses
}

function getStatusClasses(status?: AudioTrackStatus): string {
  if (!status?.hasStream) return 'bg-white/[0.03] border-white/[0.08] text-white/28'
  if (!status.hasAudio) return 'bg-amber-500/10 border-amber-500/25 text-amber-300'
  if (!status.live) return 'bg-red-500/10 border-red-500/25 text-red-300'
  return 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
}

function mixMeters(values: Array<MeterFrame | undefined>): MeterFrame {
  const active = values.filter(Boolean) as MeterFrame[]
  if (!active.length) return { left: 0, right: 0, peak: 0 }
  return {
    left: Math.min(1, active.reduce((sum, meter) => sum + meter.left, 0) / Math.sqrt(active.length)),
    right: Math.min(1, active.reduce((sum, meter) => sum + meter.right, 0) / Math.sqrt(active.length)),
    peak: Math.min(1, Math.max(...active.map(meter => meter.peak)))
  }
}

function getParamRange(key: string): { min: number; max: number; step: number } {
  if (key === 'threshold') return { min: -72, max: 0, step: 1 }
  if (key === 'ratio') return { min: 1, max: 20, step: 0.5 }
  if (key === 'attack') return { min: 0.001, max: 0.1, step: 0.001 }
  if (key === 'release') return { min: 0.02, max: 1, step: 0.01 }
  if (key === 'low' || key === 'mid' || key === 'high') return { min: -24, max: 24, step: 0.5 }
  if (key === 'delay') return { min: 0.04, max: 1, step: 0.01 }
  if (key === 'feedback' || key === 'mix' || key === 'reduction') return { min: 0, max: 0.9, step: 0.01 }
  if (key === 'drive') return { min: 0, max: 60, step: 1 }
  return { min: 0, max: 1, step: 0.01 }
}

function formatParam(key: string, value: number): string {
  if (key === 'threshold') return `${Math.round(value)}`
  if (key === 'ratio') return `${value.toFixed(1)}x`
  if (key === 'attack' || key === 'release' || key === 'delay') return `${Math.round(value * 1000)}ms`
  if (key === 'feedback' || key === 'mix' || key === 'reduction') return `${Math.round(value * 100)}%`
  if (key === 'low' || key === 'mid' || key === 'high') return `${value > 0 ? '+' : ''}${value}`
  return `${Math.round(value)}`
}

function formatPan(value: number): string {
  if (Math.abs(value) < 0.02) return 'C'
  return value < 0 ? `${Math.round(Math.abs(value) * 100)}L` : `${Math.round(value * 100)}R`
}

function linearToDb(value: number): number {
  if (value <= 0.001) return -60
  return Math.max(-60, 20 * Math.log10(value))
}

function dbToLinear(value: number): number {
  if (value <= -60) return 0
  return Math.min(2.0, Math.pow(10, value / 20))
}
