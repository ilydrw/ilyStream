import React, { useEffect, useRef, useState } from 'react'
import {
  IconActivity,
  IconGripVertical,
  IconLock
} from '@tabler/icons-react'
import { IconPlus } from '../../../../components/ui/icons'
import { useStudioStore } from '../../../../stores/studio-store'
import type { AudioSource } from '../../../../../shared/studio'
import { ContextMenu, type ContextMenuItem } from '../../../../components/ui/ContextMenu'
import { sanitizeChannelMode } from '../../../../utils/audio-engine'
import {
  dbToLinear,
  formatPan,
  getStatusClasses,
  getTrackColor,
  linearToDb,
  type AudioTrackStatus,
  type MeterFrame
} from './utils'

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
  // Design (page-broadcast-parts.jsx) does not render a per-channel type icon
  // in the name row — just centered text. Type signal moved to the source
  // label below; visual emphasis on the name itself matches the design.
  const db = linearToDb(source.volume)
  const trackColor = getTrackColor(source)
  const [trackHeight, setTrackHeight] = useState(168)
  const trackRef = useRef<HTMLDivElement>(null)
  const displayName = source.label || source.name
  const channelMode = sanitizeChannelMode(source.channelMode, source.type === 'mic' ? 'mono' : 'stereo')
  const sourceLabel = isMaster ? 'Stream' : source.name !== displayName ? source.name : source.type
  const dbText = db <= -59.5 ? '-inf' : `${db > 0.05 ? '+' : ''}${db.toFixed(1)}`
  const stripStyle = {
    '--track-color': trackColor,
    backfaceVisibility: 'hidden',
    transform: dragActive ? 'translateZ(0) scale(0.96)' : 'translateZ(0)'
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

  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={`pro-channel-strip ${selected ? 'is-selected' : ''} ${isMaster ? 'is-master' : ''} ${dragActive ? 'is-dragging' : ''}`}
      style={stripStyle}
    >
      <div className="pro-channel-accent" />

      {/* Single centered name line — exact design match. The drag handle is
          positioned absolutely (see .pro-channel-drag CSS) so it overlays in
          the left margin without breaking the centered text appearance, and
          only fades in on hover/selection. */}
      <div className="pro-channel-name-row" title={displayName}>
        {!isMaster && (
          <span
            draggable={!locked}
            onDragStart={(event) => {
              event.stopPropagation()
              onDragStart?.()
            }}
            className={`pro-channel-drag ${locked ? 'is-locked' : ''}`}
            title={locked ? 'Track locked' : 'Drag to reorder'}
          >
            {locked ? <IconLock size={10} /> : <IconGripVertical size={10} />}
          </span>
        )}
        <span>{displayName}</span>
      </div>

      <div className="pro-channel-pan-row">
        <PanControl value={source.pan || 0} accent={Boolean(isMaster)} onChange={pan => onUpdate({ pan })} />
        {!isMaster && (
          <button
            type="button"
            className="pro-channel-mode"
            title="Toggle mono/stereo"
            onClick={(event) => {
              event.stopPropagation()
              onUpdate({ channelMode: channelMode === 'mono' ? 'stereo' : 'mono' })
            }}
          >
            {channelMode === 'mono' ? 'Mono' : 'Stereo'}
          </button>
        )}
      </div>

      <div className={`pro-channel-db ${db > -1 ? 'is-hot' : db > -6 ? 'is-warm' : ''}`}>
        <span>{dbText}</span>
        <small>dB</small>
      </div>

      <div className="pro-channel-fader-zone">
        <div className="pro-channel-fader" ref={trackRef}>
          <div className="pro-channel-fader-track">
            {[0, 0.24, 0.5, 0.76, 1].map((mark, index) => (
              <span key={index} style={{ top: `${mark * 100}%` }} className={index === 1 ? 'is-unity' : ''} />
            ))}
          </div>
          {/* Visible thumb — design pixel match. Position derived from the
              current db value over the same -60..+6 range as the input. The
              top of the track is db=+6, the bottom is db=-60 (because the
              input is rotated -90deg, so its "left" becomes screen-bottom).
              The thumb is centered on the computed Y so the grip rungs sit
              at the correct height for the current value. */}
          <div
            className="pro-channel-fader-thumb"
            style={{ top: `${((6 - db) / 66) * 100}%` }}
            aria-hidden="true"
          >
            <div className="pro-channel-fader-thumb-grip" />
            <div className="pro-channel-fader-thumb-grip is-accent" />
            <div className="pro-channel-fader-thumb-grip" />
          </div>
          <input
            aria-label={`${source.name} volume`}
            type="range"
            min={-60}
            max={6}
            step={0.1}
            value={linearToDb(source.volume)}
            onChange={event => onUpdate({ volume: dbToLinear(Number(event.target.value)) })}
            onContextMenu={event => {
              event.preventDefault()
              onUpdate({ volume: 1.0 })
            }}
            onPointerDown={event => {
              event.stopPropagation()
              useStudioStore.getState().saveHistory()
            }}
            onDragStart={event => event.preventDefault()}
            className="pro-channel-fader-input"
            style={{ width: `${Math.max(120, trackHeight - 8)}px` }}
          />
        </div>

        <StereoMeter id={source.id} meter={meter} muted={source.muted} />
      </div>

      <div className="pro-channel-button-row">
        <button
          type="button"
          className={source.muted ? 'is-muted' : ''}
          onClick={event => {
            event.stopPropagation()
            onUpdate({ muted: !source.muted })
          }}
          title="Mute"
        >
          M
        </button>
        <button
          type="button"
          className={source.monitoring ? 'is-solo' : ''}
          onClick={event => {
            event.stopPropagation()
            onUpdate({ monitoring: !source.monitoring })
          }}
          title="Monitor"
        >
          S
        </button>
      </div>

      <div className="pro-channel-source" title={status?.label || sourceLabel}>
        <span>{sourceLabel}</span>
        {!isMaster && (
          <em className={getStatusClasses(status)}>
            {status?.label || 'No stream'}
          </em>
        )}
      </div>
    </div>
  )
}

