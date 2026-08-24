import { describe, expect, it } from 'vitest'
import { DEFAULT_BRB_SCREEN_CONFIG, type Widget } from '../../../shared/widgets'
import { buildBrbScreenHtml } from './brb-screen'

function makeWidget(config: Record<string, unknown> = {}): Widget {
  return {
    id: 'brb-test',
    name: 'BRB',
    type: 'brb-screen',
    config: { ...DEFAULT_BRB_SCREEN_CONFIG, ...config }
  }
}

describe('buildBrbScreenHtml', () => {
  it('renders a self-contained minimal BRB screen by default', () => {
    const html = buildBrbScreenHtml(makeWidget(), true)

    expect(html).toContain('BE RIGHT BACK')
    expect(html).toContain('STREAM PAUSED')
    expect(html).toContain('class="decor decor-orbit"')
    expect(html).toContain('data-aspect="auto"')
    expect(html).toContain('channel=brb-screen')
    expect(html).toContain("window.location.protocol === 'http:' || window.location.protocol === 'https:'")
    expect(html).not.toMatch(/<(?:script|link|img)\b[^>]*(?:src|href)\s*=\s*["']https?:\/\//i)
  })

  it('does not initialize live reload inside an about:srcdoc preview', () => {
    const html = buildBrbScreenHtml(makeWidget(), true)
    const script = html.match(/<script>\s*([\s\S]*?)<\/script>\s*<\/body>/)?.[1]
    let eventSourceCalls = 0

    function RuntimeEventSource(): void {
      eventSourceCalls += 1
      throw new Error('EventSource should not be constructed for about:srcdoc')
    }

    function RuntimeUrl(): void {
      throw new Error('URL should not be constructed for about:srcdoc')
    }

    const execute = new Function('window', 'document', 'EventSource', 'URL', script || '')

    expect(() => execute(
      { location: { protocol: 'about:', href: 'about:srcdoc' }, setInterval: () => 0 },
      { querySelector: () => null, getElementById: () => null },
      RuntimeEventSource,
      RuntimeUrl
    )).not.toThrow()
    expect(eventSourceCalls).toBe(0)
  })

  it('honors portrait, countdown, artwork, and clock options', () => {
    const html = buildBrbScreenHtml(makeWidget({
      forceTikTokDimensions: true,
      aspectRatio: 'tiktok',
      decorationStyle: 'dots',
      decorationMotion: 'float',
      countdownEnabled: true,
      countdownMinutes: 2.5,
      clockFormat: '24-hour',
      panelEnabled: true,
      showCountdownProgress: true
    }))

    expect(html).toContain('data-force-tiktok="1"')
    expect(html).toContain('data-aspect="tiktok"')
    expect(html).toContain('class="decor decor-dots"')
    expect(html).toContain('decor-float')
    expect(html).toContain('var totalSeconds = 150;')
    expect(html).toContain('hour12: false')
    expect(html).toContain('id="countdown-progress"')
    expect(html).toContain('backdrop-filter: blur(18px)')
  })

  it('escapes copy and rejects unsafe style and media values', () => {
    const injection = '</script><script>window.pwned=true</script>'
    const html = buildBrbScreenHtml(makeWidget({
      title: '<img src=x onerror=alert(1)>',
      countdownEnabled: true,
      countdownCompleteText: injection,
      backgroundImageUrl: 'javascript:alert(1)',
      fontFamily: 'Inter";}</style><script>alert(1)</script>',
      accentColor: '#fff; background: red'
    }))

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
    expect(html).not.toContain(injection)
    expect(html).toContain('var mediaUrl = "";')
    expect(html).toContain('--accent: #FF7A45;')
    expect(html).toContain('font-family: "Outfit"')
  })
})
