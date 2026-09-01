import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

import { isAuthorizedIpcSender } from './secure-handle'

describe('isAuthorizedIpcSender', () => {
  it('accepts only the owning window main frame', () => {
    const mainFrame = { id: 1 }
    const webContents = { mainFrame }
    const window = { isDestroyed: vi.fn(() => false), webContents } as any

    expect(isAuthorizedIpcSender(window, { sender: webContents, senderFrame: mainFrame } as any)).toBe(true)
    expect(isAuthorizedIpcSender(window, { sender: webContents, senderFrame: { id: 2 } } as any)).toBe(false)
    expect(isAuthorizedIpcSender(window, { sender: { mainFrame }, senderFrame: mainFrame } as any)).toBe(false)
  })

  it('rejects senders after the owning window is destroyed', () => {
    const webContents = { mainFrame: {} }
    const window = { isDestroyed: vi.fn(() => true), webContents } as any
    expect(isAuthorizedIpcSender(window, { sender: webContents, senderFrame: webContents.mainFrame } as any)).toBe(false)
  })
})
