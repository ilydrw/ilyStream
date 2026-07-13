import { useEffect, useRef, useState } from 'react'
import { IconCopy, IconExternalLink, IconShieldCheck } from '@tabler/icons-react'
import { IconCircleCheck } from '../../../components/ui/icons'
import type {
  TikTokNativeAuthPhase,
  TikTokNativeAuthProgress,
  TikTokNativeAuthStatus
} from '../../../../shared/tiktok-native'
import {
  TIKTOK_NATIVE_AUTH_TIMEOUT_MS,
  TIKTOK_NATIVE_REDIRECT_URI
} from '../../../../shared/tiktok-native'
import {
  TIKTOK_NATIVE_AUTH_STAGES,
  formatTikTokNativeAuthCountdown,
  formatTikTokNativeAuthError,
  getTikTokNativeAccessLabel,
  getTikTokNativeAuthStageIndex
} from '../native-auth-ui'

const PLATFORM_ID = 'tiktok'

const DEFAULT_NATIVE_STATUS: TikTokNativeAuthStatus = {
  state: 'unconfigured',
  configured: false,
  redirectUri: TIKTOK_NATIVE_REDIRECT_URI,
  liveAccess: 'unknown',
  message: 'Checking native TikTok integration…'
}

interface TikTokNativeAccessCardProps {
  platformConfig: Record<string, string>
  connectionEnabled: boolean
  onClientKeyChange: (value: string) => void
}

