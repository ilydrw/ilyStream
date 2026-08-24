import { useEffect, useRef, useState } from 'react'
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

  const previewRef = useRef<HTMLDivElement | null>(null)
  const [hasActivated, setHasActivated] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)

  // Activate previews automatically as they enter the visible grid. This
  // keeps the page useful without creating runtimes for off-screen cards.
  useEffect(() => {
    setHasActivated(false)
    setHasLoaded(false)
    if (!previewUrl) return

    const preview = previewRef.current
    if (!preview || typeof IntersectionObserver === 'undefined') {
      setHasActivated(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setHasActivated(true)
        observer.disconnect()
      },
      { rootMargin: '160px 0px' }
    )
    observer.observe(preview)
    return () => observer.disconnect()
  }, [previewUrl])

  const runtimeLabel = !previewUrl ? 'Offline' : hasLoaded ? 'Live preview' : 'Loading'

  return (
    <article className="app-section-card glass widget-library-card">
      <header className="widget-library-card-header">
        <div className="widget-library-card-identity">
          <span className="widget-library-card-icon">
            <Icon size={19} />
          </span>
          <span>
            <h3 title={widget.name}>{widget.name}</h3>
            <small>{template?.label ?? widget.type}</small>
          </span>
        </div>
        <div className="widget-library-card-header-actions">
          <span className={`widget-library-card-runtime ${!previewUrl ? 'is-offline' : hasLoaded ? 'is-live' : 'is-loading'}`}>
            <i aria-hidden="true" />
            {runtimeLabel}
          </span>
          <button type="button" className="widget-library-card-delete" onClick={onDelete} title="Delete widget" aria-label={`Delete ${widget.name}`}>
            <IconTrash size={15} />
          </button>
        </div>
      </header>

      <div ref={previewRef} className="widget-library-card-preview">
        {previewUrl ? (
          <>
            <CardPlaceholder Icon={Icon} resolutionLabel={previewFrame.resolutionLabel} active={hasLoaded} />
            {hasActivated ? (
              <div className="widget-library-card-preview-frame">
                <div
                  ref={previewViewportRef}
                  className="widget-library-card-preview-viewport"
                  style={
                    previewFrame.isVertical
                      ? { height: '100%', aspectRatio: previewFrame.aspectRatio }
                      : { width: '100%', aspectRatio: previewFrame.aspectRatio }
                  }
                >
                  <iframe
                    src={appendPreviewFlag(previewUrl)}
                    title={`${widget.name} preview`}
                    style={{ ...previewViewportStyle, background: 'transparent' }}
                    onLoad={() => setHasLoaded(true)}
                    tabIndex={-1}
                  />
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="widget-library-card-preview-offline">
            <Icon size={30} />
            <strong>Preview offline</strong>
            <span>Your saved widget is unchanged</span>
          </div>
        )}
        <span className="widget-library-card-resolution">{previewFrame.resolutionLabel}</span>
        <button type="button" className="widget-library-card-preview-hit" onClick={onConfigure} aria-label={`Configure ${widget.name}`} />
      </div>

      <div className="widget-library-card-body">
        <p>{template?.description ?? 'Custom browser-source widget ready for your streaming layout.'}</p>

        <div className="widget-library-card-url-group">
          <span>Browser source URL</span>
          <div className="widget-library-card-url">
            <code title={url ?? ''}>{url ?? 'Overlay server not running'}</code>
            <button type="button" onClick={onCopyUrl} disabled={!url} title="Copy URL" aria-label={`Copy URL for ${widget.name}`}>
              {copyState ? <IconCheck size={14} /> : <IconCopy size={14} />}
            </button>
          </div>
        </div>

        <div className="widget-library-card-actions">
          <button type="button" onClick={onConfigure} className="app-button-primary">
            <IconSettings size={14} />
            Configure
          </button>
          <button
            type="button"
            onClick={() => url && window.open(url, '_blank')}
            disabled={!url}
            className="app-button"
            title="Open in browser"
            aria-label={`Open ${widget.name} in browser`}
          >
            <IconExternalLink size={14} />
          </button>
        </div>
      </div>
    </article>
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
  // Keep this behind transparent widgets so they retain a stable backdrop.
  return (
    <div className={`widget-library-card-placeholder ${active ? 'is-active' : ''}`}>
      <Icon size={34} />
      <span>{resolutionLabel}</span>
    </div>
  )
}
