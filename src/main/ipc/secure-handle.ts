import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'

type SecureHandler = (event: IpcMainInvokeEvent, ...args: any[]) => any

export function isAuthorizedIpcSender(
  window: Pick<BrowserWindow, 'isDestroyed' | 'webContents'>,
  event: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>
): boolean {
  if (window.isDestroyed() || event.sender !== window.webContents) return false
  const mainFrame = window.webContents.mainFrame
  return !event.senderFrame || event.senderFrame === mainFrame
}

/** Register a main-window-only IPC boundary and reject subframes/other windows. */
export function secureHandle(window: BrowserWindow, channel: string, handler: SecureHandler): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isAuthorizedIpcSender(window, event)) {
      throw new Error(`Unauthorized IPC sender for ${channel}`)
    }
    return handler(event, ...args)
  })
}
