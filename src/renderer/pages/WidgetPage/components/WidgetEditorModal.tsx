import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { IconRefresh } from '../../../components/ui/icons'
import { type Widget } from '../../../../shared/widgets'
import { ConfigEditor } from './ConfigEditors'
import { WidgetThemeSection } from './ConfigEditors/WidgetThemeSection'
import { Modal } from '../../../components/ui/Modal'
import { buildWidgetPreviewUrl, getWidgetPreviewFrame } from '../widget-customization'
import { usePreviewViewportScale } from './usePreviewViewportScale'

// postMessage protocol with the iframe bootstrap (see widget-renderers.ts).
const PREVIEW_READY_MSG = 'ilystream:preview-ready'
const PREVIEW_HTML_MSG = 'ilystream:preview-html'
const PREVIEW_CONFIG_MSG = 'ilystream:preview-config'
const PREVIEW_NEEDS_HTML_MSG = 'ilystream:preview-needs-html'

// Throttle config-driven re-renders. Live-config templates apply changes via
// CSS variables (no DOM churn) so this could be near-zero, but HTML-fallback
// templates still benefit from coalescing bursts of typing.
const PREVIEW_THROTTLE_MS = 50

export function WidgetEditorModal({
  widget,
  overlayPort,
  onClose,
  onSave
}: {
  widget: Widget
  overlayPort: number | null
  onClose: () => void
  onSave: (widget: Widget) => Promise<void>
}) {
  const [draft, setDraft] = useState<Widget>(widget)
  const [previewOverride, setPreviewOverride] = useState<Widget | null>(null)
  const [saving, setSaving] = useState(false)
  // Iframe identity. Bumping this remounts the iframe (full reload — used for
  // the Refresh button and after Save in case the saved state diverged).
  const [iframeKey, setIframeKey] = useState(0)

  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const iframeReadyRef = useRef(false)
  const pendingWidgetRef = useRef<Widget | null>(null)
  const throttleTimerRef = useRef<number | null>(null)
  const lastSentAtRef = useRef(0)
  // Optimistic flag: assume the live-config protocol works until the iframe
  // tells us otherwise via `preview-needs-html`. Reset on every fresh iframe
  // mount (Refresh button or widget switch).
  const supportsLiveConfigRef = useRef(true)
  // Last widget we tried to send. Used to retry as HTML after the iframe
  // reports it doesn't support live-config.
  const lastSentWidgetRef = useRef<Widget | null>(null)

  const previewWidget = previewOverride ?? draft
  const previewFrame = getWidgetPreviewFrame(previewWidget)
  const {
    containerRef: previewViewportRef,
    viewportStyle: previewViewportStyle
  } = usePreviewViewportScale(previewFrame)

  // URL is stable for the lifetime of this widget+port pairing. The iframe
  // only reloads when the user explicitly hits Refresh (which bumps iframeKey).
  const previewUrl = useMemo(
    () => buildWidgetPreviewUrl(previewWidget, overlayPort),
    [previewWidget.id, overlayPort]
  )

  const renderAndPostPreviewHtml = useCallback(async (
    target: Widget,
    shouldPost: () => boolean = () => true
  ) => {
    if (!iframeReadyRef.current) return
    const iframe = iframeRef.current
    if (!iframe || !iframe.contentWindow) return

    lastSentWidgetRef.current = target

    try {
      const html = await window.api.widgets.renderPreview(target)
      if (!html) return
      if (!shouldPost()) return
      const currentIframe = iframeRef.current
      if (currentIframe !== iframe || !currentIframe.contentWindow) return
      currentIframe.contentWindow.postMessage({ type: PREVIEW_HTML_MSG, html }, '*')
    } catch (err) {
      console.error('Failed to render widget preview', err)
    }
  }, [])

  // Push the current draft into the iframe. Throttled to coalesce typing bursts.
  //
  // Strategy: optimistically send `preview-config` (just the config object) on
  // the assumption that the widget template implements the live-config hook.
  // Templates that don't post `preview-needs-html` back, at which point we
  // flip to the HTML-swap path for that iframe and re-send the latest state.
  const pushPreview = useCallback((target: Widget) => {
    pendingWidgetRef.current = target

    const send = async () => {
      throttleTimerRef.current = null
      const next = pendingWidgetRef.current
      if (!next) return
      pendingWidgetRef.current = null
      lastSentAtRef.current = Date.now()

      if (!iframeReadyRef.current) return
      const iframe = iframeRef.current
      if (!iframe || !iframe.contentWindow) return

      lastSentWidgetRef.current = next

      if (supportsLiveConfigRef.current) {
        // Fast path — no IPC round-trip, no DOM swap. If the template doesn't
        // have `__ilystreamApplyConfig`, the iframe will post back
        // `preview-needs-html` and we'll fall through to the slow path on the
        // *next* push.
        iframe.contentWindow.postMessage(
          { type: PREVIEW_CONFIG_MSG, config: next.config },
          '*'
        )
        return
      }

      await renderAndPostPreviewHtml(next, () => pendingWidgetRef.current === null)
    }

    const elapsed = Date.now() - lastSentAtRef.current
    if (elapsed >= PREVIEW_THROTTLE_MS) {
      // Past the throttle window — send on the next tick so React state has
      // settled before we serialize the widget.
      if (throttleTimerRef.current !== null) {
        window.clearTimeout(throttleTimerRef.current)
      }
      throttleTimerRef.current = window.setTimeout(send, 0)
    } else if (throttleTimerRef.current === null) {
      throttleTimerRef.current = window.setTimeout(send, PREVIEW_THROTTLE_MS - elapsed)
    }
  }, [renderAndPostPreviewHtml])

  // Reset draft when switching widgets (e.g. after Save → onSave passes us a
  // fresh widget object) and force a fresh iframe load.
  useEffect(() => {
    setDraft(widget)
    setPreviewOverride(null)
    iframeReadyRef.current = false
    pendingWidgetRef.current = null
    supportsLiveConfigRef.current = true
    lastSentWidgetRef.current = null
    setIframeKey((k) => k + 1)
  }, [widget.id])

  // Listen for iframe messages: READY (initial handshake) and NEEDS_HTML
  // (template has no `__ilystreamApplyConfig` — switch to HTML mode).
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return
      if (event.data?.type === PREVIEW_READY_MSG) {
        iframeReadyRef.current = true
        // Push HTML once on load so the iframe starts from the current draft,
        // including fields that a template's live-config hook cannot apply.
        void renderAndPostPreviewHtml(previewWidget)
        return
      }
      if (event.data?.type === PREVIEW_NEEDS_HTML_MSG) {
        // Template doesn't support live-config. Switch this iframe to the
        // HTML-swap path and resend the last attempted state so the user's
        // intent isn't dropped.
        if (supportsLiveConfigRef.current) {
          supportsLiveConfigRef.current = false
          const target = lastSentWidgetRef.current ?? previewWidget
          pushPreview(target)
        }
        return
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [pushPreview, renderAndPostPreviewHtml, previewWidget])

  // Push fresh HTML when anything the overlay HTML depends on changes. We
  // deliberately key off (type, config) rather than the widget object so
  // typing in the Name field — which doesn't appear in the overlay — doesn't
  // trigger an IPC round-trip + DOM swap for every keystroke.
  const previewSignal = useMemo(
    () => JSON.stringify({ t: previewWidget.type, c: previewWidget.config }),
    [previewWidget.type, previewWidget.config]
  )

  useEffect(() => {
    if (!iframeReadyRef.current) return
    pushPreview(previewWidget)
    // previewWidget is intentionally not in deps — previewSignal already
    // captures the parts of it that affect rendering.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewSignal, pushPreview])

  // Clean up timers.
  useEffect(() => {
    return () => {
      if (throttleTimerRef.current !== null) {
        window.clearTimeout(throttleTimerRef.current)
      }
    }
  }, [])

  const handleDraftChange = (next: Widget) => {
    setDraft(next)
    setPreviewOverride(null)
  }

  const handlePreviewOverride = (next: Widget) => {
    setPreviewOverride(next)
  }

  const handleRefresh = () => {
    iframeReadyRef.current = false
    pendingWidgetRef.current = null
    supportsLiveConfigRef.current = true
    lastSentWidgetRef.current = null
    setIframeKey((k) => k + 1)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(draft)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      className="max-w-6xl h-[90vh]"
      headerActions={
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-1.5 text-sm font-semibold text-white focus:border-accent/50 focus:outline-none w-64 transition-all"
            placeholder="Widget name"
          />
          <span className="text-2xs font-semibold tracking-normal text-white/20">
            {draft.type}
          </span>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] h-full">
        {/* Config */}
        <div className="border-r border-white/5 overflow-y-auto custom-scrollbar p-8 bg-black/20">
          <div className="mb-8">
            <WidgetThemeSection draft={draft} onChange={handleDraftChange} />
          </div>
          <ConfigEditor draft={draft} onChange={handleDraftChange} onPreview={handlePreviewOverride} />
        </div>

        {/* Preview */}
        <div className="bg-[#050505] flex flex-col min-h-0 relative">
          <div className="absolute top-4 right-4 z-context flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="w-10 h-10 grid place-items-center rounded-lg bg-white/5 border border-white/10 hover:border-accent/40 text-white/60 hover:text-white transition-all cursor-pointer"
              title="Reload preview"
              aria-label="Reload preview"
            >
              <IconRefresh size={18} />
            </button>
          </div>

          <div className="flex-1 flex items-center justify-center p-8 overflow-hidden">
            {previewUrl ? (
              <div
                className={`relative shadow-2xl transition-all duration-500 ease-in-out ${previewFrame.isVertical ? '' : 'w-full max-w-[920px]'}`}
                style={previewFrame.isVertical
                  ? { height: 'calc(100% - 56px)', maxWidth: '100%', aspectRatio: previewFrame.aspectRatio }
                  : { aspectRatio: previewFrame.aspectRatio, maxHeight: 'calc(100% - 56px)' }
                }
              >
                <div
                  ref={previewViewportRef}
                  className="absolute inset-0 rounded-md overflow-hidden border border-white/10"
                  style={{
                    backgroundColor: '#07080b',
                    backgroundImage:
                      'linear-gradient(45deg, rgba(255,255,255,0.045) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.045) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.045) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.045) 75%)',
                    backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0',
                    backgroundSize: '20px 20px'
                  }}
                >
                  <iframe
                    key={iframeKey}
                    ref={iframeRef}
                    src={previewUrl}
                    title="Widget preview"
                    className="absolute left-0 top-0"
                    style={{
                      ...previewViewportStyle,
                      border: 'none',
                      background: 'transparent',
                      pointerEvents: 'none'
                    }}
                  />
                </div>

                {/* Resolution Badge */}
                <div className="absolute -bottom-8 left-0 right-0 flex justify-center">
                  <span className="text-[10px] font-semibold tracking-normal text-white/10">
                    {previewFrame.resolutionLabel}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="w-16 h-16 rounded-lg bg-white/[0.03] border border-white/5 flex items-center justify-center text-white/10 mb-2">
                  <IconRefresh size={32} />
                </div>
                <div className="text-sm font-semibold text-white/30">Overlay Server Offline</div>
                <div className="text-xs text-white/10 max-w-[200px]">Start the server from Settings to enable live preview.</div>
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-white/5 flex items-center justify-end gap-3 bg-black/40">
            <button
              onClick={onClose}
              className="h-11 px-6 rounded-lg text-[13px] font-semibold text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              Discard
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="h-11 px-7 rounded-lg bg-accent text-[#0a0b0e] text-[13px] font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:brightness-110 active:brightness-95"
            >
              {saving ? 'Saving…' : 'Apply changes'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
