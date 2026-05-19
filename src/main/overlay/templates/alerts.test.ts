import { describe, expect, it } from 'vitest'
import { buildAlertsOverlayHtml } from './alerts'

const widget = {
  id: 'alerts',
  name: 'Alerts',
  type: 'alerts',
  config: {}
} as any

describe('alerts overlay template', () => {
  it('does not render visible diagnostics or keep-alive pixels into OBS', () => {
    const html = buildAlertsOverlayHtml(widget, false)

    expect(html).not.toContain('id="diag"')
    expect(html).not.toContain('diag-overlay">DISCONNECTED')
    expect(html).not.toContain('id="keep-alive"')
    expect(html).not.toContain('rendering-heartbeat')
  })
})
