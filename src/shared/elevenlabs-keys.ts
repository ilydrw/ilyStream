import type { AppSettings, ElevenLabsApiKeyEntry } from './app-settings'

export const DEFAULT_ELEVENLABS_API_KEY_ID = 'default'

export interface ResolvedElevenLabsApiKey {
  id: string
  label: string
  apiKey: string
  isDefault: boolean
}

export function resolveElevenLabsApiKeys(settings: Partial<AppSettings> | null | undefined): ResolvedElevenLabsApiKey[] {
  const keys: ResolvedElevenLabsApiKey[] = []
  const defaultId = settings?.elevenlabsDefaultApiKeyId || ''
  const legacyKey = typeof settings?.elevenlabsApiKey === 'string' ? settings.elevenlabsApiKey.trim() : ''

  if (legacyKey) {
    keys.push({
      id: DEFAULT_ELEVENLABS_API_KEY_ID,
      label: 'Default ElevenLabs',
      apiKey: legacyKey,
      isDefault: !defaultId || defaultId === DEFAULT_ELEVENLABS_API_KEY_ID
    })
  }

  const workspaceKeys = Array.isArray(settings?.elevenlabsApiKeys)
    ? settings.elevenlabsApiKeys as ElevenLabsApiKeyEntry[]
    : []

  for (const entry of workspaceKeys) {
    const apiKey = typeof entry?.apiKey === 'string' ? entry.apiKey.trim() : ''
    const id = typeof entry?.id === 'string' ? entry.id.trim() : ''
    if (!apiKey || !id) continue
    keys.push({
      id,
      label: entry.label?.trim() || 'ElevenLabs Workspace',
      apiKey,
      isDefault: defaultId === id
    })
  }

  if (!keys.some((key) => key.isDefault) && keys[0]) {
    keys[0] = { ...keys[0], isDefault: true }
  }

  return keys
}

export function getElevenLabsApiKey(
  settings: Partial<AppSettings> | null | undefined,
  keyId?: string | null
): string {
  const keys = resolveElevenLabsApiKeys(settings)
  if (keyId) {
    const explicit = keys.find((key) => key.id === keyId)
    if (explicit) return explicit.apiKey
  }
  return keys.find((key) => key.isDefault)?.apiKey || keys[0]?.apiKey || ''
}

