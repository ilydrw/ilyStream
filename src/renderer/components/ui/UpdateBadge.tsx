import { IconRefresh, IconArrowDownCircle, IconLoader2 } from '@tabler/icons-react'
import { useUIStore } from '../../stores/ui-store'
import { Tooltip } from './Tooltip'

export function UpdateBadge() {
  const updateStatus = useUIStore((state) => state.updateStatus)

  if (!updateStatus) return null

  const handleInstall = () => {
    window.api?.system?.installUpdate()
  }

  if (updateStatus.state === 'downloaded') {
    return (
      <Tooltip content="Restart App to Apply Update" position="bottom">
        <button
          onClick={handleInstall}
          className="flex items-center gap-2 px-3 py-1.5 bg-accent text-black font-black text-[11px] uppercase tracking-wider rounded-lg hover:bg-accent-hover transition-all animate-pulse-subtle shadow-[0_0_20px_rgba(25,200,255,0.3)]"
        >
          <IconRefresh size={14} stroke={3} />
          Update Ready to Install
        </button>
      </Tooltip>
    )
  }

  if (updateStatus.state === 'download-progress') {
    return (
      <Tooltip content={`Downloading v${updateStatus.version}...`} position="bottom">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 text-white/60 font-black text-[11px] uppercase tracking-wider rounded-lg">
          <IconArrowDownCircle size={14} className="animate-bounce" />
          Downloading Update ({updateStatus.percent}%)
        </div>
      </Tooltip>
    )
  }

  if (updateStatus.state === 'checking' || updateStatus.state === 'available') {
    return (
      <Tooltip content="Connecting to update server..." position="bottom">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 text-white/40 font-black text-[11px] uppercase tracking-wider rounded-lg">
          <IconLoader2 size={14} className="animate-spin" />
          Checking for Updates
        </div>
      </Tooltip>
    )
  }

  return null
}
