import { afterEach, describe, expect, it } from 'vitest'
import { OverlayServer } from './overlay-server'
import type { ChatEvent, LikeEvent } from '../platforms/types'

let overlayServer: OverlayServer | null = null

afterEach(async () => {
  if (overlayServer) {
    await overlayServer.stop()
    overlayServer = null
  }
})

describe('OverlayServer', () => {
  it('serves local overlay health and chat state endpoints', async () => {
    overlayServer = new OverlayServer()
    const status = await overlayServer.start(0)

    expect(status.running).toBe(true)
    expect(status.healthUrl).toBeTruthy()
    expect(status.chatUrl).toBeTruthy()
    expect(status.goalsUrl).toBeTruthy()

    const healthResponse = await fetch(status.healthUrl!)
    const health = await healthResponse.json()
    expect(health).toEqual(
      expect.objectContaining({
        running: true,
        port: status.port
      })
    )

    const chatEvent: ChatEvent = {
      id: 'chat-1',
      platform: 'youtube',
      timestamp: new Date('2026-04-10T10:00:00.000Z'),
      type: 'chat',
      raw: {},
      message: 'overlay hello',
      emotes: [],
      user: {
        id: 'user-1',
        username: 'viewer',
        displayName: 'Viewer',
        isModerator: false,
        isSubscriber: false,
        isVip: false,
        badges: []
      }
    }

    overlayServer.handleStreamEvent(chatEvent)

    const stateResponse = await fetch(`http://127.0.0.1:${status.port}/overlay/chat/state`)
    const state = await stateResponse.json()
    expect(state).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayName: 'Viewer',
          message: 'overlay hello',
          platformLabel: 'YouTube'
        })
      ])
    )

    const likeEvent: LikeEvent = {
      id: 'like-1',
      platform: 'tiktok',
      timestamp: new Date('2026-04-10T10:05:00.000Z'),
      type: 'like',
      raw: {},
      likeCount: 25,
      totalLikes: 400,
      user: {
        id: 'user-2',
        username: 'fan',
        displayName: 'Fan',
        isModerator: false,
        isSubscriber: false,
        isVip: false,
        badges: []
      }
    }

    overlayServer.handleStreamEvent(likeEvent)

    const goalsResponse = await fetch(`http://127.0.0.1:${status.port}/overlay/goals/state`)
    const goals = await goalsResponse.json()
    // Goal state now prefers the platform's authoritative cumulative count
    // (event.totalLikes = 400) over the per-event delta (event.likeCount = 25).
    // This stays accurate when we miss events or connect mid-stream.
    expect(goals).toEqual(
      expect.objectContaining({
        totalLikes: 400
      })
    )

    const likesResponse = await fetch(`http://127.0.0.1:${status.port}/overlay/events?channel=likes`)
    const likesStream = await readStreamUntil(likesResponse, '"snapshot"')
    expect(likesStream).toContain('"totalLikes":400')
    expect(likesStream).toContain('"displayName":"Fan"')
    expect(likesStream).toContain('"count":25')
  })
})

async function readStreamUntil(response: Response, needle: string): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ''

  const decoder = new TextDecoder()
  let text = ''

  try {
    for (let i = 0; i < 5 && !text.includes(needle); i++) {
      const result = await reader.read()
      if (result.done) break
      text += decoder.decode(result.value, { stream: true })
    }
  } finally {
    await reader.cancel().catch(() => {})
  }

  return text
}
