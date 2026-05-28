import React, { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { IconX } from './icons'
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
            className="absolute inset-0 bg-black/70"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "relative w-full max-w-2xl bg-[#0E1014] border border-white/[0.05] rounded-[10px] overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.6)] z-[1001] flex flex-col",
              className
            )}
          >
            {(title || onClose) && (
              <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  {headerActions}
                  {title && <h2 className="text-[15px] font-semibold tracking-tight text-white">{title}</h2>}
                </div>
                {onClose && (
                  <button
                    onClick={onClose}
                    className="w-8 h-8 grid place-items-center rounded-md hover:bg-white/[0.04] text-white/55 hover:text-white transition-colors cursor-pointer"
                  >
                    <IconX size={16} />
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
