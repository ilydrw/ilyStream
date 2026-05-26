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

  it('plays alert audio when an alert is received instead of when its visual dequeues', () => {
    const html = buildAlertsOverlayHtml(widget, false)
    const queueAudioCall = html.indexOf('playAlertAudioOnce(alert);')
    const showAlertCall = html.indexOf('showAlert(alert);')

    expect(queueAudioCall).toBeGreaterThan(-1)
    expect(showAlertCall).toBeGreaterThan(-1)
    expect(queueAudioCall).toBeLessThan(showAlertCall)
    expect(html).toContain('const playedAudioIds = new Set();')
    expect(html).toContain('const audioCache = new Map();')
  })
})
