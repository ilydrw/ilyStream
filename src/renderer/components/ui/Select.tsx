import {IconChevronDown, IconCheck} from '@tabler/icons-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface SelectOption {
  value: string
  label: string
  group?: string
  disabled?: boolean
  icon?: ReactNode
}

interface SelectProps {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  buttonClassName?: string
  prefix?: ReactNode
  /** Maximum height of the dropdown list in px (default 320). */
  maxListHeight?: number
}

/**
 * A custom dropdown that matches the app aesthetic. Avoids native <select>
 * which renders an unstyled white panel in Electron on Windows.
 */
export function Select({
  value,
  options,
  onChange,
  placeholder = 'Select…',
  className = '',
  buttonClassName = '',
  prefix,
  maxListHeight = 320
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState<number>(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selectedIndex = options.findIndex((opt) => opt.value === value)
  const selectedOption = options[selectedIndex]

  // Close on outside click + Escape
  useEffect(() => {
    if (!open) return

    const handleMouseDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  // When opening, scroll the active item into view
  useEffect(() => {
    if (!open) return
    setHighlight(selectedIndex >= 0 ? selectedIndex : 0)
    requestAnimationFrame(() => {
      const list = listRef.current
      if (!list) return
      const active = list.querySelector<HTMLElement>('[data-active="true"]')
      active?.scrollIntoView({ block: 'nearest' })
    })
  }, [open, selectedIndex])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      if (!open) {
        event.preventDefault()
        setOpen(true)
        return
      }
    }

    if (!open) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlight((h) => Math.min(options.length - 1, h + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((h) => Math.max(0, h - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const opt = options[highlight]
      if (opt && !opt.disabled) {
        onChange(opt.value)
        setOpen(false)
      }
    }
  }

  // Group the options preserving original order
  const grouped: { group?: string; items: { option: SelectOption; index: number }[] }[] = []
  options.forEach((option, index) => {
    const lastGroup = grouped[grouped.length - 1]
    if (lastGroup && lastGroup.group === option.group) {
      lastGroup.items.push({ option, index })
    } else {
      grouped.push({ group: option.group, items: [{ option, index }] })
    }
  })

  return (
    <div ref={containerRef} className={`relative ${className} ${open ? 'z-[100]' : 'z-auto'}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`app-select w-full flex items-center justify-between gap-3 ${buttonClassName}`}
      >
        <span className="flex items-center gap-2 min-w-0 flex-1 text-left">
          {prefix}
          <span className={`truncate ${selectedOption ? 'text-white' : 'text-white/40'}`}>
            {selectedOption?.label ?? placeholder}
          </span>
        </span>
        <IconChevronDown
          size={16}
          className={`shrink-0 text-white/40 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          className="absolute z-50 left-0 right-0 mt-2 rounded-xl border border-white/10 bg-[#0f1216]/95 backdrop-blur-xl shadow-2xl overflow-y-auto custom-scrollbar ring-1 ring-white/5 animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-150"
          style={{ maxHeight: maxListHeight }}
        >
          {grouped.map((section, groupIndex) => (
            <div key={`grp-${groupIndex}`}>
              {section.group && (
                <div className="px-3 pt-3 pb-1 text-[10px] font-black uppercase tracking-widest text-white/30">
                  {section.group}
                </div>
              )}
              {section.items.map(({ option, index }) => {
                const isActive = option.value === value
                const isHighlighted = index === highlight
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    data-active={isHighlighted}
                    disabled={option.disabled}
                    onClick={() => {
                      if (option.disabled) return
                      onChange(option.value)
                      setOpen(false)
                    }}
                    onMouseEnter={() => setHighlight(index)}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                      option.disabled
                        ? 'text-white/20 cursor-not-allowed'
                        : isActive
                          ? 'bg-white/[0.08] text-white'
                          : isHighlighted
                            ? 'bg-white/[0.04] text-white'
                            : 'text-white/70 hover:bg-white/[0.03] hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      {option.icon}
                      {option.label}
                    </span>
                    {isActive && <IconCheck size={14} className="shrink-0 text-white" />}
                  </button>
                )
              })}
            </div>
          ))}
          {options.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-white/30">No options available.</div>
          )}
        </div>
      )}
    </div>
  )
}
