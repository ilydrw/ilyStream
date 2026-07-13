import { AnimatePresence, motion } from 'framer-motion'
import { IconKeyboard, IconSparkles } from '@tabler/icons-react'
import { useEffect } from 'react'
import { IconX } from '../../../components/ui/icons'

const PRODUCTION_SHORTCUTS = [
  { key: 'S', label: 'Toggle Studio Mode', desc: 'Preview vs Program' },
  { key: 'F / Space', label: 'Fade Transition', desc: 'Smooth cross-fade' },
  { key: 'C', label: 'Cut Transition', desc: 'Hard cut switch' },
  { key: 'T', label: 'Stinger Transition', desc: 'Professional video overlay' },
  { key: 'M', label: 'Toggle Multi-View', desc: 'Browse all scenes' },
  { key: 'R', label: 'Start/Stop Recording', desc: 'Local capture' },
  { key: 'B', label: 'Start/Stop Broadcast', desc: 'Live output' },
  { key: '1-9', label: 'Select Scene', desc: 'Direct scene jumping' },
  { key: 'Ctrl+Z', label: 'Undo Action', desc: 'Revert last change' },
  { key: 'Ctrl+Y', label: 'Redo Action', desc: 'Apply reverted action' },
  { key: 'ESC', label: 'Close Overlays', desc: 'Clear active modals' }
]

interface HotkeyLegendProps {
  open: boolean
  onClose: () => void
}

export function HotkeyLegend({ open, onClose }: HotkeyLegendProps) {
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999] bg-black/35 backdrop-blur-[1px]"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed bottom-24 left-1/2 z-[1000] w-[800px] -translate-x-1/2 rounded-[32px] border border-white/10 bg-[#0c0c0e]/90 p-10 shadow-2xl shadow-black/50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="production-shortcuts-title"
          >
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="rounded-md bg-purple-500/20 p-3 text-purple-400"><IconKeyboard size={24} /></div>
              <div>
                <h2 id="production-shortcuts-title" className="text-xl font-semibold tracking-tighter text-white">
                  Production Shortcuts
                </h2>
                <p className="mt-1 text-[10px] font-semibold tracking-tight text-white/20">Master your broadcast with global keys</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-white/5 p-3 text-white/20 transition-all hover:text-white"
              aria-label="Close production shortcuts"
            >
              <IconX size={20} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-x-12 gap-y-4">
            {PRODUCTION_SHORTCUTS.map((shortcut) => (
              <div key={shortcut.key} className="group flex items-center justify-between border-b border-white/5 py-3 transition-colors hover:border-white/10">
                <div className="flex items-center gap-4">
                  <div className="flex h-8 min-w-[60px] items-center justify-center rounded-lg border border-white/10 bg-white/10 font-mono text-[11px] font-semibold text-accent">
                    {shortcut.key}
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold tracking-tight text-white/80">{shortcut.label}</p>
                    <p className="mt-0.5 text-[9px] font-semibold tracking-tight text-white/20">{shortcut.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 flex items-center gap-4 rounded-md border border-purple-500/10 bg-purple-500/5 p-5">
            <div className="rounded-lg bg-purple-500/10 p-2 text-purple-400"><IconSparkles size={18} /></div>
            <p className="text-[11px] font-medium italic leading-relaxed text-purple-200/40">
              Pro Tip: Use <span className="font-semibold text-purple-400">Studio Mode</span> to prepare your next shot in
              Preview before transitioning it to the Live Program.
            </p>
          </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
