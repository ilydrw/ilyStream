import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface TooltipProps {
  content: React.ReactNode
  children: React.ReactElement
  position?: 'top' | 'bottom' | 'left' | 'right'
  delay?: number
}

export function Tooltip({ content, children, position = 'top', delay = 0.3 }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true)
    }, delay * 1000)
  }

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setIsVisible(false)
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const positions = {
    top: { bottom: '100%', left: '50%', x: '-50%', y: -8 },
    bottom: { top: '100%', left: '50%', x: '-50%', y: 8 },
    left: { right: '100%', top: '50%', y: '-50%', x: -8 },
    right: { left: '100%', top: '50%', y: '-50%', x: 8 }
  }

  return (
    <div className="relative inline-flex" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {children}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, ...positions[position] }}
            animate={{ opacity: 1, scale: 1, ...positions[position] }}
            exit={{ opacity: 0, scale: 0.95, ...positions[position] }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute z-[9999] pointer-events-none"
          >
            <div className="px-3 py-1.5 bg-[#1A1A1A] border border-white/10 rounded-lg shadow-2xl backdrop-blur-xl">
              <span className="text-[10px] font-black uppercase tracking-[0.1em] text-white/70 whitespace-nowrap leading-none">
                {content}
              </span>
            </div>
            {/* Tiny arrow */}
            <div 
              className={`absolute border-4 border-transparent ${
                position === 'top' ? 'border-t-[#1A1A1A] top-full left-1/2 -translate-x-1/2' :
                position === 'bottom' ? 'border-b-[#1A1A1A] bottom-full left-1/2 -translate-x-1/2' :
                position === 'left' ? 'border-l-[#1A1A1A] left-full top-1/2 -translate-y-1/2' :
                'border-r-[#1A1A1A] right-full top-1/2 -translate-y-1/2'
              }`}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
