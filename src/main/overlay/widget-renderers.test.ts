import { describe, expect, it } from 'vitest'
import { injectOverlayRuntimeBootstrap, injectPreviewBootstrap } from './widget-renderers'

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

describe('injectOverlayRuntimeBootstrap', () => {
  it('resets stale polling cursors after the overlay server restarts', () => {
    const html = injectOverlayRuntimeBootstrap('<html><head></head><body></body></html>')

    expect(html).toContain('generation !== self._serverGeneration')
    expect(html).toContain('Boolean(result && result.reset)')
    expect(html).toContain('self._lastEventId = 0;')
    expect(html).toContain('self._pollInFlight')
  })
})
