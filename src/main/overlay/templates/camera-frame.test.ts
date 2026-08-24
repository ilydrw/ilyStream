import { describe, expect, it } from 'vitest'
import { DEFAULT_CAMERA_FRAME_CONFIG, type Widget } from '../../../shared/widgets'
import { buildCameraFrameHtml } from './camera-frame'

function makeWidget(config: Record<string, unknown> = {}): Widget {
  return {
    id: 'camera-frame-test',
    name: 'Camera Frame',
    type: 'camera-frame',
    config: { ...DEFAULT_CAMERA_FRAME_CONFIG, ...config }
  }
}

describe('buildCameraFrameHtml', () => {
  it('renders a self-contained rounded camera mask outline by default', () => {
    const html = buildCameraFrameHtml(makeWidget(), true)

    expect(html).toContain('<title>Camera Mask Outline</title>')
    expect(html).toContain('class="frame-line frame-primary"')
    expect(html).toContain('rx="90"')
    expect(html).toContain('data-fixed-ratio="0"')
    expect(html).toContain('data-preview-bg="1"')
    expect(html).toContain('channel=camera-frame')
    expect(html).toContain('.frame-stage {\n      position: fixed;')
    expect(html).toContain('position: absolute;\n      inset: 0;\n      display: block;')
    expect(html).not.toMatch(/<(?:script|link|img)\b[^>]*(?:src|href)\s*=\s*["']https?:\/\//i)
  })

  it.each(['rectangle', 'rounded', 'ellipse', 'pill'] as const)(
    'lets the %s outline stretch to the complete browser-source viewport',
    (shape) => {
      const html = buildCameraFrameHtml(makeWidget({ shape }))

      expect(html).toContain('data-fixed-ratio="0"')
      expect(html).toContain('.frame-shell {')
      expect(html).toContain('min-height: 0;')
    }
  )

  it('keeps circle and polygon masks proportional while honoring matte and double-line options', () => {
    const circle = buildCameraFrameHtml(makeWidget({
      shape: 'circle',
      frameStyle: 'double',
      matteEnabled: true,
      decorationStyle: 'nodes',
      labelEnabled: true,
      labelText: 'CAM 01'
    }))
    const hexagon = buildCameraFrameHtml(makeWidget({ shape: 'hexagon' }))

    expect(circle).toContain('data-fixed-ratio="1"')
    expect(circle).toContain('data-matte="1"')
    expect(circle).toContain('data-frame-style="double"')
    expect(circle).toContain('<circle cx="500" cy="500"')
    expect(circle).toContain('class="frame-nodes"')
    expect(circle).toContain('CAM 01')
    expect(hexagon).toContain('<polygon points="500,')
  })

  it('escapes label copy and rejects unsafe style values', () => {
    const html = buildCameraFrameHtml(makeWidget({
      labelEnabled: true,
      labelText: '<img src=x onerror=alert(1)>',
      primaryColor: '#fff; background:red',
      matteColor: 'javascript:alert(1)',
      fontFamily: 'Inter";}</style><script>alert(1)</script>',
      borderWidth: 999
    }))

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
    expect(html).toContain('--primary: #19C8FF;')
    expect(html).toContain('--border-width: 40px;')
    expect(html).toContain('font-family: "Outfit"')
    expect(html).not.toContain('javascript:alert(1)')
  })

  it('does not initialize live reload inside an about:srcdoc preview', () => {
    const html = buildCameraFrameHtml(makeWidget(), true)
    const script = html.match(/<script>\s*([\s\S]*?)<\/script>\s*<\/body>/)?.[1]
    let eventSourceCalls = 0

    function RuntimeEventSource(): void {
      eventSourceCalls += 1
      throw new Error('EventSource should not be constructed for about:srcdoc')
    }

    function RuntimeUrl(): void {
      throw new Error('URL should not be constructed for about:srcdoc')
    }

    const execute = new Function('window', 'EventSource', 'URL', script || '')

    expect(() => execute(
      { location: { protocol: 'about:', href: 'about:srcdoc' } },
      RuntimeEventSource,
      RuntimeUrl
    )).not.toThrow()
    expect(eventSourceCalls).toBe(0)
  })
})
