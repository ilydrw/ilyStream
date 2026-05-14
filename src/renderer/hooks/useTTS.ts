import { useEffect, useRef } from 'react'
import { useTTSStore } from '../stores/tts-store'
import {
  pauseKokoroSpeech,
  prefetchKokoroSpeech,
  preloadKokoroModel,
  resumeKokoroSpeech,
  speakWithKokoro,
  stopKokoroSpeech,
  warmKokoroProfile
} from '../lib/kokoro-speech'
import {
  pauseElevenLabsSpeech,
  resumeElevenLabsSpeech,
  speakWithElevenLabs,
  stopElevenLabsSpeech
} from '../lib/elevenlabs-speech'
import type { VoiceProfile } from '../../main/tts/voice-profiles'
import type { TTSUserVoiceOverride } from '../../shared/app-settings'
import { DEFAULT_KOKORO_VOICE, ELEVENLABS_DEFAULT_VOICE_ID } from '../../shared/tts-providers'
import { audioEngine } from '../utils/audio-engine'

/**
 * Hook that handles TTS speech synthesis in the renderer process.
 * Receives speak commands from main process via IPC and delegates to
 * the Kokoro WASM engine or the Web Speech API depending on the voice profile.
 */
export function useTTS(isMounted: boolean) {
  const setQueue = useTTSStore((s) => s.setQueue)
  const setCurrentlySpeaking = useTTSStore((s) => s.setCurrentlySpeaking)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const elevenlabsKeyRef = useRef('')
  const warnedSystemMixerFallbackRef = useRef(false)

  useEffect(() => {
    if (!window.api?.tts || !isMounted) return

    console.log('[useTTS] Hook initialized. Setting up listeners...')

    // Load API key on mount and keep it fresh via settings events
    void window.api.settings.get('elevenlabsApiKey').then((key) => {
      if (typeof key === 'string') elevenlabsKeyRef.current = key
    })

    const settingsCleanup = window.api.on('settings:changed', (settings: any) => {
      if (typeof settings?.elevenlabsApiKey === 'string') {
        elevenlabsKeyRef.current = settings.elevenlabsApiKey
      }
      void warmConfiguredKokoroProfiles(settings)
    })

    // Delay heavy TTS prep to prioritize UI paint and media stability
    const prepTimer = setTimeout(() => {
      console.log('[useTTS] Starting background preloading (Kokoro)...')
      preloadKokoroModel()
      void warmConfiguredKokoroProfiles()
    }, 3000)

    const cleanups: (() => void)[] = []

    cleanups.push(
      window.api.on('voice:changed', () => {
        void warmConfiguredKokoroProfiles()
      })
    )

    // Handle speak commands from main process
    cleanups.push(
      window.api.on('tts:speak', async (data: any) => {
        const { id, text, voice } = data
        
        const settings = await window.api.settings.getAll()
        const modifiers = settings.tts.modifiers || { radioFilter: false, speedRamping: false, pitchShifting: 'normal' }
        
        setCurrentlySpeaking(text)

        // Cancel any current speech
        window.speechSynthesis.cancel()
        stopKokoroSpeech()
        stopElevenLabsSpeech()

        const provider = voice?.provider ?? 'system'
        const shouldUseMixerFallback = provider === 'system' && audioEngine.hasMixerRoute()

        if (provider === 'kokoro' || shouldUseMixerFallback) {
          try {
            if (shouldUseMixerFallback && !warnedSystemMixerFallbackRef.current) {
              warnedSystemMixerFallbackRef.current = true
              console.info('[tts] System voices cannot be routed into the studio mixer; using Kokoro for stream-routed TTS.')
            }
            await speakWithKokoro(id, text, shouldUseMixerFallback ? toMixerRoutableVoice(voice) : voice)
            return // Successfully spoke with Kokoro
          } catch (error) {
            console.error('[tts] Kokoro speech failed, falling back to system voice:', error)
            // Continue to system fallback below
          }
        }

        if (provider === 'elevenlabs') {
          try {
            // Start visualization
            window.api.overlay?.notifySpeechState?.(true, true)
            await speakWithElevenLabs(id, text, voice, elevenlabsKeyRef.current)
          } catch (error) {
            console.error('[tts] ElevenLabs speech failed:', error)
          } finally {
            setCurrentlySpeaking(null)
            window.api.overlay?.notifySpeechState?.(false, false)
            window.api.tts.notifySpeechComplete()
          }
          return
        }

        const utterance = new SpeechSynthesisUtterance(text)
        utteranceRef.current = utterance

        // Apply voice profile settings
        if (voice) {
          utterance.pitch = voice.pitch ?? 1
          utterance.rate = voice.rate ?? 1
          utterance.volume = voice.volume ?? 1
          utterance.lang = voice.lang ?? 'en-US'

          // Voice lists can arrive asynchronously in Chromium, especially right after launch.
          if (voice.voiceName) {
            const voices = await getAvailableVoices()
            const match = voices.find((v) => v.name === voice.voiceName)
            if (match) {
              utterance.voice = match
              utterance.lang = match.lang
            }
          }
        }

        utterance.onend = () => {
          setCurrentlySpeaking(null)
          window.api.tts.notifySpeechComplete()
        }

        utterance.onerror = () => {
          setCurrentlySpeaking(null)
          window.api.tts.notifySpeechComplete()
        }

        window.speechSynthesis.speak(utterance)
      })
    )

    // Lookahead prefetch: local Kokoro only. ElevenLabs is cloud-billed per
    // generated character, so it must never prefetch invisible/skippable speech.
    cleanups.push(
      window.api.on('tts:prefetch', (data: any) => {
        const { id, text, voice } = data
        if (voice?.provider === 'kokoro') {
          prefetchKokoroSpeech(id, text, voice)
        }
      })
    )

    // Handle stop speaking
    cleanups.push(
      window.api.on('tts:stop-speaking', () => {
        window.speechSynthesis.cancel()
        stopKokoroSpeech()
        stopElevenLabsSpeech()
        setCurrentlySpeaking(null)
      })
    )

    // Handle pause
    cleanups.push(
      window.api.on('tts:pause', () => {
        window.speechSynthesis.pause()
        pauseKokoroSpeech()
        pauseElevenLabsSpeech()
      })
    )

    // Handle resume
    cleanups.push(
      window.api.on('tts:resume', () => {
        window.speechSynthesis.resume()
        resumeKokoroSpeech()
        resumeElevenLabsSpeech()
      })
    )

    // Handle queue updates
    cleanups.push(
      window.api.on('tts:queue-update', (queue: any) => {
        setQueue(queue)
      })
    )

    return () => {
      clearTimeout(prepTimer)
      settingsCleanup()
      cleanups.forEach((fn) => fn())
      window.speechSynthesis.cancel()
      stopKokoroSpeech()
      stopElevenLabsSpeech()
      utteranceRef.current = null
      setCurrentlySpeaking(null)
    }
  }, [setQueue, setCurrentlySpeaking, isMounted])
}

