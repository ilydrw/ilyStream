import { Script } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { DEFAULT_DISCORD_CALL_CONFIG, type Widget } from '../../../shared/widgets'
import { buildDiscordCallHtml } from './discord-call'

describe('buildDiscordCallHtml', () => {
  it('renders customizable active-speaker styling and a useful preview roster', () => {
    const html = buildDiscordCallHtml(makeWidget({
      title: '<Call & Friends>',
      layout: 'speaker',
      avatarShape: 'square',
      showSpeakingGlow: false,
      maxParticipants: 6,
      panelWidth: 360,
      panelMaxHeight: 240,
      outerPadding: 4,
      scale: 0.35
    }), true)

    expect(html).toContain('&lt;Call &amp; Friends&gt;')
    expect(html).toContain('layout-speaker')
    expect(html).toContain('--avatar-radius: 2px')
    expect(html).toContain('var IS_PREVIEW = true;')
    expect(html).toContain('Speaking now · ')
    expect(html).toContain('Using linked ilyStream profile')
    expect(html).toContain('box-shadow: none;')
    expect(html).toContain('width: min(100%, 360px);')
    expect(html).toContain('max-height: min(100%, 240px);')
    expect(html).toContain('padding: 4px;')
    expect(html).toContain('transform: scale(0.35);')
  })

  it('subscribes to the hardened Discord call overlay channel with parseable scripts', () => {
    const html = buildDiscordCallHtml(makeWidget({}), false)
    expect(html).toContain("new URL('/overlay/events?channel=discord-call', window.location.href)")
    expect(html).not.toContain('?.')

    for (const script of extractInlineScripts(html)) {
      expect(() => new Script(script)).not.toThrow()
    }
  })
})

function makeWidget(config: Partial<typeof DEFAULT_DISCORD_CALL_CONFIG>): Widget {
  return {
    id: 'discord-call-widget',
    name: 'Discord Call',
    type: 'discord-call',
    config: { ...DEFAULT_DISCORD_CALL_CONFIG, ...config }
  }
}

function extractInlineScripts(html: string): string[] {
  const scripts: string[] = []
  const pattern = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(html))) scripts.push(match[1])
  return scripts
}
