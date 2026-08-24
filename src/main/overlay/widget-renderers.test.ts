import { describe, expect, it } from 'vitest'
import {
  getDefaultWidgetConfig,
  injectOverlayRuntimeBootstrap,
  injectPreviewBootstrap,
  renderWidgetPreviewContent
} from './widget-renderers'
import type { Widget } from '../../shared/widgets'

describe('injectPreviewBootstrap', () => {
  it('loads full HTML updates in an isolated child document', () => {
    const widgetHtml = `<!DOCTYPE html>
<html>
<head><title>Canvas widget</title></head>
<body>
  <canvas id="node-canvas"></canvas>
  <script>const canvas = document.getElementById('node-canvas');</script>
</body>
</html>`

    const previewHtml = injectPreviewBootstrap(widgetHtml, 'preview-token')

    expect(previewHtml).toContain('id="ilystream-preview-bootstrap"')
    expect(previewHtml).toContain('id="ilystream-preview-frame-a"')
    expect(previewHtml).toContain('id="ilystream-preview-frame-b"')
    expect(previewHtml).toContain('frame.srcdoc = htmlString;')
    expect(previewHtml).toContain("frame.classList.add('is-active')")
    expect(previewHtml).toContain("previous.classList.remove('is-active')")
    expect(previewHtml).toContain('if (!previous) activateFrame(frame, null, revision);')
    expect(previewHtml).toContain('ACTIVATION_FALLBACK_MS=250')
    expect(previewHtml).toContain('activateFrame(frame, previous, revision);')
    expect(previewHtml).not.toContain('replaceChild(ns, old)')
    expect(previewHtml).not.toContain('<canvas id="node-canvas">')
    expect(previewHtml).toContain('\\u003cscript>const canvas =')
  })

  it('escapes closing script tags in the initial widget document', () => {
    const widgetHtml = '<script>window.widgetLoaded = true;</script>'

    const previewHtml = injectPreviewBootstrap(widgetHtml, '</script><script>bad()</script>')

    expect(previewHtml.match(/id="ilystream-preview-bootstrap"/g)).toHaveLength(1)
    expect(previewHtml).not.toContain('</script><script>bad()</script>')
    expect(previewHtml).toContain('\\u003c/script>\\u003cscript>bad()\\u003c/script>')
  })
})

describe('renderWidgetPreviewContent', () => {
  it('returns raw widget content instead of nesting another preview shell', () => {
    const widget: Widget = {
      id: 'screen-border-preview',
      name: 'Screen border preview',
      type: 'screen-border',
      config: getDefaultWidgetConfig('screen-border')
    }

    const previewContent = renderWidgetPreviewContent(widget, {
      settings: {},
      boardSounds: [],
      deckActions: []
    })

    expect(previewContent).not.toBeNull()
    expect(previewContent).toContain('id="ilystream-overlay-runtime"')
    expect(previewContent).not.toContain('id="ilystream-preview-bootstrap"')
    expect(previewContent).not.toContain('ilystream:preview-ready')
  })
})

describe('injectOverlayRuntimeBootstrap', () => {
  it('embeds targeted widget metadata and intercepts config control messages', () => {
    const html = injectOverlayRuntimeBootstrap(
      '<html><head></head><body></body></html>',
      {
        widget: { id: 'text-1', type: 'text' },
        sourceKind: 'id'
      }
    )

    expect(html).toContain('id="ilystream-widget-runtime-meta"')
    expect(html).toContain('"widgetId":"text-1"')
    expect(html).toContain('"eventChannel":"text"')
    expect(html).toContain('"runtimeOwnsEventStream":true')
    expect(html).toContain('"generation":""')
    expect(html).toContain("message.type === 'widget-config'")
    expect(html).toContain("message.type === 'reload'")
    expect(html).toContain("generation !== String(WIDGET_META.generation || '')")
    expect(html).toContain('if (handleWidgetControl(data)) return;')
    expect(html).toContain("applyConfig.call(window, message.config || {}) !== false")
  })

  it('resets stale polling cursors after the overlay server restarts', () => {
    const html = injectOverlayRuntimeBootstrap('<html><head></head><body></body></html>')

    expect(html).toContain('generation !== self._serverGeneration')
    expect(html).toContain('Boolean(result && result.reset)')
    expect(html).toContain('self._lastEventId = 0;')
    expect(html).toContain('self._pollInFlight')
  })

  it('bounds requests and prevents native/polling races from duplicating events', () => {
    const html = injectOverlayRuntimeBootstrap('<html><head></head><body></body></html>')

    expect(html).toContain('var REQUEST_TIMEOUT_MS = 5000;')
    expect(html).toContain('controller.abort()')
    expect(html).toContain('xhr.timeout = REQUEST_TIMEOUT_MS')
    expect(html).toContain('try { self._native.close(); }')
    expect(html).toContain('if (numericId <= this._lastEventId) return;')
  })

  it('reconciles an apparently-open native stream against event history', () => {
    const html = injectOverlayRuntimeBootstrap('<html><head></head><body></body></html>')

    expect(html).toContain('var RECONCILE_INTERVAL_MS = 3000;')
    expect(html).toContain('self._startReconciliation();')
    expect(html).toContain('self._pollOnce(true);')
    expect(html).toContain("url.searchParams.set('since', String(this._startedAt))")
  })

  it('prefers a multiplexed WebSocket hub before the SSE recovery stack', () => {
    const html = injectOverlayRuntimeBootstrap('<html><head></head><body></body></html>')

    expect(html).toContain("new SharedWorker('/overlay/runtime/shared-worker.js?v=2'")
    expect(html).toContain("new WebSocket(socketUrl())")
    expect(html).toContain('this._startHub();')
    expect(html).toContain('this._startNative();')
    expect(html).toContain('var HUB_OPEN_TIMEOUT_MS = 2500;')
    expect(html).toContain('limit: 120')
    expect(html).not.toContain('if (Number(message.cursor) > targeted.after)')
    expect(html).toContain('scheduleHubReceipt(hub, self._hubSubscriptionId, message, receivedAt)')
    expect(html).toContain("message.type = 'receipt'")
  })
})
