import { ipcMain } from 'electron'
import { Database } from '../../db/database'
import { OverlayServer } from '../../overlay/overlay-server'

export function registerWidgetHandlers(
  db: Database,
  overlayServer: OverlayServer
) {
  ipcMain.handle('widgets:get-all', () => db.getAllWidgets())
  ipcMain.handle('widgets:save', (_event, widget) => {
    db.saveWidget(widget)
    overlayServer.broadcastWidgetUpdate(widget.type, widget.id)
  })
  ipcMain.handle('widgets:delete', (_event, id) => db.deleteWidget(id))
  
  ipcMain.on('overlay:notify-speech-state', (_event, isSpeaking, isAI) => {
    overlayServer.broadcastSpeechState(isSpeaking, isAI)
  })
}
