import type { BrowserWindow } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { sendToRenderer } from './safe-send'

function createWindow() {
  const send = vi.fn()
  const mainFrame = {
    detached: false,
    isDestroyed: vi.fn().mockReturnValue(false),
    send
  }
  const webContents = {
    isCrashed: vi.fn().mockReturnValue(false),
    isDestroyed: vi.fn().mockReturnValue(false),
    mainFrame,
    send
  }
  const window = {
    isDestroyed: vi.fn().mockReturnValue(false),
    webContents
  } as unknown as BrowserWindow

  return { mainFrame, webContents, window }
}

describe('sendToRenderer', () => {
  it('sends through a live, ready main frame', () => {
    const { webContents, window } = createWindow()

    expect(sendToRenderer(window, 'system:ping', { sequence: 1 })).toBe(true)
    expect(webContents.mainFrame.send).toHaveBeenCalledWith('system:ping', { sequence: 1 })
  })

  it('does not enter Electron send after the window or web contents is destroyed', () => {
    const destroyedWindow = createWindow()
    destroyedWindow.window.isDestroyed = vi.fn().mockReturnValue(true)

    const destroyedContents = createWindow()
    destroyedContents.webContents.isDestroyed.mockReturnValue(true)

    expect(sendToRenderer(destroyedWindow.window, 'system:ping')).toBe(false)
    expect(sendToRenderer(destroyedContents.window, 'system:ping')).toBe(false)
    expect(destroyedWindow.mainFrame.send).not.toHaveBeenCalled()
    expect(destroyedContents.mainFrame.send).not.toHaveBeenCalled()
  })

  it('does not enter Electron send after the renderer process crashes', () => {
    const crashed = createWindow()
    crashed.webContents.isCrashed.mockReturnValue(true)

    expect(sendToRenderer(crashed.window, 'system:ping')).toBe(false)
    expect(crashed.mainFrame.send).not.toHaveBeenCalled()
  })

  it('does not enter Electron send for a destroyed or detached main frame', () => {
    const destroyed = createWindow()
    destroyed.mainFrame.isDestroyed.mockReturnValue(true)

    const detached = createWindow()
    detached.mainFrame.detached = true

    expect(sendToRenderer(destroyed.window, 'system:ping')).toBe(false)
    expect(sendToRenderer(detached.window, 'system:ping')).toBe(false)
    expect(destroyed.mainFrame.send).not.toHaveBeenCalled()
    expect(detached.mainFrame.send).not.toHaveBeenCalled()
  })

  it('silently contains a disposed-frame race that escapes the send call', () => {
    const { mainFrame, window } = createWindow()
    mainFrame.send.mockImplementation(() => {
      throw new Error('Render frame was disposed before WebFrameMain could be accessed')
    })
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    try {
      expect(sendToRenderer(window, 'system:log', { level: 'error' })).toBe(false)
      expect(stderrWrite).not.toHaveBeenCalled()
    } finally {
      stderrWrite.mockRestore()
    }
  })
})
