import { ipcMain, BrowserWindow } from 'electron'
import { TTSEngine } from '../../tts/tts-engine'
import { Database } from '../../db/database'
import { AppSettingKey, resolveAppSettings, resolveAppSetting } from '../../../shared/app-settings'

export function registerTTSHandlers(
  window: BrowserWindow,
  ttsEngine: TTSEngine,
  db: Database,
  updateSetting: <K extends AppSettingKey>(key: K, value: unknown) => Promise<unknown>
) {
  const emitVoiceProfilesChanged = () => {
    if (!window.isDestroyed()) {
      window.webContents.send('voice:changed', ttsEngine.getVoiceProfiles().getAll())
    }
  }

  const clearDeletedVoiceProfileAssignments = (deletedProfileId: string) => {
    const settings = resolveAppSettings(db.getAllSettings())
    let changed = false

    for (const key of [
      'ttsChatVoiceProfileId',
      'ttsGiftVoiceProfileId',
      'ttsSubscriptionVoiceProfileId'
    ] as const) {
      if (settings[key] === deletedProfileId) {
        db.setSetting(key, '')
        changed = true
      }
    }

    const nextOverrides = settings.ttsUserVoiceOverrides.filter(
      (override) => override.voiceProfileId !== deletedProfileId
    )
    if (nextOverrides.length !== settings.ttsUserVoiceOverrides.length) {
      db.setSetting('ttsUserVoiceOverrides', nextOverrides)
      changed = true
    }

    if (changed) {
      // Note: We'll emit settings changed via the main registerIpcHandlers emitSettingsChanged
      // Since this is a bit circular, we'll just handle it in the main file for now or pass a callback
    }
  }

  ipcMain.handle('tts:skip', () => ttsEngine.skip())
  ipcMain.handle('tts:clear-queue', () => ttsEngine.clearQueue())
  ipcMain.handle('tts:pause', () => ttsEngine.pause())
  ipcMain.handle('tts:resume', () => ttsEngine.resume())
  ipcMain.handle('tts:set-enabled', (_event, enabled) => updateSetting('ttsEnabled', enabled))
  ipcMain.handle('tts:get-queue', () => ttsEngine.getQueue())
  ipcMain.handle(
    'tts:test-speak',
    (_event, payload: { text: string; voiceProfileId?: string }) =>
      ttsEngine.enqueueTestSpeech(payload)
  )
  ipcMain.handle(
    'tts:speak',
    (_event, payload: { text: string; voiceProfileId?: string; priority?: string }) => {
      return ttsEngine.enqueue({
        text: payload.text,
        username: 'System',
        platform: 'local',
        priority: (payload.priority as any) || 'normal',
        voiceProfileId: payload.voiceProfileId,
        eventType: 'manual'
      })
    }
  )

  ipcMain.handle('voice:get-all', () => ttsEngine.getVoiceProfiles().getAll())
  ipcMain.handle('voice:save', (_event, profile) => {
    ttsEngine.getVoiceProfiles().save(profile)
    db.saveVoiceProfile(profile)
    emitVoiceProfilesChanged()
  })
  ipcMain.handle('voice:delete', (_event, id) => {
    const deleted = ttsEngine.getVoiceProfiles().delete(id)
    if (deleted) {
      db.deleteVoiceProfile(id)
      clearDeletedVoiceProfileAssignments(id)
      emitVoiceProfilesChanged()
    }
    return deleted
  })

  ipcMain.on('tts:speech-complete', () => {
    ttsEngine.onSpeechComplete()
  })
}
