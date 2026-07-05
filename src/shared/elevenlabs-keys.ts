export function getElevenLabsApiKey(settings: any, keyId?: string): string {
  if (!settings) return ''
  if (keyId && settings.elevenlabsKeys && settings.elevenlabsKeys[keyId]) {
    return settings.elevenlabsKeys[keyId]
  }
  return settings.elevenlabsApiKey || ''
}
