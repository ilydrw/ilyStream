import { describe, expect, it } from 'vitest'
import { DEFAULT_TEXT_WIDGET_CONFIG, type Widget } from '../../../shared/widgets'
import { buildTextWidgetHtml } from './text-widget'

function makeWidget(config: Partial<typeof DEFAULT_TEXT_WIDGET_CONFIG>): Widget {
  return {
    id: 'text-test',
    name: 'Text',
    type: 'text',
    config: { ...DEFAULT_TEXT_WIDGET_CONFIG, ...config }
  }
}

describe('buildTextWidgetHtml', () => {
  it('renders multiline text as content without allowing markup injection', () => {
    const html = buildTextWidgetHtml(makeWidget({ text: 'First line\n<script>bad()</script>' }))

    expect(html).toContain('First line\n&lt;script&gt;bad()&lt;/script&gt;')
    expect(html).not.toContain('<script>bad()</script>')
    expect(html).toContain('white-space: pre-wrap')
  })

  it('applies typography, outline, shadow, background, and canvas controls', () => {
    const html = buildTextWidgetHtml(makeWidget({
      fontSize: 96,
      fontWeight: 900,
      fontStyle: 'italic',
      textAlign: 'right',
      verticalAlign: 'bottom',
      outlineWidth: 4,
      shadowOpacity: 0.8,
      backgroundEnabled: true,
      backgroundOpacity: 0.6,
      canvasWidth: 1_000,
      canvasHeight: 300
    }))

    expect(html).toContain('data-canvas-width="1000" data-canvas-height="300"')
    expect(html).toContain('justify-content: flex-end')
    expect(html).toContain('align-items: flex-end')
    expect(html).toContain('font-size: 96px')
    expect(html).toContain('font-weight: 900')
    expect(html).toContain('font-style: italic')
    expect(html).toContain('-webkit-text-stroke: 4px #000000')
    expect(html).toContain('rgba(0, 0, 0, 0.6)')
  })

  it('keeps the card transparent when its background is disabled', () => {
    const html = buildTextWidgetHtml(makeWidget({ backgroundEnabled: false, backgroundOpacity: 1 }))
    expect(html).toContain('background: rgba(0, 0, 0, 0);')
  })

  it('supports targeted config updates without rebuilding the document', () => {
    const html = buildTextWidgetHtml(makeWidget({ text: 'Initial' }))

    expect(html).toContain('window.__ilystreamApplyConfig = function(next)')
    expect(html).toContain("box.textContent = String(next.text == null ? '' : next.text)")
    expect(html).toContain("if (previous[key] !== next[key]) return false")
    expect(html).toContain('return true;')
  })
})
