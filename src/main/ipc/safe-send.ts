import type { BrowserWindow } from 'electron'
import type { RendererEventChannel } from '../../shared/ipc-events'

export function sendToRenderer(window: BrowserWindow | null | undefined, channel: RendererEventChannel, ...args: unknown[]): boolean {
  try {
    if (!window || window.isDestroyed()) return false

    const webContents = window.webContents
    if (
      !webContents ||
      webContents.isDestroyed() ||
      webContents.isCrashed()
    ) return false

    // Electron logs and swallows disposed-frame failures inside mainFrame.send,
    // so our catch cannot silence them. Snapshot and validate the current frame
    // before entering that send path.
    const mainFrame = webContents.mainFrame
    if (!mainFrame || mainFrame.isDestroyed() || mainFrame.detached) return false

    mainFrame.send(channel, ...args)
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/Render frame was disposed|WebFrameMain|Object has been destroyed|destroyed/i.test(message)) {
      process.stderr.write(`[ipc] Failed to send ${channel}: ${message}\n`)
    }
    return false
  }
}
