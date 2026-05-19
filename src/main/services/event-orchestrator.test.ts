import { EventEmitter } from 'events'
import { describe, expect, it, vi } from 'vitest'
import { EventOrchestrator } from './event-orchestrator'
import type { ChatEvent } from '../platforms/types'

function makeChat(message: string): ChatEvent {
  return {
    id: `chat-${message}`,
    platform: 'twitch',
    timestamp: new Date(),
    type: 'chat',
    user: {
      id: 'viewer-id',
      username: 'viewer',
      displayName: 'Viewer',
      isModerator: false,
      isSubscriber: false,
      isVip: false,
      badges: []
    },
    message,
    emotes: [],
    raw: {}
  }
}

function makeOrchestrator(spotifyHandled: boolean) {
  const platformManager = new EventEmitter()
  const overlayServer = Object.assign(new EventEmitter(), {
    handleStreamEvent: vi.fn(),
    setNowPlaying: vi.fn()
  })
  const spotifyService = Object.assign(new EventEmitter(), {
    processEvent: vi.fn().mockResolvedValue(spotifyHandled),
    getNowPlaying: vi.fn(() => ({ queue: [] }))
  })
  const ttsEngine = { processEvent: vi.fn() }

  const orchestrator = new EventOrchestrator(
    platformManager as any,
    { addEvent: vi.fn(), pruneEventHistory: vi.fn(), getAllSettings: vi.fn(() => ({})) } as any,
    overlayServer as any,
    { processEvent: vi.fn() } as any,
    spotifyService as any,
    ttsEngine as any,
    {} as any,
    Object.assign(new EventEmitter(), { evaluate: vi.fn() }) as any,
    { handleTrigger: vi.fn() } as any,
    {} as any,
    {} as any,
    Object.assign(new EventEmitter()) as any,
    { recordEvent: vi.fn() } as any,
    {} as any,
    { getState: vi.fn(() => ({ devices: [] })) } as any,
    {} as any
  )

  orchestrator.init()
  return { platformManager, spotifyService, ttsEngine }
}

async function flushAsyncHandlers() {
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('EventOrchestrator Spotify handling', () => {
  it('awaits Spotify command handling before deciding whether chat should go to TTS', async () => {
    const { platformManager, spotifyService, ttsEngine } = makeOrchestrator(false)

    platformManager.emit('event', makeChat('hello chat'))
    await flushAsyncHandlers()

    expect(spotifyService.processEvent).toHaveBeenCalledWith(expect.objectContaining({ message: 'hello chat' }))
    expect(ttsEngine.processEvent).toHaveBeenCalledWith(expect.objectContaining({ message: 'hello chat' }))
  })

  it('does not send Spotify commands to TTS after Spotify handles them', async () => {
    const { platformManager, ttsEngine } = makeOrchestrator(true)

    platformManager.emit('event', makeChat('!play current song'))
    await flushAsyncHandlers()

    expect(ttsEngine.processEvent).not.toHaveBeenCalled()
  })
})
