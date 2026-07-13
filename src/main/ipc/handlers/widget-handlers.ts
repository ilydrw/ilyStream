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
  ipcMain.handle('widgets:delete', (_event, id) => {
    db.deleteWidget(id)
    if (db.getAllWidgets().length === 0) {
      overlayServer.resetWidgetRuntimeState()
    }
  })

  // Render a widget's preview HTML for the live editor. The renderer pushes the
  // result into the iframe via postMessage so config changes apply without
  // reloading the page.
  ipcMain.handle('widgets:render-preview', (_event, widget) => {
    return overlayServer.renderWidgetPreview(widget)
  })
}
