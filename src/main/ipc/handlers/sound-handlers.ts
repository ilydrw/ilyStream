import { ipcMain, BrowserWindow, dialog } from 'electron'
import { resolve } from 'path'
import { SoundboardService } from '../../soundboard/soundboard-service'
import { Database } from '../../db/database'
import { AppSettingKey, resolveAppSettings } from '../../../shared/app-settings'
import { OverlayServer } from '../../overlay/overlay-server'

const EVENT_SOUND_SETTING_KEYS: AppSettingKey[] = [
  'eventSoundGiftSoundId',
  'eventSoundFollowSoundId',
  'eventSoundSuperfanSoundId'
]

export function registerSoundHandlers(
  window: BrowserWindow,
  soundboardService: SoundboardService,
  db: Database,
  applyRuntimeSettings: () => Promise<void>,
  emitSettingsChanged: () => void,
  overlayServer: OverlayServer
) {
  const pickedSoundPaths = new Set<string>()

  ipcMain.handle('sound:get-all', (_event, category?: 'alerts' | 'board') => soundboardService.getAllSounds(category))
  ipcMain.handle('sound:pick-file', async () => {
    const result = await dialog.showOpenDialog(window, {
      title: 'Choose an audio file',
      properties: ['openFile'],
      filters: [{ name: 'Audio files', extensions: ['mp3', 'wav'] }]
    })

    const selectedPath = result.canceled ? null : (result.filePaths[0] ?? null)
    if (selectedPath) {
      pickedSoundPaths.add(resolve(selectedPath))
    }

    return selectedPath
  })
  ipcMain.handle('sound:upload', (_event, path: string, emoji?: string, category: 'alerts' | 'board' = 'board') => {
    const sourcePath = consumePickedPath(path, pickedSoundPaths, 'sound')
    try {
      const result = soundboardService.uploadSound(sourcePath, category)
      if (emoji) {
        db.setSoundEmoji(result.id, emoji)
      }
      overlayServer.broadcastWidgetUpdate('deck', 'manual')
      return { ...result, emoji }
    } finally {
      pickedSoundPaths.delete(sourcePath)
    }
  })
  ipcMain.handle('sound:delete', (_event, id: string) => {
    const result = soundboardService.deleteSound(id)
    overlayServer.broadcastWidgetUpdate('deck', 'manual')
    return result
  })
  ipcMain.handle('sound:rename', async (_event, id: string, newName: string) => {
    const result = await soundboardService.renameSound(id, newName)
    const settings = resolveAppSettings(db.getAllSettings())
    let changed = false

    for (const key of EVENT_SOUND_SETTING_KEYS) {
      if (settings[key] === id) {
        db.setSetting(key, result.id)
        changed = true
      }
    }

    if (changed) {
      await applyRuntimeSettings()
      emitSettingsChanged()
    }

    overlayServer.broadcastWidgetUpdate('deck', 'manual')
    return result
  })
  ipcMain.handle('sound:play', (_event, id: string, volume?: number) =>
    soundboardService.playSound(id, volume)
  )
  ipcMain.handle('sound:set-emoji', (_event, id: string, emoji: string | null) => {
    db.setSoundEmoji(id, emoji && emoji.trim() ? emoji.trim() : null)
    overlayServer.broadcastWidgetUpdate('deck', 'manual')
  })
  ipcMain.handle('sound:stop-all', () => soundboardService.stopAll())
}

function consumePickedPath(path: string, pickedPaths: Set<string>, noun: string): string {
  if (typeof path !== 'string' || !path.trim()) {
    throw new Error(`Choose a ${noun} file before uploading it.`)
  }

  const sourcePath = resolve(path)
  if (!pickedPaths.has(sourcePath)) {
    throw new Error(`Choose the ${noun} file before uploading it.`)
  }

  return sourcePath
}
