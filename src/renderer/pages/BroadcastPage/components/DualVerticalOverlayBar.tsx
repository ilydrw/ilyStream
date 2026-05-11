import { useEffect, useState } from 'react'
import { IconCopy, IconCircleCheck, IconDeviceMobile, IconExternalLink } from '@tabler/icons-react'

interface DualVerticalOverlayBarProps {
  enabled: boolean
  onToggle: (next: boolean) => void
}

export function DualVerticalOverlayBar({ enabled, onToggle }: DualVerticalOverlayBarProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const apply = (status: { dualVerticalUrl?: string | null }) => {
      if (status?.dualVerticalUrl) setUrl(status.dualVerticalUrl)
    }
    window.api?.overlay?.getStatus?.().then(apply)
    const unsubscribe = window.api?.on?.('overlay:status-changed', (s: unknown) => {
      apply(s as { dualVerticalUrl?: string | null })
    })
    return () => { unsubscribe?.() }
  }, [])

  const handleCopy = () => {
    if (!url) return
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="shrink-0 flex items-center gap-3 px-6 py-2 border-b border-white/[0.04] bg-[#0a0a0b]">
      <IconDeviceMobile size={14} className={enabled ? 'text-accent' : 'text-white/30'} />
      <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Vertical Overlay URL</span>

      <button
        onClick={() => onToggle(!enabled)}
        role="switch"
        aria-checked={enabled}
        className={`relative h-5 w-9 rounded-full transition-all ${enabled ? 'bg-accent/80' : 'bg-white/10'}`}
      >
        <span className={`absolute top-1 h-3 w-3 rounded-full bg-white transition-all ${enabled ? 'left-5' : 'left-1'}`} />
      </button>

      <div className="relative flex-1 max-w-[520px]">
        <div className={`w-full bg-black/60 border rounded-lg px-3 py-1.5 text-[11px] font-mono truncate pr-9 select-all transition-colors ${enabled ? 'border-accent/30 text-[#19c8ff]' : 'border-white/10 text-white/30'}`}>
          {url || 'Overlay server unavailable'}
        </div>
        <button
          onClick={handleCopy}
          disabled={!url}
          className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded-md bg-white/5 text-white/40 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30"
          title="Copy URL"
        >
          {copied ? <IconCircleCheck size={13} className="text-emerald-400" /> : <IconCopy size={13} />}
        </button>
      </div>

      <span className="text-[9px] text-white/30 leading-tight max-w-[260px] hidden xl:flex items-center gap-1.5">
        <IconExternalLink size={11} />
        Paste into TikTok Live Studio as a browser source. Only streams while ilyStream is open and dual layout is active.
      </span>
    </div>
  )
}
