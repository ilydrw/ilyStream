import { AppSettings } from '../../../shared/app-settings'

export function pickRelaySettings(settings: AppSettings) {
  return {
    chatAutoRelayEnabled: settings.chat?.autoRelayEnabled ?? (settings as any).chatAutoRelayEnabled,
    chatRelayTagMode: settings.chat?.relayTagMode ?? (settings as any).chatRelayTagMode,
    chatAutoRelayPlatforms: { ...(settings.chat?.autoRelayPlatforms || (settings as any).chatAutoRelayPlatforms || {}) }
  }
}
