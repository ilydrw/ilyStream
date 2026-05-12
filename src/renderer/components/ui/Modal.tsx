import React, { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { IconX } from '@tabler/icons-react'
import { cn } from '../../lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  className?: string
  headerActions?: React.ReactNode
  noScroll?: boolean
}

/**
 * Standardized Modal component with consistent animations, 
 * accessibility features, and design system integration.
 * Uses z-context (1000) for proper layering above regular UI elements.
 */
export function Modal({ open, onClose, title, children, className, headerActions, noScroll }: ModalProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (open) window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={cn(
              "relative w-full max-w-2xl bg-[#0c0c0c] border border-white/10 rounded-3xl overflow-hidden shadow-2xl z-[1001] flex flex-col",
              className
            )}
          >
            {(title || onClose) && (
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-black/20 shrink-0">
                <div className="flex items-center gap-3">
                  {headerActions}
                  {title && <h2 className="text-lg font-black text-white">{title}</h2>}
                </div>
                {onClose && (
                  <button 
                    onClick={onClose} 
                    className="p-2 rounded-lg hover:bg-white/5 text-white/20 hover:text-white transition-all cursor-pointer"
                  >
                    <IconX size={18} />
                  </button>
                )}
              </div>
            )}
            {noScroll ? (
              children
            ) : (
              <div className="custom-scrollbar overflow-y-auto max-h-[80vh]">
                {children}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
