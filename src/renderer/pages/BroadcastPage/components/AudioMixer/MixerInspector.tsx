import React from 'react'
import {
  IconActivity,
  IconAdjustmentsHorizontal,
  IconHeadphones,
  IconPlus,
  IconRoute,
  IconSparkles,
  IconTrash,
  IconVolume,
  IconVolumeOff,
  IconWaveSine
} from '@tabler/icons-react'
import type { AudioSource } from '../../../../../shared/studio'
import {
  formatPan,
  getStatusClasses,
  linearToDb,
  dbToLinear,
  type MeterFrame,
  type AudioTrackStatus
} from './utils'
import { FX_PRESETS } from './constants'
import { Knob } from './Knob'
import { FxCard } from './FxCard'
import { MiniPeak, Spectrum } from './Visualizers'
import { sanitizeChannelMode } from '../../../../utils/audio-engine'

export function MixerInspector({
  selectedSource,
  selectedMeter,
  trackStatuses,
  sidebarWidth,
  setIsResizingSidebar,
  updateSource,
  removeMixerTrack,
  getTrackLocked,
  addFx,
  updateFx,
  removeFx,
  updateFxParam
}: {
  selectedSource: AudioSource
  selectedMeter: MeterFrame
  trackStatuses: Record<string, AudioTrackStatus>
  sidebarWidth: number
  setIsResizingSidebar: (resizing: boolean) => void
  updateSource: (id: string, updates: Partial<AudioSource>) => void
  removeMixerTrack: (source: AudioSource) => void
  getTrackLocked: (source: AudioSource) => boolean
  addFx: (source: AudioSource, preset: any) => void
  updateFx: (source: AudioSource, fxId: string, updates: any) => void
  removeFx: (source: AudioSource, fxId: string) => void
  updateFxParam: (source: AudioSource, fxId: string, key: string, value: number) => void
}) {
  return (
    <>
      {/* Horizontal Resize Handle */}
      <div
        onPointerDown={(e) => { e.preventDefault(); setIsResizingSidebar(true) }}
        className={`absolute top-0 bottom-0 w-1.5 cursor-ew-resize z-50 transition-colors group ${sidebarWidth < 10 ? 'hidden' : ''}`}
        style={{ right: sidebarWidth - 1 }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-12 rounded-full bg-white/5 group-hover:bg-accent/40 transition-colors" />
      </div>

      <aside
        className="shrink-0 border-l border-white/[0.07] bg-[#080808] flex flex-col min-h-0 relative z-dock shadow-xl"
        style={{ width: sidebarWidth }}
      >
        <div className="p-6 border-b border-white/[0.06] bg-black/20">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-black uppercase tracking-[0.3em] text-accent/80 whitespace-nowrap">Source Configuration</span>
                <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_12px_rgba(var(--accent-rgb),0.9)]" />
              </div>
              <input
                value={selectedSource.label || selectedSource.name}
                onChange={event => updateSource(selectedSource.id, { label: event.target.value })}
                className="w-full bg-transparent text-lg font-black text-white outline-none uppercase tracking-tighter focus:text-accent transition-colors"
                placeholder="Track Label"
              />
              <div className="mt-2 flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-white/5 text-2xs font-bold uppercase tracking-widest text-white/40">{selectedSource.type}</span>
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-white/20 truncate">
                  {selectedSource.name}
                </span>
              </div>
              {selectedSource.id !== 'master' && (
                <div className={`mt-4 inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-black uppercase tracking-widest ${getStatusClasses(trackStatuses[selectedSource.id])}`}>
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
              active={(selectedSource.filters || []).some((fx: any) => fx.enabled)}
              label="Inserts"
              icon={IconSparkles}
              onClick={() => {
                const hasActive = (selectedSource.filters || []).some((fx: any) => fx.enabled)
                updateSource(selectedSource.id, {
                  filters: (selectedSource.filters || []).map((fx: any) => ({ ...fx, enabled: !hasActive }))
                })
              }}
            />

          </div>
          {selectedSource.id !== 'master' && (
            <button
              onClick={() => removeMixerTrack(selectedSource)}
              disabled={getTrackLocked(selectedSource)}
              className="mt-4 h-11 w-full rounded-xl border border-red-500/20 bg-red-500/5 text-red-400/60 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-all flex items-center justify-center gap-2.5 text-xs font-black uppercase tracking-[0.2em]"
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
              <span className="text-2xs font-black uppercase tracking-[0.18em] text-white/22">Master bus</span>
            </div>
            {selectedSource.id !== 'master' && (
              <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-white/[0.025] p-1 ring-1 ring-white/[0.06]">
                {(['mono', 'stereo'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => updateSource(selectedSource.id, { channelMode: mode })}
                    className={`h-9 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                      sanitizeChannelMode(selectedSource.channelMode, selectedSource.type === 'mic' ? 'mono' : 'stereo') === mode
                        ? 'bg-brand-gradient text-white shadow-glow'
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
                className="h-8 rounded-lg bg-white/[0.04] border border-white/[0.07] px-2 text-xs font-bold text-white/50 outline-none [&>option]:bg-[#1a1a1a]"
              >
                <option value="">Add FX</option>
                {FX_PRESETS.map(fx => <option key={fx.type} value={fx.type}>{fx.label}</option>)}
              </select>
            </div>

            <div className="space-y-3">
              {(selectedSource.filters || []).length === 0 ? (
                <div className="h-28 rounded-xl border border-dashed border-white/[0.08] bg-white/[0.015] flex flex-col items-center justify-center gap-2 text-white/20">
                  <IconPlus size={18} />
                  <span className="text-xs font-black uppercase tracking-[0.22em]">No inserts loaded</span>
                </div>
              ) : (
                (selectedSource.filters || []).map((fx: any, index: number) => (
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
  )
}

function InspectorToggle({ active, label, icon: Icon, onClick }: {
  active: boolean
  label: string
  icon: any
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative flex flex-col items-center justify-center gap-2.5 p-4 rounded-2xl border transition-all duration-300 ${
        active
          ? 'bg-brand-gradient border-transparent text-white shadow-glow'
          : 'bg-white/0.02] border-white/[0.05] text-white/25 hover:bg-white/[0.04] hover:border-white/10 hover:text-white/40'
      }`}
    >
      <div className={`p-2 rounded-xl transition-colors ${active ? 'bg-accent/10' : 'bg-white/5 group-hover:bg-white/10'}`}>
        <Icon size={18} />
      </div>
      <span className="text-[9px] font-black uppercase tracking-[0.2em]">{label}</span>
      {active && (
        <div className="absolute top-2 right-2 h-1 w-1 rounded-full bg-accent animate-pulse" />
      )}
    </button>
  )
}

function HeaderLabel({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={14} className="text-accent/60" />
      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">{label}</span>
    </div>
  )
}
