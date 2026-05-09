/**
 * ElevenLabs TTS playback module.
 *
 * Architecture:
 *  - `speakWithElevenLabs` fetches audio from the EL REST API and plays it.
 *  - Cloud generation is never prefetched because every API call can spend
 *    ElevenLabs credits. Only explicit play/test/live speech calls generate.
 *  - An LRU cache stores rendered audio for short repeated phrases (gift/sub
 *    announcement templates, common chat openers).
 */

import type { VoiceProfile } from '../../main/tts/voice-profiles'
import { ELEVENLABS_DEFAULT_MODEL, ELEVENLABS_DEFAULT_VOICE_ID, type ElevenLabsVoicePreset } from '../../shared/tts-providers'
import { applyVoiceEffects, getDynamicPitchAndRate } from './audio-effects'
import { resolveAppSettings } from '../../shared/app-settings'
import { audioEngine } from '../utils/audio-engine'

export interface ElevenLabsApiVoice {
  voice_id: string
  name: string
  samples: any[]
  category: string
  labels: Record<string, string>
  description: string
  preview_url: string
  settings: any
}

// ─── LRU cache ────────────────────────────────────────────────────────────────

class LruCache<V> {
  private readonly map = new Map<string, V>()
  constructor(private readonly maxSize: number) {}

  has(key: string): boolean { return this.map.has(key) }

  get(key: string): V | undefined {
    const val = this.map.get(key)
    if (val !== undefined) { this.map.delete(key); this.map.set(key, val) }
    return val
  }

  set(key: string, val: V): void {
    if (this.map.has(key)) {
      this.map.delete(key)
    } else if (this.map.size >= this.maxSize) {
      const oldest = this.map.keys().next().value
      if (oldest !== undefined) this.map.delete(oldest)
    }
    this.map.set(key, val)
  }

  clear(): void {
    this.map.clear()
  }
}

const audioCache = new LruCache<Blob>(40)
const EL_CACHE_VERSION = 'el-mp3-44100-v2'
const ELEVENLABS_OUTPUT_FORMAT = 'mp3_44100_128'

function cacheKey(text: string, profile: VoiceProfile): string {
  const voiceId = profile.elevenlabsVoiceId || ELEVENLABS_DEFAULT_VOICE_ID
  const stability = profile.elevenlabsStability ?? 0.5
  const similarity = profile.elevenlabsSimilarity ?? 0.8
  const style = profile.elevenlabsStyle ?? 0
  return `${EL_CACHE_VERSION}::${voiceId}::${stability}::${similarity}::${style}::${text}`
}

// ─── Active playback state ────────────────────────────────────────────────────

let activeAudio: HTMLAudioElement | null = null
let activeObjectUrl: string | null = null
let activeRequestId = 0

// ─── Public API ───────────────────────────────────────────────────────────────

export function prefetchElevenLabsSpeech(
  id: string,
  text: string,
  profile: VoiceProfile,
  apiKey: string
): void {
  // Intentional no-op. Unlike local Kokoro warm-up, cloud prefetch consumes
  // billable ElevenLabs characters even if the queued message is skipped.
  void id
  void text
  void profile
  void apiKey
}

export async function speakWithElevenLabs(
  id: string,
  text: string,
  profile: VoiceProfile,
  apiKey: string
): Promise<void> {
  if (!apiKey) throw new Error('ElevenLabs API key is not configured. Add it in Settings.')

  stopElevenLabsSpeech()
  const requestId = ++activeRequestId
  const normalizedText = normalizeElevenLabsText(text)
  
  const key = cacheKey(normalizedText, profile)

  // 1. Cache hit — instant
  const cached = audioCache.get(key)
  if (cached) {
    return playBlob(cached, profile, requestId, normalizedText)
  }

  let blob: Blob
  blob = await fetchElevenLabsAudio(normalizedText, profile, apiKey)

  if (requestId !== activeRequestId) return

  if (normalizedText.length <= 200) audioCache.set(key, blob)

  return playBlob(blob, profile, requestId, normalizedText)
}

export function getElevenLabsBillableCharacters(text: string): number {
  return normalizeElevenLabsText(text).length
}

export function isElevenLabsSpeechCached(text: string, profile: VoiceProfile): boolean {
  return audioCache.has(cacheKey(normalizeElevenLabsText(text), profile))
}

export function stopElevenLabsSpeech(): void {
  activeRequestId += 1
  if (activeAudio) {
    activeAudio.pause()
    activeAudio.currentTime = 0
  }
  clearActive()
}

export function pauseElevenLabsSpeech(): void {
  activeAudio?.pause()
}

