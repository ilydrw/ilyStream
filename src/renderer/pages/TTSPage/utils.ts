import { VoiceProfile } from '../../../main/tts/voice-profiles'
import { TTSVoiceProvider, DEFAULT_KOKORO_VOICE, ELEVENLABS_DEFAULT_VOICE_ID } from '../../../shared/tts-providers'
import { getElevenLabsBillableCharacters } from '../../lib/elevenlabs-speech'
import { speakWithKokoro, stopKokoroSpeech } from '../../lib/kokoro-speech'
import { speakWithElevenLabs, stopElevenLabsSpeech } from '../../lib/elevenlabs-speech'
import { previewFallbackText } from './constants'

export function cloneProfile(profile: VoiceProfile): VoiceProfile {
  return JSON.parse(JSON.stringify(profile)) as VoiceProfile
}

export function normalizeProfile(profile: VoiceProfile): VoiceProfile {
  return {
    ...profile,
    name: profile.name.trim()
  }
}

export function upsertProfile(profiles: VoiceProfile[], profile: VoiceProfile): VoiceProfile[] {
  const exists = profiles.some((p) => p.id === profile.id)
  if (exists) {
    return profiles.map((p) => (p.id === profile.id ? profile : p))
  }
  return [...profiles, profile]
}

export function sortProfiles(profiles: VoiceProfile[]): VoiceProfile[] {
  return [...profiles].sort((left, right) => {
    if (left.isDefault) return -1
    if (right.isDefault) return 1
    return left.name.localeCompare(right.name)
  })
}

export function normalizeProviderSelection(
  current: VoiceProfile,
  provider: TTSVoiceProvider
): VoiceProfile {
  if (current.provider === provider) return current

  return {
    ...current,
    provider,
    voiceName: provider === 'system' ? '' : current.voiceName,
    kokoroVoice: provider === 'kokoro' ? current.kokoroVoice || DEFAULT_KOKORO_VOICE : current.kokoroVoice,
    elevenlabsVoiceId:
      provider === 'elevenlabs'
        ? current.elevenlabsVoiceId || ELEVENLABS_DEFAULT_VOICE_ID
        : current.elevenlabsVoiceId
  }
}

export function getSystemVoiceOptions(
  voices: SpeechSynthesisVoice[],
  currentName: string,
  currentLang: string
): SpeechSynthesisVoice[] {
  const filtered = voices.filter((v) => v.lang.startsWith('en'))
  if (filtered.length > 0) return filtered

  return voices
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase().replace(/^@/, '')
}

export function getPreviewSpeechText(text: string): string {
  return (text.trim() || previewFallbackText).slice(0, 1000)
}

export function confirmElevenLabsSpend(profile: VoiceProfile, text: string, apiKey: string): boolean {
  if (profile.provider !== 'elevenlabs') return true
  if (!apiKey) {
    alert('Configure your ElevenLabs API key in Settings first.')
    return false
  }
  return confirm(
    `This will use ${getElevenLabsBillableCharacters(text)} billable characters from your ElevenLabs quota. Continue?`
  )
}

export async function speakProfile(
  id: string,
  profile: VoiceProfile,
  text: string,
  setIsSpeaking: (v: boolean) => void,
  utteranceRef: React.MutableRefObject<SpeechSynthesisUtterance | null>,
  elevenlabsApiKey: string
): Promise<void> {
  const provider = profile.provider ?? 'system'

  setIsSpeaking(true)

  try {
    if (provider === 'kokoro') {
      await speakWithKokoro(id, text, profile)
    } else if (provider === 'elevenlabs') {
      await speakWithElevenLabs(id, text, profile, elevenlabsApiKey)
    } else {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      const voices = window.speechSynthesis.getVoices()
      const voice = voices.find((v) => v.name === profile.voiceName)
      if (voice) utterance.voice = voice

      utterance.pitch = profile.pitch ?? 1
      utterance.rate = profile.rate ?? 1
      utterance.volume = profile.volume ?? 1

      utterance.onend = () => {
        setIsSpeaking(false)
        utteranceRef.current = null
      }
      utterance.onerror = () => {
        setIsSpeaking(false)
        utteranceRef.current = null
      }

      utteranceRef.current = utterance
      window.speechSynthesis.speak(utterance)
    }
  } catch (error) {
    console.error('Synthesis failed', error)
    setIsSpeaking(false)
  }
}

export function stopAllSpeech(setIsPreviewing: (v: boolean) => void) {
  window.speechSynthesis.cancel()
  stopKokoroSpeech()
  stopElevenLabsSpeech()
  setIsPreviewing(false)
}
