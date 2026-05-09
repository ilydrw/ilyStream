import { motion, AnimatePresence } from 'framer-motion'
import { Save, RotateCcw, Zap } from 'lucide-react'

interface DirtyBarProps {
  isDirty: boolean
  onApply: () => void
  onDiscard: () => void
  isSaving?: boolean
}

export function DirtyBar({ isDirty, onApply, onDiscard, isSaving }: DirtyBarProps) {
  return (
    <AnimatePresence>
      {isDirty && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100]"
        >
          <div className="bg-[#0f1115]/80 border border-white/10 rounded-[28px] p-2 pr-4 shadow-[0_30px_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl flex items-center gap-6 min-w-[460px]">
            <div className="flex items-center gap-4 pl-4">
              <div className="w-12 h-12 rounded-2xl bg-accent/20 flex items-center justify-center text-accent shadow-[0_0_20px_rgba(124,58,237,0.2)]">
                <Zap size={22} className="glow-text" />
              </div>
              <div>
                <p className="text-[14px] font-black text-white uppercase tracking-tighter">Unsaved Changes</p>
                <p className="text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">Apply or discard your modifications</p>
              </div>
            </div>

            <div className="h-8 w-px bg-white/5 mx-2" />

            <div className="flex items-center gap-3 ml-auto">
              <button
                onClick={onDiscard}
                disabled={isSaving}
                className="h-12 px-6 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white/60 hover:bg-white/5 transition-all flex items-center gap-2"
              >
                <RotateCcw size={14} />
                Discard
              </button>
              <button
                onClick={onApply}
                disabled={isSaving}
                className="h-12 px-8 rounded-2xl text-white text-[11px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-3 relative overflow-hidden group"
                style={{ background: 'var(--brand-gradient)' }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                {isSaving ? (
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                <span>Apply Changes</span>
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
