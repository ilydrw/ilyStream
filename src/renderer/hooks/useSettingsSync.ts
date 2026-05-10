import { useEffect } from 'react'
import { resolveAppSettings } from '../../shared/app-settings'
import { applyAppAppearance } from '../lib/app-appearance'
import { useChatStore } from '../stores/chat-store'
import { useTTSStore } from '../stores/tts-store'
import { audioEngine } from '../utils/audio-engine'

function applyRendererSettings(settings: ReturnType<typeof resolveAppSettings>): void {
  const chatStore = useChatStore.getState()
  const ttsStore = useTTSStore.getState()

  chatStore.setMaxMessages(settings.chatMaxMessages)
  ttsStore.setEnabled(settings.ttsEnabled)
  applyAppAppearance(settings)
  
  // Sync hardware audio routing
  void audioEngine.setSinkId(settings.audioOutputDeviceId)
}

export function useSettingsSync() {
  useEffect(() => {
    if (!window.api?.settings) return

    let active = true

    void window.api.settings.getAll().then((settings) => {
      if (!active) return
      applyRendererSettings(resolveAppSettings(settings))
    })

    const unsubscribe = window.api.on('settings:changed', (settings: unknown) => {
      applyRendererSettings(resolveAppSettings(settings as Record<string, unknown>))
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])
}