function StereoMeter({ id, meter, muted }: { id: string; meter: MeterFrame; muted: boolean }) {
  return (
    <div className="pro-meter" aria-hidden="true">
      <div className="pro-meter-clips">
        <span className={`meter-clip-indicator-l-${id}`} />
        <span className={`meter-clip-indicator-r-${id}`} />
      </div>
      <div className="pro-meter-bars">
        {(['left', 'right'] as const).map((side) => {
          const linearLevel = muted ? 0 : meter[side]
          const db = linearLevel <= 0.001 ? -60 : 20 * Math.log10(linearLevel)
          const percent = Math.max(0, (db + 60) / 60) * 100
          const suffix = side === 'left' ? 'l' : 'r'

          return (
            <div key={side} className="pro-meter-bar">
              <div
                className={`pro-meter-peak meter-peak-${suffix}-${id}`}
                style={{ height: `${Math.max(4, linearLevel * 100)}%` }}
              />
              <div
                className={`pro-meter-fill meter-clip-${suffix}-${id}`}
                style={{ clipPath: `inset(${100 - percent}% 0 0 0)` }}
              />
              <div className={`pro-meter-hold meter-hold-${suffix}-${id}`} style={{ top: '100%' }} />
              <div className="pro-meter-ticks">
                {[-3, -6, -12, -24, -48].map(tick => (
                  <span key={tick} style={{ bottom: `${((tick + 60) / 60) * 100}%` }} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PanControl({ value, accent, onChange }: { value: number; accent: boolean; onChange: (value: number) => void }) {
  const rotation = value * 130
  const [isDragging, setIsDragging] = useState(false)
  const startY = useRef(0)
  const startVal = useRef(0)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  const handlePointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setIsDragging(true)
    startY.current = event.clientY
    startVal.current = value
  }

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!isDragging) return
    const delta = startY.current - event.clientY
    onChange(Math.max(-1, Math.min(1, startVal.current + delta * 0.01)))
  }

  const handlePointerUp = (event: React.PointerEvent) => {
    setIsDragging(false)
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {}
  }

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({ x: event.clientX, y: event.clientY })
  }

  const menuItems: ContextMenuItem[] = [
    { id: 'reset', label: 'Reset to Center', icon: <IconActivity size={14} />, onClick: () => onChange(0) },
    { id: 'input', label: 'Enter Value (-1 to 1)', icon: <IconPlus size={14} />, onClick: () => setIsEditing(true) }
  ]

  return (
    <div className="pro-pan">
      <div
        className={`pro-pan-knob ${accent ? 'is-accent' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onContextMenu={handleContextMenu}
        title="Drag to pan, right-click for options"
      >
        <span style={{ transform: `translateX(-50%) rotate(${rotation}deg)` }} />
      </div>
      {isEditing ? (
        <input
          autoFocus
          type="number"
          step="0.1"
          className="pro-pan-input"
          defaultValue={value}
          onBlur={event => {
            setIsEditing(false)
            onChange(Math.max(-1, Math.min(1, Number(event.target.value))))
          }}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              setIsEditing(false)
              onChange(Math.max(-1, Math.min(1, Number((event.target as HTMLInputElement).value))))
            }
          }}
        />
      ) : (
        <span className="pro-pan-label">{formatPan(value)}</span>
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
