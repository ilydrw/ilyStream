import { useState } from 'react'
import { IconLayout, IconSettings } from '@tabler/icons-react'
import { IconTrash, IconCheck, IconCopy, IconExternalLink } from '../../../components/ui/icons'
import { type Widget } from '../../../../shared/widgets'
import { appendPreviewFlag, getWidgetPreviewFrame, getWidgetTemplate } from '../widget-customization'
import { usePreviewViewportScale } from './usePreviewViewportScale'

export function WidgetCard({
  widget,
  url,
  previewUrl,
  copyState,
  onCopyUrl,
  onConfigure,
  onDelete
}: {
  widget: Widget
  /** Browser-source URL shown to the user — may carry the LAN host for OBS. */
  url: string | null
  /**
   * Loopback URL for the in-app preview iframe. The renderer CSP only allows
   * framing 127.0.0.1/localhost, so framing the LAN-host `url` is blocked.
   */
  previewUrl: string | null
  copyState: boolean
  onCopyUrl: () => void
  onConfigure: () => void
  onDelete: () => void
}) {
  const template = getWidgetTemplate(widget.type)
  const Icon = template?.icon ?? IconLayout
  const previewFrame = getWidgetPreviewFrame(widget)
  const {
    containerRef: previewViewportRef,
    viewportStyle: previewViewportStyle
  } = usePreviewViewportScale(previewFrame)

  // Card previews are lazy: we mount the iframe the first time the user
  // hovers, focuses, or tabs into the card and keep it mounted. The previous
  // implementation rendered a scaled-down live iframe for every card on every
  // render, which meant N widgets = N simultaneous overlay simulations
  // (animations, SSE connections, audio contexts) running just to populate
  // the grid. Now an idle grid does zero overlay work.
  const [hasActivated, setHasActivated] = useState(false)
  const activate = () => {
    if (!previewUrl) return
    if (!hasActivated) setHasActivated(true)
  }

  return (
    <section className="app-section-card glass overflow-hidden flex flex-col">
      <div className="p-5 border-b border-white/[0.05] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center text-accent shrink-0">
            <Icon size={18} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white truncate">{widget.name}</h3>
            <p className="text-[10px] tracking-normal text-white/30 mt-0.5">
              {template?.label ?? widget.type}
            </p>
          </div>
        </div>
        <button
          onClick={onDelete}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-white/30 hover:text-danger hover:bg-danger/10 transition-all"
          title="Delete widget"
        >
          <IconTrash size={15} />
        </button>
      </div>

      <div className="p-5 flex flex-col gap-6">


        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold tracking-normal text-white/30">Browser source URL</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-black/40 border border-white/5 font-mono text-[11px] text-white/60 min-w-0">
            <span className="truncate flex-1" title={url ?? ''}>
              {url ?? 'Overlay server not running'}
            </span>
            <button
              onClick={onCopyUrl}
              disabled={!url}
              className="p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30"
              title="Copy URL"
            >
              {copyState ? <IconCheck size={13} className="text-success" /> : <IconCopy size={13} />}
            </button>
          </div>

          {/* Preview area — static placeholder until the user hovers. The
              real interactive entry-point is the Configure button below;
              this surface is decorative. */}
          <div
            className="mt-2 relative w-full rounded-lg overflow-hidden border border-white/5 bg-black/60 transition-all group/preview"
            style={{ aspectRatio: '16 / 9' }}
            onPointerEnter={activate}
          >
            {previewUrl ? (
              <>
                {/* Default placeholder: shown until the iframe is activated.
                    Once activated, the iframe sits on top with the same
                    natural-ratio inner frame. */}
                <CardPlaceholder Icon={Icon} resolutionLabel={previewFrame.resolutionLabel} active={hasActivated} />

                {hasActivated ? (
                  <div className="absolute inset-0 flex items-center justify-center p-2 pointer-events-none">
                    <div
                      ref={previewViewportRef}
                      className="relative overflow-hidden rounded-md border border-white/10 bg-black/40 shadow-lg"
                      style={
                        previewFrame.isVertical
                          ? { height: '100%', aspectRatio: previewFrame.aspectRatio }
                          : { width: '100%', aspectRatio: previewFrame.aspectRatio }
                      }
                    >
                      <iframe
                        src={appendPreviewFlag(previewUrl)}
                        title={`${widget.name} preview`}
                        className="absolute left-0 top-0 border-none"
                        style={{ ...previewViewportStyle, background: 'transparent' }}
                        // Cards are decorative; the click-target is the overlay below.
                        tabIndex={-1}
                      />
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-[10px] font-semibold text-white/20 tracking-normal gap-2">
                <Icon size={28} className="opacity-30" />
                <span>Preview offline</span>
              </div>
            )}

            <div
              className={`absolute top-2 right-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/60 border border-white/10 text-[8px] font-semibold tracking-normal pointer-events-none ${
                !previewUrl ? 'text-white/25' : hasActivated ? 'text-accent' : 'text-white/40'
              }`}
            >
              <div
                className={`w-1 h-1 rounded-full ${
                  !previewUrl ? 'bg-white/20' : hasActivated ? 'bg-accent animate-pulse' : 'bg-white/40'
                }`}
              />
              {!previewUrl ? 'Offline' : hasActivated ? 'Live' : 'Hover to load'}
            </div>

            {/* Click to configure overlay (sits above the iframe so the iframe is
                inert and clicks always open the editor). */}
            <div
              className="absolute inset-0 z-10 cursor-pointer"
              onClick={onConfigure}
              aria-hidden="true"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={onConfigure} className="flex-1 app-button-primary !h-10 text-xs font-semibold">
            <IconSettings size={14} className="mr-2 opacity-60" />
            Configure
          </button>
          <button
            onClick={() => url && window.open(url, '_blank')}
            disabled={!url}
            className="app-button !w-10 !h-10 flex items-center justify-center disabled:opacity-30"
            title="Open in browser"
          >
            <IconExternalLink size={14} />
          </button>
        </div>
      </div>
    </section>
  )
}

function CardPlaceholder({
  Icon,
  resolutionLabel,
  active
}: {
  Icon: React.ComponentType<{ size?: number; className?: string }>
  resolutionLabel: string
  active: boolean
}) {
  // When the iframe activates we fade the placeholder out instead of
  // unmounting it. It still sits behind the iframe so transparent widgets
  // (alerts, particles, screen-border) get a non-flickering backdrop.
  return (
    <div
      className={`absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/30 transition-opacity duration-300 ${
        active ? 'opacity-30' : 'opacity-100'
      }`}
    >
      <Icon size={36} className="opacity-50" />
      <span className="text-[10px] font-semibold tracking-normal text-white/40">
        {resolutionLabel}
      </span>
    </div>
  )
}
