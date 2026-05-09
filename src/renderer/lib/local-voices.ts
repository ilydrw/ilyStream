import type { VoiceProfile } from '../../main/tts/voice-profiles'
import { DEFAULT_KOKORO_VOICE } from '../../shared/tts-providers'

export interface SystemVoiceDescriptor {
  name: string
  lang: string
  default?: boolean
}

export interface GroupedSystemVoices {
  lang: string
  voices: SystemVoiceDescriptor[]
}

export function groupSystemVoices(
  voices: SystemVoiceDescriptor[],
  query = ''
): GroupedSystemVoices[] {
  const normalizedQuery = query.trim().toLowerCase()
  const filteredVoices = normalizedQuery.length
    ? voices.filter((voice) =>
        [voice.name, voice.lang].some((value) => value.toLowerCase().includes(normalizedQuery))
      )
    : voices

  const groups = new Map<string, SystemVoiceDescriptor[]>()

  for (const voice of filteredVoices) {
    const key = voice.lang || 'unknown'
    const bucket = groups.get(key)

    if (bucket) {
      bucket.push(voice)
    } else {
      groups.set(key, [voice])
    }
  }

  return Array.from(groups.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([lang, groupedVoices]) => ({
      lang,
      voices: [...groupedVoices].sort((left, right) => left.name.localeCompare(right.name))
    }))
}

export function getMissingVoiceProfiles(
  profiles: VoiceProfile[],
  availableVoices: SystemVoiceDescriptor[]
): VoiceProfile[] {
  const availableVoiceNames = new Set(
    availableVoices.map((voice) => voice.name).filter((voiceName) => voiceName.trim().length > 0)
  )

  return profiles.filter(
    (profile) =>
      (profile.provider ?? 'system') === 'system' &&
      profile.voiceName.length > 0 &&
      !availableVoiceNames.has(profile.voiceName)
  )
}

export function createProfileFromSystemVoice(
  voice: SystemVoiceDescriptor,
  existingProfiles: VoiceProfile[],
  generateId: () => string = () => crypto.randomUUID()
): VoiceProfile {
  const normalizedBaseName = voice.name.trim() || `Voice ${existingProfiles.length + 1}`
  const usedNames = new Set(existingProfiles.map((profile) => profile.name.trim().toLowerCase()))
  let nextName = normalizedBaseName
  let suffix = 2

  while (usedNames.has(nextName.toLowerCase())) {
    nextName = `${normalizedBaseName} ${suffix}`
    suffix += 1
  }

  return {
    id: generateId(),
    name: nextName,
    provider: 'system',
    voiceName: voice.name,
    kokoroVoice: DEFAULT_KOKORO_VOICE,
    lang: voice.lang || 'en-US',
    pitch: 1,
    rate: 1,
    volume: 1,
    effects: [],
    isDefault: false
  }
}
