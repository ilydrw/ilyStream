import { describe, expect, it } from 'vitest'
import { buildScreenBorderHtml } from './screen-border'

describe('buildScreenBorderHtml smooth rendering', () => {
  it('animates the supported border on the compositor and disables duplicate fallback work', () => {
    const html = buildScreenBorderHtml(undefined, false)

    expect(html).toContain('.border-inner::before')
    expect(html).toContain('will-change: transform;')
    expect(html).toContain('rotate(360deg)')
    expect(html).toContain('.border-fallback {\n        display: none;')
    expect(html).not.toContain('will-change: --angle;')
  })
})
