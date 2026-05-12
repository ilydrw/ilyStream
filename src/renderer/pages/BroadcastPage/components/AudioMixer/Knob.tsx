import React, { useRef, useState } from 'react'
import { IconActivity, IconPlus } from '@tabler/icons-react'
import { ContextMenu, type ContextMenuItem } from '../../../../components/ui/ContextMenu'
import { useStudioStore } from '../../../../stores/studio-store'

export function Knob({ label, value, min, max, display, onChange, compact }: {
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
