import { useEffect, useRef } from 'react'
import { useTTSStore } from '../stores/tts-store'
import {
  pauseKokoroSpeech,
  prefetchKokoroSpeech,
  preloadKokoroModel,
  pruneKokoroPrefetches,
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
import { resolveAppSettings, type TTSUserVoiceOverride } from '../../shared/app-settings'
import { getElevenLabsApiKey } from '../../shared/elevenlabs-keys'
import { DEFAULT_KOKORO_VOICE, ELEVENLABS_DEFAULT_VOICE_ID } from '../../shared/tts-providers'
import { audioEngine } from '../utils/audio-engine'
import { isStaleLiveTts } from '../../shared/tts-freshness'

/**
 * Hook that handles TTS speech synthesis in the renderer process.
 * Receives speak commands from main process via IPC and delegates to
 * the isolated Kokoro engine or the Web Speech API depending on the voice profile.
 */
export function useTTS(isMounted: boolean) {
  const setQueue = useTTSStore((s) => s.setQueue)
  const setCurrentlySpeaking = useTTSStore((s) => s.setCurrentlySpeaking)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const elevenlabsKeyRef = useRef('')
  const elevenlabsSettingsRef = useRef<any>(null)
  const warnedSystemMixerFallbackRef = useRef(false)
  const activeSpeechIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!window.api?.tts || !isMounted) return

    console.log('[useTTS] Hook initialized. Setting up listeners...')

    // Tell main this renderer is fresh so it clears any speech that was left
    // "playing" by a previous page (HMR reload, crash) and resumes the queue.
    window.api.tts.notifyReady?.()

    // Load API key on mount and keep it fresh via settings events
    void window.api.settings.getAll().then((settings) => {
      const resolved = resolveAppSettings(settings || {})
      elevenlabsKeyRef.current = getElevenLabsApiKey(resolved) || resolved.elevenlabsApiKey || ''
      elevenlabsSettingsRef.current = resolved
    })

    const settingsCleanup = window.api.on('settings:changed', (settings: any) => {
      const resolved = resolveAppSettings(settings || {})
      elevenlabsSettingsRef.current = resolved
      elevenlabsKeyRef.current = getElevenLabsApiKey(resolved) || resolved.elevenlabsApiKey || ''
      void warmConfiguredKokoroProfiles(settings)
    })

    // Delay heavy TTS prep to prioritize UI paint and media stability.
    // The Kokoro model runs in a disposable utility process, but only preload
    // it when something can actually speak (TTS or the AI co-host).
    // If both are off, the model still loads lazily on the first real
    // speech request — the only cost is cold-start latency on that line.
    const prepTimer = setTimeout(() => {
      void (async () => {
        const settingsRaw = await window.api.settings.getAll().catch(() => null)
        const resolved = resolveAppSettings(settingsRaw || {})
        if (!resolved.tts.enabled && !resolved.ai.enabled) {
          console.log('[useTTS] Skipping Kokoro preload — TTS and AI co-host are disabled.')
          return
        }
        console.log('[useTTS] Starting background preloading (Kokoro)...')
        preloadKokoroModel()
        void warmConfiguredKokoroProfiles(settingsRaw || undefined)
      })()
    }, 3000)

    const cleanups: (() => void)[] = []

    const completeSpeech = (id: string) => {
      if (activeSpeechIdRef.current !== id) return
      activeSpeechIdRef.current = null
      setCurrentlySpeaking(null)
      window.api.tts.notifySpeechComplete(id)
    }

    cleanups.push(
      window.api.on('voice:changed', () => {
        void warmConfiguredKokoroProfiles()
      })
    )

    // Handle speak commands from main process
    cleanups.push(
      window.api.on('tts:speak', async (data: any) => {
        const { id, text, voice, eventType, enqueuedAt } = data

        // IPC can be delivered after a blocked/reloaded renderer wakes up. Do
        // not turn that delayed command into audible chat from minutes ago.
        if (isStaleLiveTts({ eventType, enqueuedAt })) {
          console.warn(`[tts] Dropping stale ${eventType || 'live'} speech ${id}.`)
          window.api.tts.notifySpeechComplete(id)
          return
        }

        activeSpeechIdRef.current = id
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
            completeSpeech(id)
            return
          } catch (error) {
            console.error('[tts] Kokoro speech failed, falling back to system voice:', error)
            if (activeSpeechIdRef.current !== id) return
            // Continue to system fallback below
          }
        }

        if (provider === 'elevenlabs') {
          try {
            // Start visualization
            window.api.overlay?.notifySpeechState?.(true, true)
            const apiKey = getElevenLabsApiKey(elevenlabsSettingsRef.current, voice?.elevenlabsApiKeyId) || elevenlabsKeyRef.current
            await speakWithElevenLabs(id, text, voice, apiKey)
            completeSpeech(id)
            return
          } catch (error) {
            console.error('[tts] ElevenLabs speech failed, falling back to local Kokoro:', error)
            if (activeSpeechIdRef.current !== id) return

            try {
              await speakWithKokoro(id, text, toMixerRoutableVoice(voice))
              completeSpeech(id)
              return
            } catch (fallbackError) {
              console.error('[tts] Kokoro fallback failed, falling back to system voice:', fallbackError)
              if (activeSpeechIdRef.current !== id) return
              // Continue to the browser's system speech fallback below.
            }
          } finally {
            window.api.overlay?.notifySpeechState?.(false, false)
          }
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

        if (activeSpeechIdRef.current !== id) return

        utterance.onend = () => {
          completeSpeech(id)
        }

        utterance.onerror = () => {
          completeSpeech(id)
        }

        window.speechSynthesis.speak(utterance)
      })
    )

    // Lookahead prefetch: local Kokoro only. ElevenLabs is cloud-billed per
    // generated character, so it must never prefetch invisible/skippable speech.
    cleanups.push(
      window.api.on('tts:prefetch', (data: any) => {
        const { id, text, voice, eventType, enqueuedAt } = data
        if (voice?.provider === 'kokoro' && !isStaleLiveTts({ eventType, enqueuedAt })) {
          prefetchKokoroSpeech(id, text, voice)
        }
      })
    )

    // Handle stop speaking
    cleanups.push(
      window.api.on('tts:stop-speaking', () => {
        activeSpeechIdRef.current = null
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
        const nextQueue = Array.isArray(queue) ? queue : []
        setQueue(nextQueue)
        const retainedIds = nextQueue.map((item: any) => String(item?.id || '')).filter(Boolean)
        if (activeSpeechIdRef.current) retainedIds.push(activeSpeechIdRef.current)
        pruneKokoroPrefetches(retainedIds)
      })
    )

    return () => {
      clearTimeout(prepTimer)
      settingsCleanup()
      cleanups.forEach((fn) => fn())
      activeSpeechIdRef.current = null
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
    elevenlabsApiKeyId: profile?.elevenlabsApiKeyId,
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

  // Warming synthesizes audio, which loads the (large) Kokoro model as a side
  // effect. Never do that while nothing is allowed to speak.
  const resolved = resolveAppSettings(settings || {})
  const ttsActive = resolved.tts.enabled
  const cohostActive = resolved.ai.enabled
  if (!ttsActive && !cohostActive) return

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]))
  const warmProfiles = new Map<string, VoiceProfile>()

  const addProfile = (profile?: VoiceProfile | null) => {
    if (!profile || (profile.provider ?? 'system') !== 'kokoro') return
    warmProfiles.set(profile.id, profile)
  }

  if (ttsActive) {
    const defaultProfile = profiles.find((profile) => profile.isDefault) ?? profiles[0]
    addProfile(defaultProfile)

    for (const { flatKey, nestedKey } of [
      { flatKey: 'ttsChatVoiceProfileId', nestedKey: 'chatVoiceProfileId' },
      { flatKey: 'ttsSubscriptionVoiceProfileId', nestedKey: 'subscriptionVoiceProfileId' }
    ]) {
      const profileId =
        typeof settings?.[flatKey] === 'string'
          ? settings[flatKey]
          : typeof settings?.tts?.[nestedKey] === 'string'
            ? settings.tts[nestedKey]
            : ''
      addProfile(profileId ? profileById.get(profileId) : defaultProfile)
    }

    const rawOverrides = Array.isArray(settings?.tts?.userVoiceOverrides)
      ? settings.tts.userVoiceOverrides
      : settings?.ttsUserVoiceOverrides
    const overrides = Array.isArray(rawOverrides)
      ? (rawOverrides as TTSUserVoiceOverride[])
      : []
    for (const override of overrides.slice(0, 8)) {
      if (!override.enabled) continue

      if (override.mode === 'profile') {
        addProfile(profileById.get(override.voiceProfileId))
      } else if (override.provider === 'kokoro') {
        warmProfiles.set(`user:${override.id}`, profileFromOverride(override))
      }
    }
  }

  for (const profile of warmProfiles.values()) {
    warmKokoroProfile(profile)
  }

  // Also warm up the AI signature voice, but only when the co-host can speak
  if (cohostActive) {
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
}

function profileFromOverride(override: TTSUserVoiceOverride): VoiceProfile {
  return {
    id: `user:${override.id}`,
    name: override.username,
    provider: 'kokoro',
    voiceName: override.voiceName,
    kokoroVoice: override.kokoroVoice || DEFAULT_KOKORO_VOICE,
    elevenlabsVoiceId: override.elevenlabsVoiceId || ELEVENLABS_DEFAULT_VOICE_ID,
    elevenlabsApiKeyId: override.elevenlabsApiKeyId || '',
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


