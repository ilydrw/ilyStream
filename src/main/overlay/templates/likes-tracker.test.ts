import { Script } from 'node:vm'
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

  it('includes TLS sizing guards and polling fallback state hydration', () => {
    const html = buildLikesTrackerHtml(makeWidget({
      maxAvatars: 3,
      rowHeight: 60
    }), false)

    expect(html).toContain('--visible-rows: 3;')
    expect(html).toContain('-webkit-backdrop-filter: blur(var(--glass-blur));')
    expect(html).toContain("new URL('/overlay/likes/state?t=' + Date.now(), window.location.href)")
    expect(html).toContain("new URL('/overlay/events?channel=likes', window.location.href)")
    expect(html).toContain('rendering compact instead of blocking the widget')
    expect(html).toContain('function requestJson(url)')
    expect(html).toContain('new XMLHttpRequest()')
    expect(html).toContain('function updateVisibleLimitFromViewport()')
    expect(html).not.toContain('window.resizeTo(SOURCE_MIN_WIDTH, SOURCE_MIN_HEIGHT)')
    expect(html).not.toContain('Browser source too small')
    expect(html).toContain('inset: 0;')
    expect(html).toContain('Waiting for likes')
    expect(html).toContain('function maybeShowLifetimeFallback()')
    expect(html).toContain('const LIFETIME_FALLBACK_ENABLED = true;')
    expect(html).toContain('lifetimeFallbackActive')
    expect(html).not.toContain('?.')
  })

  it('emits parseable runtime JavaScript for real overlay mode', () => {
    const html = buildLikesTrackerHtml(makeWidget({}), false)
    const scripts = extractInlineScripts(html)

    expect(scripts.length).toBeGreaterThan(0)
    for (const script of scripts) {
      expect(() => new Script(script)).not.toThrow()
    }
  })

  it('keeps the idle all-time fallback available when the periodic glimpse is disabled', () => {
    const html = buildLikesTrackerHtml(makeWidget({
      lifetimeGlimpseEnabled: false
    }), false)

    expect(html).toContain('const LIFETIME_FALLBACK_ENABLED = true;')
    expect(html).toContain('const LIFETIME_CYCLE_ENABLED = false;')
    expect(html).toContain('if (!LIFETIME_FALLBACK_ENABLED || lifetimeFallbackActive')
    expect(html).toContain('if (!LIFETIME_CYCLE_ENABLED) return;')
  })
})

function extractInlineScripts(html: string): string[] {
  const scripts: string[] = []
  const pattern = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null

  while ((match = pattern.exec(html))) {
    scripts.push(match[1])
  }

  return scripts
}

function makeWidget(config: Partial<typeof DEFAULT_LIKES_TRACKER_CONFIG>): Widget {
  return {
    id: 'likes-widget',
    name: 'Likes Widget',
    type: 'likes-tracker',
    config: { ...DEFAULT_LIKES_TRACKER_CONFIG, ...config }
  }
}