function toMixerRoutableVoice(profile?: VoiceProfile): VoiceProfile {
  return {
    id: profile?.id ? `${profile.id}:kokoro-route` : 'default:kokoro-route',
    name: profile?.name ? `${profile.name} (Stream Routed)` : 'Stream Routed TTS',
    provider: 'kokoro',
    voiceName: profile?.voiceName ?? '',
    kokoroVoice: profile?.kokoroVoice || DEFAULT_KOKORO_VOICE,
    elevenlabsVoiceId: profile?.elevenlabsVoiceId || ELEVENLABS_DEFAULT_VOICE_ID,
    elevenlabsStability: profile?.elevenlabsStability,
    elevenlabsSimilarity: profile?.elevenlabsSimilarity,
    elevenlabsStyle: profile?.elevenlabsStyle,
    lang: profile?.lang || 'en-US',
    pitch: profile?.pitch ?? 1,
    rate: profile?.rate ?? 1,
    volume: profile?.volume ?? 1,
    effects: profile?.effects ?? [],
    isDefault: profile?.isDefault ?? false
  }
}

async function warmConfiguredKokoroProfiles(settingsSnapshot?: any): Promise<void> {
  if (!window.api?.voice || !window.api?.settings) return

  const [profilesValue, settingsValue] = await Promise.all([
    window.api.voice.getAll(),
    settingsSnapshot ? Promise.resolve(settingsSnapshot) : window.api.settings.getAll()
  ])
  const profiles = Array.isArray(profilesValue) ? (profilesValue as VoiceProfile[]) : []
  const settings = settingsValue as Record<string, any>
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]))
  const warmProfiles = new Map<string, VoiceProfile>()

  const addProfile = (profile?: VoiceProfile | null) => {
    if (!profile || (profile.provider ?? 'system') !== 'kokoro') return
    warmProfiles.set(profile.id, profile)
  }

  const defaultProfile = profiles.find((profile) => profile.isDefault) ?? profiles[0]
  addProfile(defaultProfile)

  for (const key of [
    'ttsChatVoiceProfileId',
    'ttsSubscriptionVoiceProfileId'
  ]) {
    const profileId = typeof settings?.[key] === 'string' ? settings[key] : ''
    addProfile(profileId ? profileById.get(profileId) : defaultProfile)
  }

  const overrides = Array.isArray(settings?.ttsUserVoiceOverrides)
    ? (settings.tts.userVoiceOverrides as TTSUserVoiceOverride[])
    : []
  for (const override of overrides.slice(0, 8)) {
    if (!override.enabled) continue

    if (override.mode === 'profile') {
      addProfile(profileById.get(override.voiceProfileId))
    } else if (override.provider === 'kokoro') {
      warmProfiles.set(`user:${override.id}`, profileFromOverride(override))
    }
  }

  for (const profile of warmProfiles.values()) {
    warmKokoroProfile(profile)
  }

  // Also warm up the AI signature voice
  warmKokoroProfile({
    id: 'ai-cohost-voice',
    name: 'AI Co-Host',
    provider: 'kokoro',
    voiceName: '',
    kokoroVoice: 'af_sky',
    lang: 'en-US',
    pitch: 1.1,
    rate: 1.05,
    volume: 1.0,
    effects: [
      { type: 'robot', enabled: true, params: {} },
      { type: 'reverb', enabled: true, params: { roomSize: 0.5 } }
    ],
    isDefault: false
  })
}

function profileFromOverride(override: TTSUserVoiceOverride): VoiceProfile {
  return {
    id: `user:${override.id}`,
    name: override.username,
    provider: 'kokoro',
    voiceName: override.voiceName,
    kokoroVoice: override.kokoroVoice || DEFAULT_KOKORO_VOICE,
    elevenlabsVoiceId: override.elevenlabsVoiceId || ELEVENLABS_DEFAULT_VOICE_ID,
    elevenlabsStability: override.elevenlabsStability,
    elevenlabsSimilarity: override.elevenlabsSimilarity,
    elevenlabsStyle: override.elevenlabsStyle,
    lang: override.lang || 'en-US',
    pitch: override.pitch,
    rate: override.rate,
    volume: override.volume,
    effects: [],
    isDefault: false
  }
}

function getAvailableVoices(): Promise<SpeechSynthesisVoice[]> {
  const voices = window.speechSynthesis.getVoices()
  if (voices.length > 0) return Promise.resolve(voices)

  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged)
      resolve(window.speechSynthesis.getVoices())
    }, 1200)

    const handleVoicesChanged = () => {
      window.clearTimeout(timeout)
      window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged)
      resolve(window.speechSynthesis.getVoices())
    }

    window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged)
  })
}


