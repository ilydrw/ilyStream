import { describe, expect, it, vi } from 'vitest'
import { KickConnector, extractGifteeUsernames, extractKickEmotes } from './kick-connector'

describe('extractGifteeUsernames', () => {
  it('reads the gifted_usernames array from a Pusher gift-sub payload', () => {
    expect(
      extractGifteeUsernames({ gifted_usernames: ['alice', 'bob'], gifter_username: 'whale' })
    ).toEqual(['alice', 'bob'])
  })

  it('supports the lucky-users usernames shape and object entries', () => {
    expect(extractGifteeUsernames({ usernames: ['carol'] })).toEqual(['carol'])
    expect(
      extractGifteeUsernames({ giftees: [{ username: 'dave' }, { user: { username: 'erin' } }] })
    ).toEqual(['dave', 'erin'])
  })

  it('falls back to a single username, and returns empty when none exist', () => {
    expect(extractGifteeUsernames({ username: 'frank' })).toEqual(['frank'])
    expect(extractGifteeUsernames({})).toEqual([])
    expect(extractGifteeUsernames({ gifted_usernames: [] , username: 'grace' })).toEqual(['grace'])
  })
})

describe('extractKickEmotes', () => {
  it('parses inline [emote:id:name] tokens from a real-time chat message', () => {
    const message = 'gg [emote:37226:KEKW]'
    const emotes = extractKickEmotes(message, {})

    expect(emotes).toHaveLength(1)
    expect(emotes[0]).toMatchObject({
      id: '37226',
      name: 'KEKW',
      imageUrl: 'https://files.kick.com/emotes/37226/fullsize'
    })
    expect(message.slice(emotes[0].startIndex, emotes[0].endIndex + 1)).toBe('[emote:37226:KEKW]')
  })
})

describe('KickConnector viewer-count polling', () => {
  it('keeps the socket healthy, backs off, and cancels retries when channel APIs are blocked', async () => {
    vi.useFakeTimers()
    const resolveViewerCount = vi.fn().mockResolvedValue(null)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const connector = new KickConnector({ resolveViewerCount })
    connector.status = 'connected'

    try {
      ;(connector as any).startViewerCountPolling('creator')
      await vi.advanceTimersByTimeAsync(0)

      expect(resolveViewerCount).toHaveBeenCalledTimes(1)
      expect(connector.status).toBe('connected')
      expect(warn).toHaveBeenCalledWith(
        '[kick] Viewer-count lookup failed; real-time events remain connected'
      )

      await vi.advanceTimersByTimeAsync(59_999)
      expect(resolveViewerCount).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1)
      expect(resolveViewerCount).toHaveBeenCalledTimes(2)
      expect(connector.status).toBe('connected')

      await (connector as any).cleanup()
      await vi.advanceTimersByTimeAsync(5 * 60_000)
      expect(resolveViewerCount).toHaveBeenCalledTimes(2)
    } finally {
      await (connector as any).cleanup()
      warn.mockRestore()
      vi.useRealTimers()
    }
  })
})
