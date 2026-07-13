import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMocks = vi.hoisted(() => ({
  handle: vi.fn(),
  on: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: electronMocks
}))

import { registerOverlayHandlers } from './overlay-handlers'
import { registerWidgetHandlers } from './widget-handlers'

describe('IPC handler registration', () => {
  beforeEach(() => {
    electronMocks.handle.mockClear()
    electronMocks.on.mockClear()
  })

  it('registers the overlay speech-state listener exactly once', () => {
    registerWidgetHandlers({} as never, {} as never)
    registerOverlayHandlers({} as never, {} as never)

    const speechStateRegistrations = electronMocks.on.mock.calls
      .filter(([channel]) => channel === 'overlay:notify-speech-state')

    expect(speechStateRegistrations).toHaveLength(1)
  })
})
