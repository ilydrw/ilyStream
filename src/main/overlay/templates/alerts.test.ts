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

  it('plays alert audio only when its visual dequeues', () => {
    const html = buildAlertsOverlayHtml(widget, false)
    const queueAlertStart = html.indexOf('function queueAlert(alert)')
    const queueAlertEnd = html.indexOf('function rememberLimited')
    const queueAlertBlock = html.slice(queueAlertStart, queueAlertEnd)
    const showAlertCall = html.indexOf('showAlert(alert);')
    const showAudioCall = html.indexOf('playAlertAudioOnce(alert);')

    expect(queueAlertBlock).not.toContain('playAlertAudioOnce(alert);')
    expect(showAlertCall).toBeGreaterThan(-1)
    expect(showAudioCall).toBeGreaterThan(showAlertCall)
    expect(html).toContain('const playedAudioIds = new Set();')
    expect(html).toContain('const audioCache = new Map();')
  })

  it('uses fallback polling only while the alert event stream is unavailable', () => {
    const html = buildAlertsOverlayHtml(widget, false)
    const onopenStart = html.indexOf('eventSource.onopen = function()')
    const onmessageStart = html.indexOf('eventSource.onmessage = function(event)')
    const onopenBlock = html.slice(onopenStart, onmessageStart)

    expect(html).toContain('function stopPolling()')
    expect(onopenBlock).toContain('stopPolling();')
    expect(onopenBlock).toContain('pollAlertState(true);')
    expect(onopenBlock).not.toContain('startPolling(true);')
  })

  it('renders a dedicated clean card for follow and gift alerts', () => {
    const html = buildAlertsOverlayHtml(widget, false)

    expect(html).toContain('.alert-wrapper.alert-clean')
    expect(html).toContain('function renderCleanAlert(alert, cleanAlertType)')
    expect(html).toContain("alert.variant === 'clean-gift'")
    expect(html).toContain("alert.variant === 'clean-follow'")
    expect(html).toContain("alert.variant === 'clean-superfan'")
  })
})
