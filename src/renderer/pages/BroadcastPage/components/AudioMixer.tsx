import React from 'react'
import { IconAdjustmentsHorizontal } from '@tabler/icons-react'
import type { StudioScene } from '../../../../shared/studio'
import { ContextMenu } from '../../../components/ui/ContextMenu'
import { ChannelStrip } from './AudioMixer/ChannelStrip'
import { MixerInspector } from './AudioMixer/MixerInspector'
import { useAudioMixerLogic } from './AudioMixer/useAudioMixerLogic'

interface Props {
  activeScene: StudioScene
  videoRefs: React.MutableRefObject<Record<string, HTMLVideoElement>>
  devices: MediaDeviceInfo[]
  streamReady?: number
}

export const AudioMixer: React.FC<Props> = ({ activeScene, videoRefs, devices, streamReady = 0 }) => {
  const logic = useAudioMixerLogic(activeScene, videoRefs, devices, streamReady)
  const channelCount = logic.audioSources.length + 1
  const masterMeter = logic.meters.master || logic.mixMeters(logic.audioSources.map(source => logic.meters[source.id]))

  return (
    <div className="pro-mixer-root relative flex h-full min-h-0 text-white overflow-hidden select-none">
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
            <span className="pro-mixer-engine">
              −14 LUFS · 48 kHz · stereo
            </span>
            <div className="pro-mixer-segment" aria-label="Mixer mode">
              <button type="button" className="is-active">Mix</button>
              <button type="button">FX</button>
              <button type="button">Send</button>
            </div>
          </div>
        </div>

        <div className="pro-mixer-scroll flex-1 min-h-0 overflow-x-auto custom-scrollbar-horizontal">
          {/* `items-start` (was `items-stretch`) so strips render at their
              natural ~360px height instead of stretching to fill the dock.
              The design (page-broadcast.jsx) doesn't pin strips to the dock
              height — when the dock is taller, empty space appears below the
              strips rather than the strips growing past their fader zone. */}
          <div className="pro-mixer-strip-row h-full flex items-start">
            {logic.audioSources.map((source, index) => (
              <ChannelStrip
                key={source.id}
                source={source}
                meter={logic.meters[source.id] || { left: 0, right: 0, peak: 0 }}
                status={logic.trackStatuses[source.id] || { hasStream: false, hasAudio: false, live: false, label: 'No stream' }}
                selected={logic.selectedSource.id === source.id}
                locked={logic.getTrackLocked(source)}
                dragActive={logic.dragIndex === index}
                onSelect={() => logic.setSelectedAudioSource(source.id)}
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
              isMaster
              onSelect={() => logic.setSelectedAudioSource('master')}
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
          selectedMeter={logic.selectedMeter}
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
          items={logic.buildTrackMenu(logic.contextMenu.source)}
          onClose={() => logic.setContextMenu(null)}
        />
      )}
    </div>
  )
}
