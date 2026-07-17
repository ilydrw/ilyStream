import { IconChevronDown, IconCheck, IconSearch } from './icons'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

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
  searchable?: boolean
  emptyLabel?: string
  disabled?: boolean
  /** Maximum height of the dropdown list in px (default 320). */
  maxListHeight?: number
}

interface MenuPosition {
  left: number
  width: number
  maxListHeight: number
  top?: number
  bottom?: number
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
  searchable,
  emptyLabel = 'No options available.',
  disabled = false,
  maxListHeight = 320
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState<number>(-1)
  const [search, setSearch] = useState('')
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const selectedIndex = options.findIndex((opt) => opt.value === value)
  const selectedOption = options[selectedIndex]
  const shouldSearch = searchable ?? options.length > 12
  const normalizedSearch = search.trim().toLowerCase()
  const visibleOptions = normalizedSearch
    ? options.filter((option) =>
        [option.label, option.group, option.value]
          .filter(Boolean)
          .some((part) => String(part).toLowerCase().includes(normalizedSearch))
      )
    : options
  const visibleSelectedIndex = visibleOptions.findIndex((opt) => opt.value === value)

  // Close on outside click + Escape
  useEffect(() => {
    if (!open) {
      setMenuPosition(null)
      return
    }

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (!containerRef.current?.contains(target) && !listRef.current?.contains(target)) {
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

  useEffect(() => {
    if (!open) return

    const updatePosition = () => {
      const anchor = containerRef.current
      if (!anchor) return

      const rect = anchor.getBoundingClientRect()
      const margin = 8
      const searchHeight = shouldSearch ? 49 : 0
      const spaceBelow = window.innerHeight - rect.bottom - margin
      const spaceAbove = rect.top - margin
      const openUp = spaceBelow < 180 && spaceAbove > spaceBelow
      const available = Math.max(120, openUp ? spaceAbove : spaceBelow)
      const nextMaxListHeight = Math.max(88, Math.min(maxListHeight, available - searchHeight - 6))
      const width = Math.min(rect.width, window.innerWidth - margin * 2)
      const left = Math.min(
        Math.max(margin, rect.left),
        Math.max(margin, window.innerWidth - width - margin)
      )

      setMenuPosition({
        left,
        width,
        maxListHeight: nextMaxListHeight,
        ...(openUp
          ? { bottom: window.innerHeight - rect.top + 4 }
          : { top: rect.bottom + 4 })
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, maxListHeight, shouldSearch])

  // When opening, scroll the active item into view
  useEffect(() => {
    if (!open) return
    setSearch('')
    setHighlight(selectedIndex >= 0 ? selectedIndex : 0)
    requestAnimationFrame(() => {
      if (shouldSearch) searchInputRef.current?.focus()
      const list = listRef.current
      if (!list) return
      const active = list.querySelector<HTMLElement>('[data-active="true"]')
      active?.scrollIntoView({ block: 'nearest' })
    })
  }, [open, selectedIndex, shouldSearch])

  useEffect(() => {
    if (!open) return
    setHighlight((current) => {
      if (visibleOptions.length === 0) return -1
      if (current >= 0 && current < visibleOptions.length) return current
      return visibleSelectedIndex >= 0 ? visibleSelectedIndex : 0
    })
  }, [open, visibleOptions.length, visibleSelectedIndex])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return
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
      setHighlight((h) => Math.min(visibleOptions.length - 1, h + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((h) => Math.max(0, h - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const opt = visibleOptions[highlight]
      if (opt && !opt.disabled) {
        onChange(opt.value)
        setOpen(false)
      }
    }
  }

  // Group the options preserving original order
  const grouped: { group?: string; items: { option: SelectOption; index: number }[] }[] = []
  visibleOptions.forEach((option, index) => {
    const lastGroup = grouped[grouped.length - 1]
    if (lastGroup && lastGroup.group === option.group) {
      lastGroup.items.push({ option, index })
    } else {
      grouped.push({ group: option.group, items: [{ option, index }] })
    }
  })

  const menu = open && menuPosition ? createPortal(
    <div
      ref={listRef}
      role="listbox"
      tabIndex={-1}
      className="titlebar-no-drag fixed z-[10000] overflow-hidden rounded-md border border-white/[0.08] bg-[#0E1014] shadow-[0_12px_32px_rgba(0,0,0,0.5)] animate-in fade-in slide-in-from-top-1 duration-100"
      style={{
        left: menuPosition.left,
        width: menuPosition.width,
        top: menuPosition.top,
        bottom: menuPosition.bottom
      }}
    >
      {shouldSearch && (
        <div className="border-b border-white/[0.06] p-2">
          <div className="flex h-8 items-center gap-2 rounded-md border border-white/[0.07] bg-black/25 px-2.5">
            <IconSearch size={13} className="shrink-0 text-white/35" />
            <input
              ref={searchInputRef}
              value={search}
              onChange={(event) => {
                setSearch(event.currentTarget.value)
                setHighlight(0)
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  setHighlight((h) => Math.min(visibleOptions.length - 1, h + 1))
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  setHighlight((h) => Math.max(0, h - 1))
                } else if (event.key === 'Enter') {
                  event.preventDefault()
                  const opt = visibleOptions[highlight]
                  if (opt && !opt.disabled) {
                    onChange(opt.value)
                    setOpen(false)
                  }
                }
              }}
              placeholder="Search..."
              className="min-w-0 flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-white/25"
            />
          </div>
        </div>
      )}
      <div className="overflow-y-auto custom-scrollbar py-1" style={{ maxHeight: menuPosition.maxListHeight }}>
        {grouped.map((section, groupIndex) => (
          <div key={`grp-${groupIndex}`}>
            {section.group && (
              <div className="px-3 pt-2.5 pb-1 text-[10px] font-semibold text-white/35">
                {section.group}
              </div>
            )}
            {section.items.map(({ option, index }) => {
              const isActive = option.value === value
              const isHighlighted = index === highlight
              return (
                <button
                  key={`${option.value}-${index}`}
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
                  className={`w-full flex items-center justify-between gap-2.5 px-3 py-1.5 text-[13px] text-left transition-colors ${ option.disabled ? 'text-white/32 cursor-not-allowed' : isActive ? 'bg-white/[0.06] text-white' : isHighlighted ? 'bg-white/[0.03] text-white' : 'text-white/55 hover:bg-white/[0.025] hover:text-white' }`}
                >
                  <span className="flex min-w-0 items-center gap-2 truncate">
                    {option.icon}
                    <span className="truncate">{option.label}</span>
                  </span>
                  {isActive && <IconCheck size={13} className="shrink-0 text-accent" />}
                </button>
              )
            })}
          </div>
        ))}
        {visibleOptions.length === 0 && (
          <div className="px-3 py-4 text-center text-[12px] text-white/32">{emptyLabel}</div>
        )}
      </div>
    </div>,
    document.body
  ) : null

  return (
    <div ref={containerRef} className={`titlebar-no-drag relative ${className} ${open ? 'z-[100]' : 'z-auto'}`}>
      <button
        type="button"
        onClick={() => {
          if (disabled) return
          if (!open) setMenuPosition(null)
          setOpen((v) => !v)
        }}
        disabled={disabled}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`app-select w-full flex items-center justify-between gap-3 ${disabled ? 'cursor-not-allowed opacity-55' : ''} ${buttonClassName}`}
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
      {menu}
    </div>
  )
}
