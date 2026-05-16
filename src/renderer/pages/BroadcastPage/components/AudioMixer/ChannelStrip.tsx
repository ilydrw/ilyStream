import React, { useEffect, useRef, useState } from 'react'
import {
  IconGripVertical,
  IconHeadphones,
  IconLock,
  IconMicrophone,
  IconMusic,
  IconPlus,
  IconRadio,
  IconVolume,
  IconVolume2,
  IconVolumeOff,
  IconActivity
} from '@tabler/icons-react'
import { useStudioStore } from '../../../../stores/studio-store'
import type { AudioSource } from '../../../../../shared/studio'
import { ContextMenu, type ContextMenuItem } from '../../../../components/ui/ContextMenu'
import { sanitizeChannelMode } from '../../../../utils/audio-engine'
import {
  linearToDb,
  dbToLinear,
  getTrackColor,
  formatPan,
  getStatusClasses,
  type MeterFrame,
  type AudioTrackStatus
} from './utils'
import { VOLUME_MARKS } from './constants'

export function ChannelStrip({
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
            className={`flex-1 h-7 rounded-lg ring-1 flex items-center justify-center transition-all ${source.monitoring ? 'bg-brand-gradient ring-transparent text-white shadow-glow' : 'bg-white/[0.03] ring-white/5 text-white/20 hover:text-white/45'}`}
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
                  ? 'bg-brand-gradient ring-transparent text-white shadow-glow'
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
          className={`flex-1 h-8 rounded-lg ring-1 flex items-center justify-center transition-all ${source.monitoring ? 'bg-brand-gradient ring-transparent text-white shadow-glow' : 'bg-white/[0.03] ring-white/5 text-white/20 hover:text-white/45'}`}
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
    <div className="w-8 h-full flex flex-col gap-1 shrink-0" style={{ marginLeft: 4 }}>
      {/* Clip Indicators */}
      <div className="h-1.5 flex gap-1 mb-1">
        <div className={`flex-1 rounded-full bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.5)] opacity-0 transition-opacity duration-75 meter-clip-indicator-l-${id}`} />
        <div className={`flex-1 rounded-full bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.5)] opacity-0 transition-opacity duration-75 meter-clip-indicator-r-${id}`} />
      </div>

      <div className="flex-1 flex gap-1">
        {(['left', 'right'] as const).map((side, i) => {
          const linearLevel = muted ? 0 : meter[side]
          const db = linearLevel <= 0.001 ? -60 : 20 * Math.log10(linearLevel)
          const percent = Math.max(0, (db + 60) / 60) * 100

          return (
            <div key={side} className="flex-1 rounded-sm bg-black/80 border border-white/[0.04] relative overflow-hidden group">
              {/* Pro Gradient Meter */}
              <div
                className={`absolute inset-0 bg-gradient-to-t from-[#22c55e] from-60% via-[#eab308] via-85% to-[#ef4444] ${i === 0 ? `meter-clip-l-${id}` : `meter-clip-r-${id}`}`}
                style={{ clipPath: `inset(${100 - percent}% 0 0 0)` }}
              />

              {/* Peak Hold Line */}
              <div
                className={`absolute inset-x-0 h-[2px] bg-white shadow-[0_0_4px_rgba(255,255,255,0.8)] z-10 transition-all duration-300 ease-out ${i === 0 ? `meter-hold-l-${id}` : `meter-hold-r-${id}`}`}
                style={{ top: '100%' }}
              />

              {/* Scale Ticks */}
              <div className="absolute inset-0 pointer-events-none">
                {[-0, -3, -6, -9, -12, -18, -24, -36, -48].map(tick => (
                  <div
                    key={tick}
                    className={`absolute inset-x-0 h-px ${tick >= -6 ? 'bg-black/60' : 'bg-black/30'}`}
                    style={{ bottom: `${((tick + 60) / 60) * 100}%` }}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
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
