import { describe, expect, it } from 'vitest'
import { renderGoLiveTemplate } from './x-types'

describe('renderGoLiveTemplate', () => {
  it('substitutes {title} case-insensitively', () => {
    expect(renderGoLiveTemplate('🔴 {title} — live now! {TITLE}', { title: 'Lime hours' }))
      .toBe('🔴 Lime hours — live now! Lime hours')
  })

  it('removes the placeholder cleanly when no title is set', () => {
    expect(renderGoLiveTemplate('🔴 LIVE {title} 👉 link', {})).toBe('🔴 LIVE 👉 link')
    expect(renderGoLiveTemplate('{title} come watch', { title: '  ' })).toBe('come watch')
  })

  it('leaves templates without the placeholder untouched', () => {
    expect(renderGoLiveTemplate('LIVE NOW! Come hang out', { title: 'ignored' }))
      .toBe('LIVE NOW! Come hang out')
  })
})
