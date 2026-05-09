export type WindowsSettingsTarget = 'language' | 'speech'

const WINDOWS_SETTINGS_URIS: Record<WindowsSettingsTarget, string> = {
  language: 'ms-settings:regionlanguage',
  speech: 'ms-settings:speech'
}

export function getWindowsSettingsUri(target: WindowsSettingsTarget): string {
  return WINDOWS_SETTINGS_URIS[target]
}
