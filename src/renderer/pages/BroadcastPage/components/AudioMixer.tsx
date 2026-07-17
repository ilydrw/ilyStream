import React, { useMemo, useState } from 'react'
import { IconAdjustmentsHorizontal } from '@tabler/icons-react'
import { IconChevronRight } from '../../../components/ui/icons'
import type { StudioScene } from '../../../../shared/studio'
import { ContextMenu } from '../../../components/ui/ContextMenu'
import { ChannelStrip } from './AudioMixer/ChannelStrip'
import { MixerInspector } from './AudioMixer/MixerInspector'
import { MiniPeak } from './AudioMixer/Visualizers'
import { useAudioMixerLogic } from './AudioMixer/useAudioMixerLogic'

interface Props {
  activeScene: StudioScene
  videoRefs: React.MutableRefObject<Record<string, HTMLVideoElement>>
  devices: MediaDeviceInfo[]
  streamReady?: number
  dockCollapsed?: boolean
  onToggleDockCollapse?: () => void
}

export const AudioMixer: React.FC<Props> = ({ activeScene, videoRefs, devices, streamReady = 0, dockCollapsed, onToggleDockCollapse }) => {
  const logic = useAudioMixerLogic(activeScene, videoRefs, devices, streamReady)
  const [mixerMode, setMixerMode] = useState<'mix' | 'fx' | 'send'>('mix')
  const [collapsedTracks, setCollapsedTracks] = useState<Set<string>>(() => new Set())
  const channelCount = logic.audioSources.length + 1
  const masterMeter = logic.meters.master || logic.mixMeters(logic.audioSources.map(source => logic.meters[source.id]))
  const toggleCollapsedTrack = (id: string) => {
    setCollapsedTracks(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const trackMenuBuilders = useMemo(() => ({
    collapsed: collapsedTracks,
    toggle: toggleCollapsedTrack
  }), [collapsedTracks])

  return (
    <div className="pro-mixer-root relative flex h-full min-h-0 overflow-hidden select-none">
      {/* Master meter + dock collapse live in ONE flex row so they can never
          overlap. Kept inside the top 48px band so both stay visible (and the
          meter keeps running) while the dock is collapsed. */}
      <div className="absolute right-6 top-0 z-[120] flex h-12 items-center gap-3">
        <MiniPeak id="master" meter={masterMeter} />
        {onToggleDockCollapse && (
          <button
            onClick={onToggleDockCollapse}
            className="broadcast-mixer-collapse"
            title={dockCollapsed ? 'Expand mixer' : 'Collapse mixer'}
          >
            <IconChevronRight className={dockCollapsed ? '-rotate-90' : 'rotate-90'} size={16} />
          </button>
        )}
      </div>

      <section className="pro-mixer-main flex-1 min-w-0 flex flex-col">
        <div className="pro-mixer-head">
          <div className="pro-mixer-title">
            <IconAdjustmentsHorizontal size={14} />
            <span>Mixer</span>
            <span className="pro-mixer-count">{channelCount} ch</span>
          </div>
          <div className="pro-mixer-tools">
            {/* Engine readout — bullet-separator + mono text matches the
                design's page-broadcast.jsx mixer head exactly. The leading
                Activity icon from the prior version was a non-design addition. */}
            <span className="pro-mixer-engine" title="Target loudness for stream-safe output. LUFS measures perceived loudness over time.">
              Target −14 LUFS · 48 kHz · stereo
            </span>
            <div className="pro-mixer-segment" aria-label="Mixer mode">
              {(['mix', 'fx', 'send'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  className={mixerMode === mode ? 'is-active' : ''}
                  onClick={() => setMixerMode(mode)}
                >
                  {mode === 'mix' ? 'Mix' : mode === 'fx' ? 'FX' : 'Send'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="pro-mixer-scroll flex-1 min-h-0 overflow-x-auto custom-scrollbar-horizontal">
          <div className="pro-mixer-strip-row h-full flex">
            {logic.audioSources.map((source, index) => (
              <ChannelStrip
                key={source.id}
                source={source}
                meter={logic.meters[source.id] || { left: 0, right: 0, peak: 0 }}
                status={logic.trackStatuses[source.id] || { hasStream: false, hasAudio: false, live: false, label: 'No stream' }}
                selected={logic.selectedSource.id === source.id}
                collapsed={collapsedTracks.has(source.id)}
                locked={logic.getTrackLocked(source)}
                dragActive={logic.dragIndex === index}
                onSelect={() => logic.setSelectedAudioSource(source.id)}
                onToggleCollapse={() => toggleCollapsedTrack(source.id)}
                onUpdate={updates => logic.updateSource(source.id, updates)}
                onDragStart={() => logic.setDragIndex(index)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => logic.handleDrop(index)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  logic.setSelectedAudioSource(source.id)
                  logic.setContextMenu({ x: event.clientX, y: event.clientY, source })
                }}
              />
            ))}

            <div className="pro-mixer-divider" />

            <ChannelStrip
              source={logic.masterBus}
              meter={masterMeter}
              status={logic.trackStatuses.master || { hasStream: true, hasAudio: true, live: true, label: 'Master' }}
              selected={logic.selectedSource.id === 'master'}
              collapsed={collapsedTracks.has('master')}
              isMaster
              onSelect={() => logic.setSelectedAudioSource('master')}
              onToggleCollapse={() => toggleCollapsedTrack('master')}
              onUpdate={updates => logic.updateSource('master', updates)}
              onContextMenu={(event) => {
                event.preventDefault()
                event.stopPropagation()
                logic.setSelectedAudioSource('master')
                logic.setContextMenu({ x: event.clientX, y: event.clientY, source: logic.masterBus })
              }}
            />
          </div>
        </div>
      </section>

      {logic.selectedSource && (
        <MixerInspector
          selectedSource={logic.selectedSource}
          mode={mixerMode}
          trackStatuses={logic.trackStatuses}
          sidebarWidth={logic.sidebarWidth}
          setIsResizingSidebar={logic.setIsResizingSidebar}
          updateSource={logic.updateSource}
          removeMixerTrack={logic.removeMixerTrack}
          getTrackLocked={logic.getTrackLocked}
          addFx={logic.addFx}
          updateFx={logic.updateFx}
          removeFx={logic.removeFx}
          updateFxParam={logic.updateFxParam}
        />
      )}

      {logic.contextMenu && (
        <ContextMenu
          x={logic.contextMenu.x}
          y={logic.contextMenu.y}
          items={[
            {
              id: 'collapse',
              label: trackMenuBuilders.collapsed.has(logic.contextMenu.source.id) ? 'Expand Track' : 'Collapse Track',
              onClick: () => trackMenuBuilders.toggle(logic.contextMenu!.source.id)
            },
            { id: 'collapse-divider', label: '', divider: true },
            ...logic.buildTrackMenu(logic.contextMenu.source)
          ]}
          onClose={() => logic.setContextMenu(null)}
        />
      )}
    </div>
  )
}
