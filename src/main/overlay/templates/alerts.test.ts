import { describe, expect, it } from 'vitest'
import { buildAlertsOverlayHtml } from './alerts'

const widget = {
  id: 'alerts',
  name: 'Alerts',
  type: 'alerts',
  config: {}
} as any

describe('alerts overlay template', () => {
  it('emits syntactically valid browser runtime code', () => {
    const html = buildAlertsOverlayHtml(widget, false)
    const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1]

    expect(script).toBeTruthy()
    expect(() => new Function(script!)).not.toThrow()
  })

  it('does not render visible diagnostics or keep-alive pixels into OBS', () => {
    const html = buildAlertsOverlayHtml(widget, false)

    expect(html).not.toContain('id="diag"')
    expect(html).not.toContain('diag-overlay">DISCONNECTED')
    expect(html).not.toContain('id="keep-alive"')
    expect(html).not.toContain('rendering-heartbeat')
  })

  it("starts a visual alert's audio only when its visual dequeues", () => {
    const html = buildAlertsOverlayHtml(widget, false)
    const queueAlertStart = html.indexOf('function queueAlert(alert)')
    const queueAlertEnd = html.indexOf('function rememberLimited')
    const queueAlertBlock = html.slice(queueAlertStart, queueAlertEnd)
    const showAlertStart = html.indexOf('function showAlert(alert)')
    const showAlertEnd = html.indexOf('const diag = null')
    const showAlertBlock = html.slice(showAlertStart, showAlertEnd)

    expect(queueAlertBlock).not.toContain('playAlertAudioOnce(alert);')
    expect(showAlertStart).toBeGreaterThan(-1)
    expect(showAlertBlock).toContain('queueAlertAudio(alert);')
    expect(html).toContain('Promise.resolve(playAlertAudioOnce(alert))')
    expect(html).toContain('const playedAudioIds = new Set();')
    expect(html).toContain('const audioCache = new Map();')
  })

  it('releases the visual queue on visual duration without waiting for audio', () => {
    const html = buildAlertsOverlayHtml(widget, false)

    expect(html).toContain('const audioQueue = [];')
    expect(html).toContain('queueAlertAudio(alert);')
    expect(html).not.toContain('Promise.all([visualFinished, audioFinished])')
    expect(html).toContain('finishAlert();')
    expect(html).toContain('AUDIO_PLAYBACK_MAX_MS')
  })

  it('keeps audio-only items out of the visual queue and bounds stale work', () => {
    const html = buildAlertsOverlayHtml(widget, false)
    const queueAlertStart = html.indexOf('function queueAlert(alert)')
    const queueAlertEnd = html.indexOf('function isAlertStale(alert)')
    const queueAlertBlock = html.slice(queueAlertStart, queueAlertEnd)

    expect(queueAlertBlock).toContain('if (hasVisual)')
    expect(queueAlertBlock).toContain('} else if (hasAudio) {')
    expect(queueAlertBlock).toContain('queueAlertAudio(alert);')
    expect(html).toContain('const MAX_ALERT_AGE_MS = 15 * 1000;')
    expect(html).toContain('const MAX_PENDING_VISUAL_ALERTS = 4;')
    expect(html).toContain('const MAX_PENDING_AUDIO_ALERTS = 4;')
    expect(html).toContain("removeStaleQueuedAlerts(alertQueue, 'visual');")
  })

  it('revisions alert images per event and handles synchronous cache completion', () => {
    const html = buildAlertsOverlayHtml(widget, false)

    expect(html).toContain('window.__ilyAvatar.proxy(alert.imageUrl, alert.id || alert.createdAt)')
    expect(html).toContain('window.__ilyAvatar.resolve(alert.imageUrl, headline, alert.id || alert.createdAt)')
    expect(html).toContain('if (alertImg.complete)')
    expect(html).toContain('if (alertImg.naturalWidth > 0) handleImageLoaded();')
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

  it('renders dedicated clean cards for standard and like-milestone alerts', () => {
    const html = buildAlertsOverlayHtml(widget, false)

    expect(html).toContain('.alert-wrapper.alert-clean')
    expect(html).toContain('function renderCleanAlert(alert, cleanAlertType)')
    expect(html).toContain("alert.variant === 'clean-gift'")
    expect(html).toContain("alert.variant === 'clean-follow'")
    expect(html).toContain("alert.variant === 'clean-superfan'")
    expect(html).toContain("alert.variant === 'clean-like-milestone'")
    expect(html).toContain("cleanAlertType === 'like-milestone'")
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

  it('keeps dark transparent alert artwork visible against the glass card', () => {
    const html = buildAlertsOverlayHtml(widget, false)

    expect(html).toContain('.alert-image-container:not(.alert-image-failed)::before')
    expect(html).toContain('background: rgba(255, 255, 255, 0.38)')
    expect(html).toContain('drop-shadow(0 0 1px rgba(255, 255, 255, 0.70))')
  })
})