export function resumeElevenLabsSpeech(): void {
  void activeAudio?.play()
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

export async function fetchElevenLabsVoices(apiKey: string): Promise<ElevenLabsVoicePreset[]> {
  if (!apiKey) return []

  try {
    const prefix = apiKey ? apiKey.slice(0, 4) + '...' : 'MISSING'
    console.log(`[ElevenLabs] Fetching voices with key prefix: ${prefix}`)
    
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': apiKey }
    })

    if (!response.ok) {
      if (response.status === 401) throw new Error('Invalid ElevenLabs API Key')
      if (response.status === 429) throw new Error('ElevenLabs rate limit exceeded')
      const body = await response.text().catch(() => '')
      throw new Error(`ElevenLabs API Error (${response.status}): ${body || response.statusText}`)
    }

    const data = await response.json()
    const voices = data.voices || []
    
    return voices.map((v: any) => ({
      id: v.voice_id,
      name: v.name,
      description: v.description || v.category || '',
      accent: v.labels?.accent || v.labels?.language || 'Universal',
      gender: (v.labels?.gender as any) || 'Female',
      tags: Object.values(v.labels || {})
    }))
  } catch (error: any) {
    // Only log if it's not a standard 401/403 to avoid spamming the console
    if (!error.message?.includes('401') && !error.message?.includes('API Key')) {
      console.error('[ElevenLabs] Failed to fetch voices:', error)
    }
    return []
  }
}

async function fetchElevenLabsAudio(
  text: string,
  profile: VoiceProfile,
  apiKey: string
): Promise<Blob> {
  const voiceId = profile.elevenlabsVoiceId || ELEVENLABS_DEFAULT_VOICE_ID

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`
  
  const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text,
        model_id: ELEVENLABS_DEFAULT_MODEL,
        output_format: ELEVENLABS_OUTPUT_FORMAT,
        voice_settings: {
          stability: profile.elevenlabsStability ?? 0.5,
          similarity_boost: profile.elevenlabsSimilarity ?? 0.8,
          style: profile.elevenlabsStyle ?? 0,
          use_speaker_boost: true
        }
      })
    }
  )

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText)
    throw new Error(`ElevenLabs API error ${response.status}: ${message}`)
  }

  return response.blob()
}

async function playBlob(blob: Blob, profile: VoiceProfile, requestId: number, text: string): Promise<void> {
  if (requestId !== activeRequestId) return

  const objectUrl = URL.createObjectURL(blob)
  const audio = new Audio(objectUrl)
  const rate = Math.max(0.5, Math.min(2, profile.rate ?? 1))
  
  // Apply modifiers
  const settingsRaw = await window.api.settings.getAll()
  const globalSettings = resolveAppSettings(settingsRaw)
  
  // Merge profile-specific effects
  const settings = {
    ...globalSettings,
    voiceModifiers: {
      ...globalSettings.voiceModifiers,
      ...(profile.effects ? {
        radioFilter: profile.effects.some(e => e.type === 'robot' && (e as any).enabled !== false),
        speedRamping: profile.effects.some(e => e.type === 'pitch-shift' && (e as any).enabled !== false),
        pitchShifting: profile.effects.some(e => e.type === 'pitch-shift') ? 'high' : globalSettings.voiceModifiers.pitchShifting
      } : {})
    }
  }

  const { pitch, rate: dynamicRate } = getDynamicPitchAndRate(text, settings.voiceModifiers, 1.0, rate)
  
  audio.playbackRate = dynamicRate

  // Web Audio for filters
  const context = audioEngine.getContext()

  if (globalSettings.audioOutputDeviceId && globalSettings.audioOutputDeviceId !== 'default' && (context as any).setSinkId) {
    try {
      await (context as any).setSinkId(globalSettings.audioOutputDeviceId)
    } catch (e) {
      console.warn('[elevenlabs] Failed to set sinkId:', e)
    }
  }

  if (context.state === 'suspended') await context.resume()

  const source = context.createMediaElementSource(audio)
  const gain = context.createGain()
  gain.gain.value = Math.max(0, Math.min(1, profile.volume ?? 1))

  let lastNode: AudioNode = source
  lastNode = applyVoiceEffects(context, lastNode, settings.voiceModifiers, text)
  
  lastNode.connect(gain)

  // Route to stream if possible
  const ttsBus = audioEngine.getTtsBus()
  const broadcastBus = audioEngine.getBroadcastBus()
  
  if (ttsBus) {
    gain.connect(ttsBus)
  } else if (broadcastBus) {
    gain.connect(broadcastBus)
  }

  // If the studio mixer is available, monitoring is handled by the mixer.
  // Otherwise play directly so previews and non-studio TTS still make sound.
  if (!ttsBus && !broadcastBus) {
    gain.connect(context.destination)
  }

  activeAudio = audio
  activeObjectUrl = objectUrl

  await audio.play()

  return new Promise((resolve) => {
    audio.onended = () => {
      if (requestId === activeRequestId) clearActive()
      resolve()
    }
    audio.onerror = () => {
      clearActive()
      resolve()
    }
  })
}

function clearActive(): void {
  if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl)
  activeAudio = null
  activeObjectUrl = null
}

function normalizeElevenLabsText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}
