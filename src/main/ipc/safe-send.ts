import type { BrowserWindow } from 'electron'

export function sendToRenderer(window: BrowserWindow | null | undefined, channel: string, ...args: unknown[]): boolean {
  if (!window || window.isDestroyed()) return false

  const webContents = window.webContents
  if (!webContents || webContents.isDestroyed()) return false

  try {
    webContents.send(channel, ...args)
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/Render frame was disposed|WebFrameMain|Object has been destroyed|destroyed/i.test(message)) {
      process.stderr.write(`[ipc] Failed to send ${channel}: ${message}\n`)
    }
    return false
  }
}
