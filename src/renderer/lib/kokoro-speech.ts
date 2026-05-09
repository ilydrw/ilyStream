import type { VoiceProfile } from '../../main/tts/voice-profiles'
import { DEFAULT_KOKORO_VOICE, KOKORO_MODEL_ID, isKokoroVoiceId } from '../../shared/tts-providers'
import { applyVoiceEffects, getDynamicPitchAndRate } from './audio-effects'
import { resolveAppSettings } from '../../shared/app-settings'
import { audioEngine } from '../utils/audio-engine'

type KokoroModule = typeof import('kokoro-js')
type KokoroInstance = Awaited<ReturnType<KokoroModule['KokoroTTS']['from_pretrained']>>
type RawAudio = Awaited<ReturnType<KokoroInstance['generate']>>
type RenderedAudio = {
  samples: Float32Array
  sampleRate: number
  text?: string
}

const KOKORO_AUDIO_CACHE_VERSION = 'web-audio-single-voice-v2'

// ─── LRU Cache ────────────────────────────────────────────────────────────────

class LruCache<V> {
  private readonly map = new Map<string, V>()

  constructor(private readonly maxSize: number) {}

  has(key: string): boolean {
    return this.map.has(key)
  }

  get(key: string): V | undefined {
    const val = this.map.get(key)
    if (val !== undefined) {
      this.map.delete(key)
      this.map.set(key, val)
    }
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
}

// ─── Model singleton ──────────────────────────────────────────────────────────

let modelPromise: Promise<KokoroInstance> | null = null

/**
 * Eagerly begin loading the Kokoro model at app startup.
 * Eliminates cold-start latency on the first TTS request.
 * Safe to call multiple times — loads only once.
 */
export function preloadKokoroModel(): void {
  void loadKokoroModel()
}

function loadKokoroModel(): Promise<KokoroInstance> {
  modelPromise ??= (async () => {
    const { KokoroTTS } = await import('kokoro-js')

    // Audio quality beats speed for stream TTS. WebGPU can be faster, but on
    // some Windows GPU/driver combos it produces buzzy/revving artifacts.
    try {
      const model = await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
        dtype: 'fp32',
        device: 'wasm'
      })
      console.info('[kokoro] Model loaded successfully (fp32)')
      return model
    } catch (error) {
      console.warn('[kokoro] WASM fp32 failed, falling back to WASM q8:', error)
    }

    const fallback = await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
      dtype: 'q8',
      device: 'wasm'
    })
    return fallback
  })()

  return modelPromise
}

export function warmKokoroProfile(profile: VoiceProfile, text = 'ready'): void {
  const normalized = normalizeText(text)
  if (!normalized) return

  const cacheKey = audioCacheKey(normalized, profile)
  if (audioCache.has(cacheKey)) return

  void generateKokoroAudio(normalized, profile)
    .then((audio) => audioCache.set(cacheKey, audio))
    .catch((error) => {
      console.warn('[kokoro] Warm-up failed:', error)
    })
}

// ─── Active playback ──────────────────────────────────────────────────────────

let activeSource: AudioBufferSourceNode | null = null
let activeGain: GainNode | null = null
let activeResolve: (() => void) | null = null
let activeRequestId = 0

// ─── Lookahead prefetch ───────────────────────────────────────────────────────

/**
 * Pending background generations keyed by TTSQueueItem.id.
 *
 * The ONNX runtime runs on a Web Worker; audio playback runs in the browser
 * audio thread. Both can proceed concurrently, so generation of item N+1
 * runs while item N is playing — ideally finishing before N ends.
 */
const prefetchMap = new Map<string, Promise<RenderedAudio>>()

/**
 * Begin generating audio for an upcoming item in the background.
 * When speakWithKokoro() is later called with the same id, the inference
 * result is already resolved and playback starts without any synthesis delay.
 */
