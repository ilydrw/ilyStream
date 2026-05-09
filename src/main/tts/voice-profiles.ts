import {
  DEFAULT_KOKORO_VOICE,
  DEFAULT_TTS_PROVIDER,
  type TTSVoiceProvider
} from '../../shared/tts-providers'

/**
 * Voice profile management for the TTS system.
 * Each profile defines voice parameters and audio effects.
 */

export interface AudioEffect {
  type: 'reverb' | 'echo' | 'robot' | 'pitch-shift' | 'chorus'
  enabled: boolean
  params: Record<string, number>
}

export interface VoiceProfile {
  id: string
  name: string
  /** TTS engine used for this profile. */
  provider?: TTSVoiceProvider
  /** System voice name (from speechSynthesis.getVoices()) */
  voiceName: string
  /** Kokoro voice id when provider is "kokoro". */
  kokoroVoice?: string
  /**
   * Second Kokoro voice for blending, e.g. "am_michael".
   * The blended voice string becomes "{1-w}*{primary} + {w}*{kokoroBlendVoice}".
   */
  kokoroBlendVoice?: string
  /** Blend weight toward kokoroBlendVoice (0 = pure primary, 1 = pure blend). */
  kokoroBlendWeight?: number
  /** ElevenLabs voice ID (UUID) when provider is "elevenlabs". */
  elevenlabsVoiceId?: string
  /** ElevenLabs stability (0–1): lower = more expressive, higher = more consistent. */
  elevenlabsStability?: number
  /** ElevenLabs similarity boost (0–1): higher = closer to original voice character. */
  elevenlabsSimilarity?: number
  /** ElevenLabs style (0–1): exaggerates speaker style (v2 models only). */
  elevenlabsStyle?: number
  /** Voice language (e.g., 'en-US') */
  lang: string
  /** Pitch multiplier (0.1 - 2.0, default 1.0) */
  pitch: number
  /** Speech rate (0.1 - 3.0, default 1.0) */
  rate: number
  /** Volume (0.0 - 1.0, default 1.0) */
  volume: number
  /** Audio effects chain */
  effects: AudioEffect[]
  /** Whether this is the default profile */
  isDefault: boolean
}

export const DEFAULT_VOICE_PROFILE: VoiceProfile = {
  id: 'default',
  name: 'Default',
  provider: DEFAULT_TTS_PROVIDER,
  voiceName: '',
  kokoroVoice: DEFAULT_KOKORO_VOICE,
  lang: 'en-US',
  pitch: 1.0,
  rate: 1.0,
  volume: 1.0,
  effects: [],
  isDefault: true
}

export class VoiceProfileManager {
  private profiles: Map<string, VoiceProfile> = new Map()

  constructor() {
    this.profiles.set('default', { ...DEFAULT_VOICE_PROFILE })
  }

  get(id: string): VoiceProfile | undefined {
    return this.profiles.get(id)
  }

  getDefault(): VoiceProfile {
    for (const profile of this.profiles.values()) {
      if (profile.isDefault) return profile
    }
    return DEFAULT_VOICE_PROFILE
  }

  getAll(): VoiceProfile[] {
    return Array.from(this.profiles.values())
  }

  save(profile: VoiceProfile): void {
    // If setting as default, unset others
    if (profile.isDefault) {
      for (const p of this.profiles.values()) {
        p.isDefault = false
      }
    }
    this.profiles.set(profile.id, profile)
  }

  delete(id: string): boolean {
    if (id === 'default') return false
    return this.profiles.delete(id)
  }

  /** Load profiles from database records */
  loadFromRecords(records: VoiceProfile[]): void {
    this.profiles.clear()
    for (const record of records) {
      this.profiles.set(record.id, record)
    }
    // Ensure default exists
    if (!this.profiles.has('default')) {
      this.profiles.set('default', { ...DEFAULT_VOICE_PROFILE })
    }
  }
}
