import { useState, useEffect } from 'react'
import { IconAlertTriangle, IconX } from '@tabler/icons-react'
import { IconCircleCheck, IconCopy } from '../../../components/ui/icons'

const TLS_WARNING_DISMISSED_KEY = 'alerts.tlsWarningDismissed.v1'

export function OverlayUrlCard() {
  const [url, setUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [tlsWarningDismissed, setTlsWarningDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem(TLS_WARNING_DISMISSED_KEY) === '1' } catch { return false }
  })

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

  const isReady = Boolean(url)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <input
            readOnly
            value={url || 'Detecting overlay server…'}
            onFocus={(e) => e.currentTarget.select()}
            className="app-input w-full font-mono !text-[12px] !text-accent !pr-24 select-all"
          />
          <button
            onClick={handleCopy}
            disabled={!isReady}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2.5 rounded-md text-white/55 hover:text-white hover:bg-white/[0.06] disabled:opacity-40 disabled:hover:bg-transparent transition-colors flex items-center gap-1.5 text-[12px] font-medium"
          >
            {copied ? (
              <>
                <IconCircleCheck size={13} className="text-success" />
                Copied
              </>
            ) : (
              <>
                <IconCopy size={13} />
                Copy
              </>
            )}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2.5 text-[12px]">
        <span className={`h-1.5 w-1.5 rounded-full ${isReady ? 'bg-success' : 'bg-white/20'}`} />
        <span className="text-white/55">
          {isReady
            ? 'Overlay server is reachable. Use it as a browser source — recommended size 1920 × 1080, transparent background.'
            : 'Waiting for the local overlay server to come online…'}
        </span>
      </div>

      {!tlsWarningDismissed && (
        <div className="relative flex items-start gap-3 p-3.5 pr-10 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] text-amber-100/90">
          <IconAlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-400" />
          <div className="text-[12px] leading-relaxed min-w-0">
            <p className="font-semibold text-amber-100">Alert showing as a single pixel in OBS or TikTok Live Studio?</p>
            <p className="mt-1 text-amber-100/75">
              Right-click your browser source &rarr; <strong>Properties</strong> &rarr; set <strong>Width: 1920</strong> and <strong>Height: 1080</strong>. Some tools default the source viewport to 1×1, which collapses the alert visual to a pixel. (The audio still fires either way — that's why it can fool you.)
            </p>
          </div>
          <button
            onClick={() => {
              try { localStorage.setItem(TLS_WARNING_DISMISSED_KEY, '1') } catch {}
              setTlsWarningDismissed(true)
            }}
            className="absolute top-2 right-2 w-7 h-7 rounded-md text-amber-100/55 hover:text-amber-100 hover:bg-amber-500/10 transition-colors flex items-center justify-center"
            title="Dismiss"
            aria-label="Dismiss setup warning"
          >
            <IconX size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