export function prefetchKokoroSpeech(id: string, text: string, profile: VoiceProfile): void {
  if (prefetchMap.has(id)) return

  const normalized = normalizeText(text)

  // Skip if the phrase is already in the audio cache
  if (audioCache.has(audioCacheKey(normalized, profile))) return

  const promise = generateKokoroAudio(normalized, profile)

  prefetchMap.set(id, promise)
}

// ─── Audio phrase cache ───────────────────────────────────────────────────────

/**
 * LRU cache of rendered audio for short repeated phrases
 * ("W", "gg", gift announcements, sub templates, etc.).
 * Keyed by normalizedText::voiceId::rate.
 */
const audioCache = new LruCache<RenderedAudio>(80)

function audioCacheKey(normalizedText: string, profile: VoiceProfile): string {
  return [
    KOKORO_AUDIO_CACHE_VERSION,
    normalizedText,
    resolveKokoroVoiceString(profile),
    resolveKokoroGenerationSpeed(profile)
  ].join('::')
}

// ─── Main public API ──────────────────────────────────────────────────────────

export async function speakWithKokoro(
  id: string,
  text: string,
  profile: VoiceProfile
): Promise<void> {
  stopKokoroSpeech()
  const requestId = ++activeRequestId

  const normalized = normalizeText(text)
  const cacheKey = audioCacheKey(normalized, profile)

  const cached = audioCache.get(cacheKey)
  if (cached) {
    return playKokoroAudio(cached, profile, requestId)
  }

  const prefetchPromise = prefetchMap.get(id)
  if (prefetchPromise) {
    prefetchMap.delete(id)
  }

  let renderedAudio: RenderedAudio
  try {
    renderedAudio = prefetchPromise
      ? await prefetchPromise
      : await generateKokoroAudio(normalized, profile)
  } catch (error) {
    if (!prefetchPromise) throw error
    console.warn('[kokoro] Prefetch failed, regenerating audio:', error)
    renderedAudio = await generateKokoroAudio(normalized, profile)
  }

  if (requestId !== activeRequestId) return

  if (normalized.length <= 140) audioCache.set(cacheKey, renderedAudio)

  return playKokoroAudio(renderedAudio, profile, requestId)
}

async function generateKokoroAudio(
  normalized: string,
  profile: VoiceProfile
): Promise<RenderedAudio> {
  const tts = await loadKokoroModel()
  const voice = resolveKokoroVoiceString(profile)

  // Inject natural pauses for better flow
  const pacedText = normalized
    .replace(/([.?!])\s+/g, '$1  ') // Double space after sentence ends for longer pauses
    .replace(/([,;:])\s+/g, '$1 ')   // Normal space after commas

  const rawAudio = await tts.generate(pacedText, {
    voice: voice as Parameters<KokoroInstance['generate']>[1]['voice'],
    speed: resolveKokoroGenerationSpeed(profile)
  })

  const rendered = toRenderedAudio(rawAudio)
  rendered.text = normalized
  return rendered
}

async function playKokoroAudio(
  audio: RenderedAudio,
  profile: VoiceProfile,
  requestId: number
): Promise<void> {
  if (requestId !== activeRequestId) return

  const context = await getAudioContext()
  if (requestId !== activeRequestId) return

  const buffer = context.createBuffer(1, audio.samples.length, audio.sampleRate)
  buffer.copyToChannel(audio.samples, 0)

  const source = context.createBufferSource()
  source.buffer = buffer

  const gain = context.createGain()
  gain.gain.value = clamp(profile.volume ?? 1, 0, 1)

  // Fetch current settings for modifiers
  const settingsRaw = await window.api.settings.getAll()
  const settings = resolveAppSettings(settingsRaw)

  // Apply pitch/rate shift
  const { pitch, rate } = getDynamicPitchAndRate(
    audio.text || '', // We need to store text in RenderedAudio or pass it down
    settings.voiceModifiers,
    1.0,
    1.0
  )
  
  source.playbackRate.value = rate * pitch // In Kokoro/BufferSource, pitch is achieved via playbackRate if not using a pitch shifter node

  let lastNode: AudioNode = source

  // Apply Web Audio filters (Radio Filter, etc.)
  // We prioritize the effects defined in the profile (e.g. for the AI co-host)
  const effectiveModifiers = {
    ...settings.voiceModifiers,
    ...(profile.effects ? {
      radioFilter: profile.effects.some(e => e.type === 'robot' && (e as any).enabled !== false),
      speedRamping: profile.effects.some(e => e.type === 'pitch-shift' && (e as any).enabled !== false),
      pitchShifting: profile.effects.some(e => e.type === 'pitch-shift') ? 'high' : settings.voiceModifiers.pitchShifting
    } : {})
  }

  lastNode = applyVoiceEffects(context, lastNode, effectiveModifiers, audio.text || '')

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

  activeSource = source
  activeGain = gain

  return new Promise((resolve) => {
    let settled = false
    const settle = () => {
      if (settled) return
      settled = true

      if (requestId === activeRequestId) {
        clearActiveAudio()
      }
      resolve()
    }

    activeResolve = settle
    source.onended = settle
    source.start()
  })
}

