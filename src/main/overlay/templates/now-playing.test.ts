import { describe, expect, it } from 'vitest'
import { buildNowPlayingOverlayHtml } from './now-playing'

describe('now-playing album art', () => {
  it('uses the shared latest-load-wins image runtime with a track revision', () => {
    const html = buildNowPlayingOverlayHtml()

    expect(html).toContain('window.__ilyAvatar.applyBackground(artEl, value, revision);')
    expect(html).toContain("state.trackId || state.trackName || state.albumName || 'current-track'")
    expect(html).toContain("if (nextKey === activeAlbumArtKey) return;")
    expect(html).not.toContain("artEl.style.backgroundImage = 'url(\"")
  })
})
