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

  ipcMain.handle('widgets:create-preview-session', (_event, widgetId) => {
    return overlayServer.createWidgetPreviewSession(String(widgetId || ''))
  })
  ipcMain.handle('widgets:release-preview-session', (_event, previewToken) => {
    if (typeof previewToken === 'string') {
      overlayServer.releaseWidgetPreviewSession(previewToken)
    }
  })

  // Render a widget's preview HTML for the live editor. Both the IPC request
  // and iframe protocol require the same main-process-issued capability.
  ipcMain.handle('widgets:render-preview', (_event, widget, previewToken) => {
    if (typeof previewToken !== 'string') return null
    return overlayServer.renderWidgetPreview(widget, previewToken)
  })
}