export function stopKokoroSpeech(): void {
  activeRequestId += 1

  if (activeSource) {
    try {
      activeSource.stop()
    } catch {
      // Already stopped or never started.
    }
  }

  activeResolve?.()
  clearActiveAudio()
}

export function pauseKokoroSpeech(): void {
  void audioEngine.getContext()?.suspend()
}

export function resumeKokoroSpeech(): void {
  void audioEngine.getContext()?.resume()
}

// ─── Text normalisation ───────────────────────────────────────────────────────

/**
 * Clean text before synthesis:
 *  - Replace emoji with a space so adjacent words don't merge ("hey🔥ok" → "hey ok")
 *  - Collapse runs of 4+ identical characters (LOOOOOL → LOOOL)
 *  - Collapse extra whitespace
 */
function normalizeText(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/(.)\1{3,}/g, '$1$1$1')
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Build the Kokoro voice string.
 */
function resolveKokoroVoiceString(profile: VoiceProfile): string {
  const primary = profile.kokoroVoice && isKokoroVoiceId(profile.kokoroVoice)
    ? profile.kokoroVoice
    : DEFAULT_KOKORO_VOICE

  // kokoro-js only accepts concrete voice IDs. Weighted voice strings sound
  // tempting, but the library rejects them and silently kills live TTS.
  return primary
}

/** @deprecated Use resolveKokoroVoiceString instead. */
function resolveKokoroVoice(voice?: string): string {
  return voice && isKokoroVoiceId(voice) ? voice : DEFAULT_KOKORO_VOICE
}

// keep resolveKokoroVoice to avoid unused-variable lint errors in tests
void resolveKokoroVoice

function resolveKokoroGenerationSpeed(profile: VoiceProfile): number {
  // Kokoro gets metallic when pushed too far. Keep local neural voices in the
  // clean range; system voices can still use wider OS-native speed controls.
  return clamp(profile.rate ?? 1, 0.85, 1.18)
}

function clearActiveAudio(): void {
  activeSource?.disconnect()
  activeGain?.disconnect()
  activeSource = null
  activeGain = null
  activeResolve = null
}

async function getAudioContext(): Promise<AudioContext> {
  const context = audioEngine.getContext()

  const settingsRaw = await window.api.settings.getAll()
  const settings = resolveAppSettings(settingsRaw)
  
  if (settings.audioOutputDeviceId && settings.audioOutputDeviceId !== 'default' && (context as any).setSinkId) {
    try {
      await (context as any).setSinkId(settings.audioOutputDeviceId)
    } catch (e) {
      console.warn('[kokoro] Failed to set sinkId:', e)
    }
  }

  if (context.state === 'suspended') {
    await context.resume()
  }

  return context
}

function toRenderedAudio(rawAudio: RawAudio): RenderedAudio {
  return {
    samples: rawAudio.audio,
    sampleRate: rawAudio.sampling_rate
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
