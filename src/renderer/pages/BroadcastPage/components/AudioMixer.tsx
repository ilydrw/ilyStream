import React from 'react'
import {
  IconActivity,
  IconAdjustmentsHorizontal
} from '@tabler/icons-react'
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

  return (
    <div className="relative flex h-full min-h-0 bg-[#030303] text-white overflow-hidden select-none">
      <section className="flex-1 min-w-0 flex flex-col">
        <div className="h-12 shrink-0 px-5 border-b border-white/[0.06] flex items-center justify-between bg-[#070707]">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-lg bg-accent/12 border border-accent/25 text-accent flex items-center justify-center">
              <IconAdjustmentsHorizontal size={15} />
            </div>
            <div>
              <div className="text-sm font-black uppercase tracking-[0.26em] text-white/55">Audio Console</div>
              <div className="text-2xs font-bold uppercase tracking-[0.18em] text-white/18">Program mix, monitor mix, inserts</div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-2xs font-black uppercase tracking-[0.18em] text-white/25">
            <IconActivity size={13} className="text-accent" />
              48 kHz stereo engine
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-x-auto custom-scrollbar-horizontal">
          <div className="h-full flex items-stretch gap-3 p-4">
            <ChannelStrip
              source={logic.masterBus}
              meter={logic.meters.master || logic.mixMeters(logic.audioSources.map(source => logic.meters[source.id]))}
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

            <div className="w-px shrink-0 bg-white/[0.07] my-3" />

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
