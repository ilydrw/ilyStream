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
            className="broadcast-hotkeys-backdrop"
            onClick={onClose}
            aria-hidden="true"
          />
          <div className="broadcast-hotkeys-layer">
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: -8 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="broadcast-hotkeys-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="production-shortcuts-title"
            >
              <div className="broadcast-hotkeys-header">
                <div className="broadcast-hotkeys-heading">
                  <div className="broadcast-hotkeys-heading-icon"><IconKeyboard size={20} /></div>
                  <div>
                    <h2 id="production-shortcuts-title">Production Shortcuts</h2>
                    <p>Global controls for the live production workspace</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="broadcast-hotkeys-close"
                  aria-label="Close production shortcuts"
                >
                  <IconX size={17} />
                </button>
              </div>

              <div className="broadcast-hotkeys-grid">
                {PRODUCTION_SHORTCUTS.map((shortcut) => (
                  <div key={shortcut.key} className="broadcast-hotkey-row">
                    <kbd>{shortcut.key}</kbd>
                    <div>
                      <p>{shortcut.label}</p>
                      <span>{shortcut.desc}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="broadcast-hotkeys-tip">
                <div className="broadcast-hotkeys-tip-icon"><IconSparkles size={16} /></div>
                <p>
                  <strong>Pro tip:</strong> Use <span>Studio Mode</span> to prepare the next shot in Preview before
                  transitioning it to the Live Program.
                </p>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