export function TikTokNativeAccessCard({
  platformConfig,
  connectionEnabled,
  onClientKeyChange
}: TikTokNativeAccessCardProps) {
  const [status, setStatus] = useState<TikTokNativeAuthStatus>(DEFAULT_NATIVE_STATUS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<TikTokNativeAuthProgress | null>(null)
  const [secondsRemaining, setSecondsRemaining] = useState(0)
  const [copiedRedirect, setCopiedRedirect] = useState(false)
  const cancelledRef = useRef(false)
  const clientKey = platformConfig.oauthClientKey || ''

  useEffect(() => {
    window.api.platform.tiktok?.getNativeAuthStatus?.()
      .then(setStatus)
      .catch((authError) => setStatus({
        ...DEFAULT_NATIVE_STATUS,
        state: 'error',
        message: formatTikTokNativeAuthError(authError)
      }))
  }, [])

  useEffect(() => {
    const unsubscribe = window.api?.on?.('tiktok:native-auth-progress', (payload: unknown) => {
      setProgress(payload as TikTokNativeAuthProgress)
    })
    return () => unsubscribe?.()
  }, [])

  useEffect(() => {
    if (!busy || !progress?.expiresAt) {
      setSecondsRemaining(0)
      return
    }

    const updateCountdown = () => {
      setSecondsRemaining(Math.max(0, Math.ceil((progress.expiresAt - Date.now()) / 1000)))
    }
    updateCountdown()
    const interval = window.setInterval(updateCountdown, 1000)
    return () => window.clearInterval(interval)
  }, [busy, progress?.expiresAt])

  const beginAuthorization = async () => {
    const normalizedClientKey = clientKey.trim()
    if (!normalizedClientKey) {
      setError('Add the public TikTok Login Kit client key first.')
      return
    }

    const startedAt = Date.now()
    cancelledRef.current = false
    setBusy(true)
    setError(null)
    setProgress({
      phase: 'opening-browser',
      message: 'Opening TikTok in your browser…',
      startedAt,
      expiresAt: startedAt + TIKTOK_NATIVE_AUTH_TIMEOUT_MS
    })

    try {
      await window.api.platform.saveConfig({
        ...platformConfig,
        platform: PLATFORM_ID,
        enabled: connectionEnabled,
        oauthClientKey: normalizedClientKey
      })
      setStatus(await window.api.platform.tiktok.beginNativeAuth({ clientKey: normalizedClientKey }))
    } catch (authError) {
      if (!cancelledRef.current) setError(formatTikTokNativeAuthError(authError))
    } finally {
      setBusy(false)
    }
  }

  const cancelAuthorization = async () => {
    cancelledRef.current = true
    setError(null)
    setProgress(null)
    try {
      setStatus(await window.api.platform.tiktok.cancelNativeAuth())
    } catch (authError) {
      setError(formatTikTokNativeAuthError(authError))
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    setBusy(true)
    setError(null)
    try {
      setStatus(await window.api.platform.tiktok.disconnectNativeAuth())
      setProgress(null)
    } catch (authError) {
      setError(formatTikTokNativeAuthError(authError))
    } finally {
      setBusy(false)
    }
  }

  const copyRedirect = async () => {
    await window.api.system.copyToClipboard(status.redirectUri)
    setCopiedRedirect(true)
    window.setTimeout(() => setCopiedRedirect(false), 1500)
  }

  const accessLabel = getTikTokNativeAccessLabel(status)
  const visiblePhase: TikTokNativeAuthPhase | null = status.state === 'connected'
    ? 'connected'
    : progress?.phase || null

  return (
    <section className="app-section-card glass">
      <div className="app-section-head">
        <div>
          <h2>Official TikTok LIVE Access</h2>
          <p>Login Kit consent and native no-stream-key publishing.</p>
        </div>
        <div className={`rounded-full border px-3 py-1 text-[10px] font-semibold ${
          status.liveAccess === 'approved'
            ? 'border-success/30 bg-success/10 text-success'
            : status.state === 'error'
              ? 'border-danger/30 bg-danger/10 text-danger'
              : 'border-white/10 bg-white/5 text-white/45'
        }`}>
          {accessLabel}
        </div>
      </div>

      <div className="flex flex-col gap-6 p-8">
        <div className="flex items-start gap-4 rounded-xl border border-tiktok/20 bg-tiktok/[0.04] p-5">
          <IconShieldCheck size={22} className="mt-0.5 shrink-0 text-tiktok" />
          <div>
            <p className="text-sm font-semibold text-white">Two-stage authorization</p>
            <p className="mt-1 text-xs leading-relaxed text-white/40">
              TikTok must first approve ilyStream for third-party LIVE ingestion. Creators can then sign in and grant
              account permission here. The client secret and refresh tokens stay on ilyStream's secure auth bridge,
              never inside this desktop build.
            </p>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label htmlFor="tiktok-login-kit-client-key" className="text-xs font-semibold tracking-tight text-white/30">
              TikTok Login Kit client key
            </label>
            <input
              id="tiktok-login-kit-client-key"
              type="text"
              placeholder="Public client key from TikTok Developer Portal"
              value={clientKey}
              onChange={(event) => onClientKeyChange(event.target.value)}
              disabled={busy || status.state === 'connected'}
              className="app-input disabled:cursor-not-allowed disabled:opacity-40"
            />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold tracking-tight text-white/30">Registered desktop redirect URI</span>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 select-all truncate rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-[11px] text-white/65">
                {status.redirectUri}
              </code>
              <button type="button" onClick={copyRedirect} className="app-button-secondary !h-10 !px-3" title="Copy redirect URI">
                <IconCopy size={15} />
                {copiedRedirect ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>

        <div className={`rounded-lg border px-4 py-3 text-xs font-semibold ${
          error || status.state === 'error'
            ? 'border-danger/20 bg-danger/10 text-danger'
            : status.liveAccess === 'approved'
              ? 'border-success/20 bg-success/10 text-success'
              : 'border-white/5 bg-white/[0.02] text-white/40'
        }`} role={error ? 'alert' : 'status'}>
          {error || (busy ? progress?.message : status.message) || accessLabel}
        </div>

        {(visiblePhase || error) && (
          <NativeAuthProgressPanel phase={visiblePhase} busy={busy} secondsRemaining={secondsRemaining} />
        )}

        <div className="flex flex-wrap items-center gap-3">
          {busy ? (
            <>
              <button type="button" onClick={cancelAuthorization} className="app-button-secondary !h-10 !px-5 text-xs font-semibold">
                Cancel
              </button>
              <button type="button" disabled className="app-button-primary !h-10 !px-6 text-xs font-semibold opacity-50">
                {progress?.phase === 'exchanging-code'
                  ? 'Securing account…'
                  : `Waiting for TikTok · ${formatTikTokNativeAuthCountdown(secondsRemaining)}`}
              </button>
            </>
          ) : status.state === 'connected' ? (
            <button type="button" onClick={disconnect} className="app-button-secondary !h-10 !px-5 text-xs font-semibold">
              Disconnect official account
            </button>
          ) : (
            <button type="button" onClick={beginAuthorization} className="app-button-primary !h-10 !px-6 text-xs font-semibold">
              {error ? 'Retry TikTok connection' : 'Connect with TikTok'}
            </button>
          )}
          <button type="button" onClick={() => window.api.platform.tiktok.openDeveloperPortal()} className="app-button-secondary !h-10 !px-5 text-xs font-semibold">
            <IconExternalLink size={15} />
            Developer Portal
          </button>
          <button type="button" onClick={() => window.api.platform.tiktok.openPartnerSupport()} className="app-button-secondary !h-10 !px-5 text-xs font-semibold">
            <IconExternalLink size={15} />
            Request LIVE access
          </button>
        </div>
      </div>
    </section>
  )
}

function NativeAuthProgressPanel({
  phase,
  busy,
  secondsRemaining
}: {
  phase: TikTokNativeAuthPhase | null
  busy: boolean
  secondsRemaining: number
}) {
  const activeIndex = getTikTokNativeAuthStageIndex(phase)

  return (
    <div className="rounded-xl border border-white/5 bg-black/20 p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TIKTOK_NATIVE_AUTH_STAGES.map((stage, index) => {
          const complete = activeIndex > index || phase === 'connected'
          const active = activeIndex === index && !complete
          return (
            <div
              key={stage.phase}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[10px] font-semibold ${
                complete
                  ? 'border-success/20 bg-success/5 text-success'
                  : active
                    ? 'border-tiktok/30 bg-tiktok/10 text-tiktok'
                    : 'border-white/5 bg-white/[0.02] text-white/25'
              }`}
            >
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                complete ? 'border-success/40' : active ? 'border-tiktok/40' : 'border-white/10'
              }`}>
                {complete ? <IconCircleCheck size={13} /> : index + 1}
              </span>
              <span>{stage.label}</span>
            </div>
          )
        })}
      </div>
      {phase === 'awaiting-consent' && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold text-white/35">
          <span>New sandbox target users can take up to one hour to activate.</span>
          {busy && (
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 font-mono text-white/55">
              {formatTikTokNativeAuthCountdown(secondsRemaining)} remaining
            </span>
          )}
        </div>
      )}
    </div>
  )
}
