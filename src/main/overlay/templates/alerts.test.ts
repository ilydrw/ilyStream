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

  it('keeps the legacy glass look when the widget has no explicit card settings', () => {
    const html = buildAlertsOverlayHtml(widget, false)

    // glassIntensity 0.5 → alpha 0.2 + 0.5*0.4 = 0.4, blur 30px, chrome at full strength.
    expect(html).toContain('--glass-bg: rgba(10, 12, 18, 0.4)')
    expect(html).toContain('--blur: 30.0px')
    expect(html).toContain('--card-border-width: 1px')
    expect(html).toContain('--card-shadow-alpha: 0.600')
    expect(html).toContain('--card-shine: 1.000')
  })

  it('honors explicit widget card settings, including full transparency', () => {
    const transparentWidget = {
      ...widget,
      config: {
        backgroundColor: '#102030',
        backgroundOpacity: 0,
        blur: 40,
        borderWidth: 3,
        textColor: '#aabbcc'
      }
    }
    const html = buildAlertsOverlayHtml(transparentWidget, false)

    // Opacity 0 → fully transparent tint AND the panel chrome scales away:
    // no drop shadow, no shine, no frost — a truly invisible card.
    expect(html).toContain('--glass-bg: rgba(16, 32, 48, 0)')
    expect(html).toContain('--card-shadow-alpha: 0.000')
    expect(html).toContain('--card-shine: 0.000')
    expect(html).toContain('--blur: 0.0px')
    expect(html).toContain('--card-border-width: 3px')
    expect(html).toContain('--alert-text-color: #aabbcc')
  })

  it('ships the per-alert card style machinery for rule-level overrides', () => {
    const html = buildAlertsOverlayHtml(widget, false)

    expect(html).toContain('function applyCardStyle(content, alert, isCyber)')
    expect(html).toContain('function composeBackground(color, opacityPercent)')
    expect(html).toContain('function normalizeImagePlacement(value)')
    expect(html).toContain('function normalizeTextAlign(value)')
    expect(html).toContain("clampNumber(alert.imageSize, 0, 1024, 0)")
    expect(html).toContain('alert.paddingX')
    expect(html).toContain('alert.borderRadius')
  })
})
