import { AppSettings } from '../../../shared/app-settings'

export function pickRelaySettings(settings: AppSettings) {
  return {
    chatAutoRelayEnabled: settings.chatAutoRelayEnabled,
    chatRelayTagMode: settings.chatRelayTagMode,
    chatAutoRelayPlatforms: { ...settings.chatAutoRelayPlatforms }
  }
}
