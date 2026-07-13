import { IconSparkles } from '@tabler/icons-react'
import { useStudioStore } from '../../../stores/studio-store'

interface StingerConfigModalProps {
  open: boolean
  onClose: () => void
}

export function StingerConfigModal({ open, onClose }: StingerConfigModalProps) {
  const stingerSettings = useStudioStore((state) => state.stingerSettings)
  const setStingerPath = useStudioStore((state) => state.setStingerPath)
  const setStingerDuration = useStudioStore((state) => state.setStingerDuration)
  const setStingerCutPoint = useStudioStore((state) => state.setStingerCutPoint)

  if (!open) return null

  const pickStinger = async () => {
    const path = await (window as any).api.assets.pickFile({
      filters: [{ name: 'Videos', extensions: ['webm', 'mp4', 'mov'] }]
    })
    if (path) setStingerPath(path)
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stinger-config-title"
    >
      <div className="flex w-[400px] flex-col gap-6 rounded-lg border border-white/10 bg-[#0c0c0e] p-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 id="stinger-config-title" className="text-xl font-semibold tracking-tighter text-white">
            Stinger Setup
          </h2>
          <button type="button" onClick={onClose} className="text-white/20 hover:text-white">Close</button>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-semibold tracking-tight text-white/40">Video File (.webm / .mp4)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={stingerSettings.path}
                readOnly
                placeholder="No file selected..."
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/80 outline-none"
              />
              <button type="button" onClick={pickStinger} className="rounded-xl bg-accent px-4 text-xs font-semibold text-white">
                Pick
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-semibold tracking-tight text-white/40">Total Duration (ms)</label>
              <input
                type="number"
                min={0}
                value={stingerSettings.duration}
                onChange={(event) => setStingerDuration(Number(event.target.value))}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/80 outline-none focus:border-accent"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-semibold tracking-tight text-white/40">Cut Point (ms)</label>
              <input
                type="number"
                min={0}
                value={stingerSettings.cutPoint}
                onChange={(event) => setStingerCutPoint(Number(event.target.value))}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/80 outline-none focus:border-accent"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-md border border-purple-500/20 bg-purple-500/10 p-4">
          <IconSparkles className="text-purple-400" size={20} />
          <p className="text-[10px] font-medium leading-relaxed text-purple-200/60">
            The <span className="font-semibold text-purple-300">Cut Point</span> is when the scene switch happens.
            Set it to when the stinger completely covers the screen.
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-md bg-accent py-4 font-semibold tracking-tight text-white transition-all hover:brightness-110 active:scale-95"
        >
          Done
        </button>
      </div>
    </div>
  )
}
