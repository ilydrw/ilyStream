import { useEffect, useMemo, useState } from 'react'
import {
  IconBrandX,
  IconChevronDown,
  IconCopy,
  IconExternalLink,
  IconRadio,
  IconSend,
  IconWifi
} from '@tabler/icons-react'
import {
  PlatformPageHeader,
  Metric,
  DiagnosticLine,
  StatusBadge
} from '../../components/platforms/PlatformPageLayout'
import { DEFAULT_X_GO_LIVE_TEMPLATE, type XPostResult, type XStatus } from '../../../shared/x-types'

const PLATFORM_ID = 'x'
const MAX_TWEET_LENGTH = 280
const OAUTH_REDIRECT_URI = 'http://127.0.0.1:8791/callback'

export default function XPage() {
  const [tweet, setTweet] = useState(DEFAULT_X_GO_LIVE_TEMPLATE)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [apiStatus, setApiStatus] = useState<XStatus>({ connected: false, handle: null, error: null })
  const [clientId, setClientId] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [postError, setPostError] = useState<string | null>(null)
  const [lastPost, setLastPost] = useState<XPostResult | null>(null)
  const [isAuthorizing, setIsAuthorizing] = useState(false)
  const [isPosting, setIsPosting] = useState(false)
  const [copiedRedirect, setCopiedRedirect] = useState(false)
  const [autoPostGoLiveX, setAutoPostGoLiveX] = useState(false)
  const [isSavingAutomation, setIsSavingAutomation] = useState(false)

  useEffect(() => {
    window.api.x.getTemplate().then((savedTemplate) => {
      setTweet(savedTemplate || DEFAULT_X_GO_LIVE_TEMPLATE)
    })
    window.api.x.getStatus().then(setApiStatus)
    window.api.platform.tiktok?.getAutomations?.().then((automations) => {
      setAutoPostGoLiveX(Boolean(automations?.autoPostGoLiveX))
    }).catch(() => {})

    const unsubscribe = window.api.on('x:status-changed', (next: XStatus) => setApiStatus(next))
    return () => unsubscribe?.()
  }, [])

  const trimmedTweet = tweet.trim()
  const remaining = MAX_TWEET_LENGTH - tweet.length
  const overLimit = remaining < 0
  const canUseComposer = trimmedTweet.length > 0 && !overLimit
  const canPostWithApi = apiStatus.connected && canUseComposer && !isPosting
  const composerUrl = useMemo(
    () => `https://twitter.com/intent/tweet?text=${encodeURIComponent(trimmedTweet)}`,
    [trimmedTweet]
  )
  const counterTone = overLimit ? 'text-danger' : remaining <= 20 ? 'text-warning' : 'text-white/30'
  const apiBadgeStatus = apiStatus.connected ? 'connected' : isAuthorizing ? 'connecting' : 'disconnected'

  const showFeedback = (message: string) => {
    setFeedback(message)
    window.setTimeout(() => setFeedback(null), 1600)
  }

  const saveTemplate = async () => {
    await window.api.x.setTemplate(tweet)
    showFeedback('Template saved')
  }

  const openComposer = async () => {
    if (!canUseComposer) return
    await window.api.x.setTemplate(tweet)
    window.open(composerUrl, '_blank', 'noopener,noreferrer')
    showFeedback('Opened X composer')
  }

  const copyTweet = async () => {
    if (!trimmedTweet) return
    await window.api.system.copyToClipboard(trimmedTweet)
    showFeedback('Copied post text')
  }

  const copyRedirect = async () => {
    await window.api.system.copyToClipboard(OAUTH_REDIRECT_URI)
    setCopiedRedirect(true)
    window.setTimeout(() => setCopiedRedirect(false), 1500)
  }

  const connectApi = async () => {
    setAuthError(null)
    setIsAuthorizing(true)
    try {
      const next = await window.api.x.connect(clientId)
      setApiStatus(next)
      showFeedback('X API connected')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setAuthError(message.replace(/^Error:\s*/, ''))
    } finally {
      setIsAuthorizing(false)
    }
  }

  const disconnectApi = async () => {
    await window.api.x.disconnect()
    setApiStatus({ connected: false, handle: null, error: null })
    setAutoPostGoLiveX(false)
    await window.api.platform.tiktok?.setAutomation?.('autoPostGoLiveX', false)
    showFeedback('X API disconnected')
  }

  const postWithApi = async () => {
    if (!canPostWithApi) return
    setPostError(null)
    setLastPost(null)
    setIsPosting(true)
    try {
      await window.api.x.setTemplate(tweet)
      const result = await window.api.x.post(tweet)
      setLastPost(result)
      showFeedback('Posted through X API')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setPostError(message.replace(/^Error:\s*/, ''))
    } finally {
      setIsPosting(false)
    }
  }

  const toggleAutoPost = async () => {
    if (!apiStatus.connected || isSavingAutomation) return
    const next = !autoPostGoLiveX
    setAutoPostGoLiveX(next)
    setIsSavingAutomation(true)
    try {
      await window.api.platform.tiktok?.setAutomation?.('autoPostGoLiveX', next)
      showFeedback(next ? 'Automatic X posts enabled' : 'Automatic X posts disabled')
    } catch {
      setAutoPostGoLiveX(!next)
    } finally {
      setIsSavingAutomation(false)
    }
  }

  return (
    <div className="app-page">
      <PlatformPageHeader
        platformId={PLATFORM_ID}
        title="X Composer"
        description="Save your go-live post and open X's normal browser composer. Optional API posting is tucked away for paid X API users."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-20">
        <Metric
          icon={<IconBrandX size={20} className="text-white" />}
          label="Default Mode"
          value="Composer"
        />
        <Metric
          icon={<IconRadio size={20} className={apiStatus.connected ? 'text-success' : 'text-white/40'} />}
          label="Paid API"
          value={apiStatus.connected ? 'Connected' : 'Optional'}
        />
        <Metric
          icon={<IconSend size={20} className="text-info" />}
          label="Auto Post"
          value={autoPostGoLiveX ? 'On' : 'Off'}
        />
      </div>

      <div className="grid gap-16 xl:grid-cols-[1fr_450px]">
        <section className="app-section-card glass overflow-hidden">
          <div className="app-section-head">
            <div>
              <h2>Go-Live Post</h2>
              <p>Draft once, reuse every stream, and send it through X directly.</p>
            </div>
          </div>

          <div className="flex flex-col gap-6 p-12">
            <div className="relative">
              <textarea
                value={tweet}
                onChange={(event) => setTweet(event.target.value)}
                rows={8}
                placeholder="LIVE NOW! Come hang out: [your stream link]"
                className="app-input !h-auto w-full resize-none leading-relaxed"
              />
              <span className={`absolute bottom-3 right-3 text-[11px] font-mono ${counterTone}`}>
                {remaining}
              </span>
            </div>

            {overLimit && (
              <div className="px-4 py-3 rounded-lg bg-danger/10 border border-danger/20">
                <p className="text-xs font-semibold text-danger leading-relaxed">
                  X posts are limited to 280 characters. Trim this by {Math.abs(remaining)} characters before posting.
                </p>
              </div>
            )}

            {feedback && (
              <div className="px-4 py-3 rounded-lg bg-success/10 border border-success/20">
                <p className="text-xs font-semibold text-success leading-relaxed">{feedback}</p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <button
                type="button"
                onClick={openComposer}
                disabled={!canUseComposer}
                className="app-button-primary !h-12 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              >
                <IconExternalLink size={16} />
                Open Composer
              </button>
              <button
                type="button"
                onClick={copyTweet}
                disabled={!trimmedTweet}
                className="app-button-secondary !h-12 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              >
                <IconCopy size={16} />
                Copy Text
              </button>
              <button
                type="button"
                onClick={saveTemplate}
                className="app-button-secondary !h-12 text-sm font-semibold inline-flex items-center justify-center gap-2"
              >
                <IconSend size={16} />
                Save
              </button>
            </div>

            <details className="rounded-lg border border-white/10 bg-black/20">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-white/80">
                <span>Have a paid X API? Set up automatic posts</span>
                <IconChevronDown size={16} className="text-white/40" />
              </summary>

              <div className="space-y-5 border-t border-white/10 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-white">X API posting</h3>
                    <p className="mt-1 text-xs leading-relaxed text-white/40">
                      Uses your X Developer OAuth client and credits. Leave this collapsed if you only want the free browser composer.
                    </p>
                  </div>
                  <StatusBadge status={apiBadgeStatus} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold tracking-tight text-white/30">
                    Callback URI
                  </span>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-[11px] font-mono text-white/70 select-all">
                      {OAUTH_REDIRECT_URI}
                    </code>
                    <button
                      type="button"
                      onClick={copyRedirect}
                      className="app-button-secondary !h-9 !px-3 text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
                    >
                      <IconCopy size={14} />
                      {copiedRedirect ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>

                {!apiStatus.connected && (
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold tracking-tight text-white/30">OAuth 2.0 Client ID</label>
                    <input
                      type="password"
                      placeholder="X app OAuth 2.0 Client ID"
                      value={clientId}
                      onChange={(event) => setClientId(event.target.value)}
                      disabled={isAuthorizing}
                      className="app-input disabled:opacity-30 disabled:cursor-not-allowed"
                    />
                  </div>
                )}

                {authError && (
                  <div className="px-4 py-3 rounded-lg bg-danger/10 border border-danger/20">
                    <p className="text-xs font-semibold text-danger leading-relaxed">{authError}</p>
                  </div>
                )}

                {postError && (
                  <div className="px-4 py-3 rounded-lg bg-danger/10 border border-danger/20">
                    <p className="text-xs font-semibold text-danger leading-relaxed">{postError}</p>
                  </div>
                )}

                {lastPost && (
                  <a
                    href={lastPost.url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-3 rounded-lg bg-success/10 border border-success/20 flex items-center justify-between gap-3 group"
                  >
                    <span className="text-xs font-semibold text-success">Posted through X API - view post</span>
                    <IconExternalLink size={14} className="text-success/70 group-hover:text-success" />
                  </a>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {apiStatus.connected ? (
                    <button
                      type="button"
                      onClick={disconnectApi}
                      className="app-button-danger !h-11 text-sm font-semibold"
                    >
                      Disconnect API
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={connectApi}
                      disabled={isAuthorizing}
                      className="app-button-primary !h-11 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                    >
                      <IconBrandX size={16} />
                      {isAuthorizing ? 'Waiting for X...' : 'Connect API'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={postWithApi}
                    disabled={!canPostWithApi}
                    className="app-button-secondary !h-11 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                  >
                    <IconSend size={16} />
                    {isPosting ? 'Posting...' : 'Post via API'}
                  </button>
                  <button
                    type="button"
                    onClick={toggleAutoPost}
                    disabled={!apiStatus.connected || isSavingAutomation}
                    className={`app-button-secondary !h-11 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed ${autoPostGoLiveX ? '!text-success' : ''}`}
                  >
                    {autoPostGoLiveX ? 'Auto Post On' : 'Auto Post Off'}
                  </button>
                </div>
              </div>
            </details>
          </div>
        </section>

        <section className="app-section-card glass flex flex-col">
          <div className="flex items-center justify-between px-8 py-5 border-b border-white/5 bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <IconBrandX size={18} className="text-white" />
              <h2 className="!text-lg">Status</h2>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 p-8">
            <DiagnosticLine
              icon={<IconExternalLink size={16} />}
              label="Composer"
              value="Ready"
              tone="good"
            />
            <DiagnosticLine
              icon={<IconWifi size={16} />}
              label="Paid API"
              value={apiStatus.connected ? (apiStatus.handle ? `@${apiStatus.handle}` : 'Connected') : 'Optional'}
              tone={apiStatus.connected ? 'good' : 'muted'}
            />
            <DiagnosticLine
              icon={<IconRadio size={16} />}
              label="TikTok Auto Post"
              value={autoPostGoLiveX ? 'Enabled' : 'Disabled'}
              tone={autoPostGoLiveX ? 'good' : 'muted'}
            />
          </div>
        </section>
      </div>
    </div>
  )
}
