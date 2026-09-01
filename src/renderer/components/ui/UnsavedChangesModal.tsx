import { motion, AnimatePresence } from 'framer-motion'

interface UnsavedChangesModalProps {
  isOpen: boolean
  isSaving: boolean
  onSave: () => void
  onDiscard: () => void
  onStay: () => void
}

export function UnsavedChangesModal({
  isOpen,
  isSaving,
  onSave,
  onDiscard,
  onStay
}: UnsavedChangesModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          role="presentation"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full max-w-[400px] overflow-hidden rounded-xl border border-white/[0.08] bg-[#0E1014] p-6 shadow-[0_20px_48px_rgba(0,0,0,0.6)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsaved-changes-title"
          >
            <h2 id="unsaved-changes-title" className="mb-2 text-lg font-semibold tracking-tight text-white">
              Unsaved changes
            </h2>
            <p className="mb-6 text-sm text-white/70">
              You have unsaved changes. Would you like to save them before leaving?
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onStay}
                disabled={isSaving}
                className="rounded-md px-4 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/[0.05] hover:text-white"
              >
                Stay
              </button>
              <button
                type="button"
                onClick={onDiscard}
                disabled={isSaving}
                className="rounded-md bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-500 transition-colors hover:bg-red-500/20"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={isSaving}
                className="flex min-w-[80px] items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-[var(--theme-on-accent)] transition-colors hover:bg-accent-hover active:translate-y-px"
              >
                {isSaving ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--theme-on-accent)]/20 border-t-[var(--theme-on-accent)]" />
                ) : (
                  'Save'
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
