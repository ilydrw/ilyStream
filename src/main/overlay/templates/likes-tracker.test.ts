import { describe, expect, it } from 'vitest'
import { DEFAULT_LIKES_TRACKER_CONFIG, type Widget } from '../../../shared/widgets'
import { buildLikesTrackerHtml } from './likes-tracker'

describe('buildLikesTrackerHtml', () => {
  it('applies square avatars, hidden ranks, hidden header, and escaped titles', () => {
    const html = buildLikesTrackerHtml(makeWidget({
      title: '<Top Likers>',
      avatarShape: 'square',
      showHeader: false,
      showRankNumbers: false,
      showFirstPlaceCrown: false
    }), true)

    expect(html).toContain('&lt;Top Likers&gt;')
    expect(html).toContain('--avatar-radius: 0px;')
    expect(html).toContain('leaderboard-wrapper header-hidden no-ranks')
    expect(html).toContain('const CROWN_MARKUP = "";')
  })

  it('renders circular avatars and crown markup when enabled', () => {
    const html = buildLikesTrackerHtml(makeWidget({
      avatarShape: 'circle',
      showFirstPlaceCrown: true,
      crownColor: '#FFD60A'
    }), true)

    expect(html).toContain('--avatar-radius: 999px;')
    expect(html).toContain('first-place-crown')
    expect(html).toContain('const IS_PREVIEW = true;')
  })
})

function makeWidget(config: Partial<typeof DEFAULT_LIKES_TRACKER_CONFIG>): Widget {
  return {
    id: 'likes-widget',
    name: 'Likes Widget',
    type: 'likes-tracker',
    config: { ...DEFAULT_LIKES_TRACKER_CONFIG, ...config }
  }
}
