import { motion, AnimatePresence } from 'framer-motion'
import { IconRotate2, IconBolt } from '@tabler/icons-react'
import { IconDeviceFloppy } from './icons'

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
          <div className="bg-[#0E1014] border border-white/[0.08] rounded-xl p-2 pr-3 shadow-[0_20px_48px_rgba(0,0,0,0.6)] flex items-center gap-4 min-w-[420px]">
            <div className="flex items-center gap-3 pl-3">
              <div className="w-9 h-9 rounded-md bg-accent/15 flex items-center justify-center text-accent">
                <IconBolt size={18} />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-white tracking-tight">Unsaved changes</p>
                <p className="text-[12px] font-normal text-white/55">Apply or discard your modifications</p>
              </div>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={onDiscard}
                disabled={isSaving}
                className="h-[34px] px-3.5 rounded-md text-[13px] font-medium text-white/55 hover:text-white border border-white/[0.05] hover:border-white/[0.12] hover:bg-white/[0.03] transition-colors flex items-center gap-1.5"
              >
                <IconRotate2 size={14} />
                Discard
              </button>
              <button
                onClick={onApply}
                disabled={isSaving}
                className="h-[34px] px-4 rounded-md text-[#04111a] text-[13px] font-semibold bg-accent hover:bg-accent-hover active:translate-y-px transition-colors flex items-center gap-1.5"
              >
                {isSaving ? (
                  <div className="w-3.5 h-3.5 border-2 border-[#04111a]/20 border-t-[#04111a] rounded-full animate-spin" />
                ) : (
                  <IconDeviceFloppy size={14} />
                )}
                <span>Apply changes</span>
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
