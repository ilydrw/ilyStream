import { useState, useEffect } from 'react'
import {IconExternalLink, IconCircleCheck, IconCopy} from '@tabler/icons-react'

export function OverlayUrlCard() {
  const [url, setUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const applyStatus = (status: { alertsUrl?: string | null }) => {
      if (status.alertsUrl) setUrl(status.alertsUrl)
    }

    if (window.api?.overlay?.getStatus) {
      window.api.overlay.getStatus().then(applyStatus)
    }

    const unsubscribe = window.api?.on?.('overlay:status-changed', (status: unknown) => {
      applyStatus(status as { alertsUrl?: string | null })
    })

    const statusTimer = window.setInterval(() => {
      void window.api?.overlay?.getStatus?.().then(applyStatus)
    }, 3000)

    return () => {
      unsubscribe?.()
      window.clearInterval(statusTimer)
    }
  }, [])

  const handleCopy = () => {
    if (!url) return
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <IconExternalLink size={14} className="text-white/20" />
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">Overlay Source</span>
        </div>
      </div>

      <div className="relative group">
        <div className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-[11px] text-accent font-mono truncate pr-12 select-all shadow-inner">
          {url || 'Detecting Server...'}
        </div>
        <button
          onClick={handleCopy}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-white/5 text-white/40 hover:text-white hover:bg-white/10 transition-all active:scale-95"
          title="Copy to Clipboard"
        >
          {copied ? <IconCircleCheck size={14} className="text-emerald-500" /> : <IconCopy size={14} />}
        </button>
      </div>

      <div className="p-4 rounded-xl bg-accent/5 border border-accent/10 flex gap-3">
        <IconExternalLink size={14} className="text-accent/60 shrink-0 mt-0.5" />
        <p className="text-[10px] text-white/40 leading-relaxed">
          The overlay is active in your broadcast software. Use the <strong className="text-white/60 uppercase tracking-widest text-[9px]">Test</strong> buttons in the route panel to trigger live alerts and audio previews.
        </p>
      </div>
    </div>
  )
}
