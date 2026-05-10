import { resolveAppSettings, type AppSettingKey } from '../../../shared/app-settings'
import { pickEventSoundSettings, type EventSoundSettings } from './types'

export function normalizeAlertSettings(settings: unknown): EventSoundSettings {
  return pickEventSoundSettings(
    resolveAppSettings((settings || {}) as Partial<Record<AppSettingKey, unknown>>)
  )
}

export function cloneAlertSettings(settings: EventSoundSettings): EventSoundSettings {
  return { ...settings }
}

export function settingsMatch(
  left: EventSoundSettings | null,
  right: EventSoundSettings | null
): boolean {
  if (!left || !right) return left === right
  return JSON.stringify(left) === JSON.stringify(right)
}
