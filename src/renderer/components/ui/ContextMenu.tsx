import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {IconChevronRight} from '@tabler/icons-react'

export interface ContextMenuItem {
  id: string
  label: string
  icon?: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
  divider?: boolean
  submenu?: ContextMenuItem[]
}

interface ContextMenuProps {
  items: ContextMenuItem[]
  x: number
  y: number
  onClose: () => void
  isSubmenu?: boolean
}

export function ContextMenu({ items, x, y, onClose, isSubmenu = false }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [activeSubmenu, setActiveSubmenu] = useState<{ id: string, x: number, y: number, items: ContextMenuItem[] } | null>(null)
  const [position, setPosition] = useState({ x, y })
  const openSubmenu = (id: string, rect: DOMRect, items: ContextMenuItem[]) => {
    setActiveSubmenu({ id, x: rect.right + 6, y: rect.top - 4, items })
  }

  useEffect(() => {
    if (!isSubmenu) {
      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement | null
        if (target && !target.closest('[data-context-menu-root="true"]')) {
          onClose()
        }
      }
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose, isSubmenu])

  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect()
      const winW = window.innerWidth
      const winH = window.innerHeight
      let newX = x
      let newY = y

      if (x + rect.width > winW) {
        newX = isSubmenu ? x - rect.width - 10 : winW - rect.width - 5
      }
      if (y + rect.height > winH) {
        newY = winH - rect.height - 5
      }
      
      setPosition({ x: newX, y: newY })
    }
  }, [x, y, isSubmenu])

  return (
    <>
      {!isSubmenu && (
        <div 
          className="fixed inset-0 z-context"
          onContextMenu={(e) => { e.preventDefault(); onClose(); }}
          onClick={onClose}
        />
      )}
      <motion.div
        ref={menuRef}
        data-context-menu-root="true"
        initial={{ opacity: 0, scale: 0.98, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: -4 }}
        transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
        style={{ left: position.x, top: position.y }}
        className="fixed min-w-[220px] bg-[#0c0d10]/95 backdrop-blur-3xl border border-white/10 rounded-2xl shadow-[0_30px_80px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.08)] overflow-hidden p-1.5 z-context"
      >
        {items.map((item, idx) => (
          <div key={item.id + idx}>
            {item.divider && <div className="h-px bg-white/10 my-1.5 mx-3" />}
            {!item.divider && (
              <button
                disabled={item.disabled}
                onClick={(e) => {
                  e.stopPropagation()
                  if (item.submenu) {
                    openSubmenu(item.id, e.currentTarget.getBoundingClientRect(), item.submenu)
                    return
                  }
                  item.onClick?.()
                  onClose()
                }}
                onMouseEnter={(e) => {
                  if (item.submenu && !item.disabled) {
                    openSubmenu(item.id, e.currentTarget.getBoundingClientRect(), item.submenu)
                  } else {
                    setActiveSubmenu(null)
                  }
                }}
                className={`
                  w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13px] font-bold transition-all duration-200 group
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
                  ${item.danger ? 'text-red-400 hover:bg-red-500/20' : 'text-white/80 hover:bg-white/[0.08] hover:text-white'}
                  ${item.disabled ? 'opacity-20 cursor-not-allowed' : 'cursor-pointer active:scale-[0.97]'}
                `}
              >
                <div className="flex items-center gap-3.5">
                  {item.icon && (
                    <span className={`w-5 h-5 flex items-center justify-center ${item.danger ? 'text-red-400/80' : 'text-white/40'} transition-all group-hover:text-current group-hover:scale-105`}>
                      {item.icon}
                    </span>
                  )}
                  <span className="tracking-tight">{item.label}</span>
                </div>
                {item.submenu && (
                  <IconChevronRight size={16} className="text-white/20 group-hover:text-white/60 transition-colors" />
                )}
              </button>
            )}
          </div>
        ))}
      </motion.div>

      <AnimatePresence>
        {activeSubmenu && (
          <ContextMenu
            items={activeSubmenu.items}
            x={activeSubmenu.x}
            y={activeSubmenu.y}
            onClose={onClose}
            isSubmenu={true}
          />
        )}
      </AnimatePresence>
    </>
  )
}
