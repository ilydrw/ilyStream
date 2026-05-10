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

  useEffect(() => {
    if (!isSubmenu) {
      const handleClickOutside = (e: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
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
          className="fixed inset-0 z-[9998]"
          onContextMenu={(e) => { e.preventDefault(); onClose(); }}
          onClick={onClose}
        />
      )}
      <motion.div
        ref={menuRef}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.1 }}
        style={{ left: position.x, top: position.y }}
        className={`fixed min-w-[200px] bg-[#1a1c22]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden p-1.5 z-[9999]`}
      >
        {items.map((item, idx) => (
          <div key={item.id + idx}>
            {item.divider && <div className="h-px bg-white/5 my-1.5 mx-1" />}
            {!item.divider && (
              <button
                disabled={item.disabled}
                onClick={(e) => {
                  e.stopPropagation()
                  if (item.submenu) return
                  item.onClick?.()
                  onClose()
                }}
                onMouseEnter={(e) => {
                  if (item.submenu) {
                    const rect = e.currentTarget.getBoundingClientRect()
                    setActiveSubmenu({ id: item.id, x: rect.right + 2, y: rect.top, items: item.submenu })
                  } else {
                    setActiveSubmenu(null)
                  }
                }}
                className={`
                  w-full flex items-center justify-between px-3 py-2 rounded-lg text-[11px] font-medium transition-colors
                  ${item.danger ? 'text-red-400 hover:bg-red-500/10' : 'text-white/70 hover:bg-white/5 hover:text-white'}
                  ${item.disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                <div className="flex items-center gap-3">
                  {item.icon && <span className="text-white/40">{item.icon}</span>}
                  <span>{item.label}</span>
                </div>
                {item.submenu && <IconChevronRight size={14} className="text-white/20" />}
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
