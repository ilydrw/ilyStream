export type TTSVoiceProvider = 'system' | 'kokoro' | 'elevenlabs'

export const DEFAULT_TTS_PROVIDER: TTSVoiceProvider = 'kokoro'
export const DEFAULT_KOKORO_VOICE = 'af_heart'

// ─── ElevenLabs ───────────────────────────────────────────────────────────────

export const ELEVENLABS_DEFAULT_MODEL = 'eleven_multilingual_v2'
export const ELEVENLABS_DEFAULT_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb' // George

export interface ElevenLabsVoicePreset {
  id: string
  name: string
  description: string
  accent: string
  gender: 'Female' | 'Male'
  tags: string[]
}

/**
 * Curated subset of ElevenLabs built-in voices available on all plans.
 * Full list (including cloned voices) is fetched from the API using the user's key.
 */
export const ELEVENLABS_VOICES: ElevenLabsVoicePreset[] = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel',   description: 'Calm narrator',         accent: 'American', gender: 'Female', tags: ['calm', 'narrator'] },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi',     description: 'Strong & confident',     accent: 'American', gender: 'Female', tags: ['strong'] },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella',    description: 'Soft storyteller',       accent: 'American', gender: 'Female', tags: ['soft'] },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli',     description: 'Energetic & young',      accent: 'American', gender: 'Female', tags: ['young', 'energetic'] },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda',  description: 'Warm & relatable',       accent: 'American', gender: 'Female', tags: ['warm'] },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica',  description: 'Expressive & emotive',   accent: 'American', gender: 'Female', tags: ['expressive'] },
  { id: 'jsCqWAovK2LkecY7zXl4', name: 'Freya',    description: 'Overly dramatic',        accent: 'American', gender: 'Female', tags: ['dramatic', 'character'] },
  { id: 'oWAxZDx7w5VEj9dCyTzz', name: 'Grace',    description: 'Southern accent',        accent: 'American', gender: 'Female', tags: ['southern', 'character'] },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte','description': 'Seductive & playful',  accent: 'English',  gender: 'Female', tags: ['character'] },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice',    description: 'Confident narrator',     accent: 'British',  gender: 'Female', tags: ['british', 'narrator'] },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily',     description: 'Warm reporter',          accent: 'British',  gender: 'Female', tags: ['british', 'warm'] },
  { id: 'ThT5KcBeYPX3keUQqHPh', name: 'Dorothy',  description: 'Pleasant & gentle',      accent: 'British',  gender: 'Female', tags: ['pleasant'] },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam',     description: 'Deep narrator',          accent: 'American', gender: 'Male',   tags: ['deep', 'narrator'] },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh',     description: 'Young & casual',         accent: 'American', gender: 'Male',   tags: ['young'] },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold',   description: 'Crisp & clear',          accent: 'American', gender: 'Male',   tags: ['crisp'] },
  { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam',      description: 'Confident & raspy',      accent: 'American', gender: 'Male',   tags: ['confident'] },
  { id: 'GBv7mTt0atIp3Br8iCZE', name: 'Thomas',   description: 'Calm & gentle',          accent: 'American', gender: 'Male',   tags: ['calm'] },
  { id: 'bIHbv24MWmeRgasZH58o', name: 'Will',     description: 'Friendly & upbeat',      accent: 'American', gender: 'Male',   tags: ['friendly'] },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam',     description: 'Articulate narrator',    accent: 'American', gender: 'Male',   tags: ['narrator'] },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie',  description: 'Natural conversational', accent: 'Australian', gender: 'Male', tags: ['natural'] },
  { id: 'SOYHLrjzK2X1ezoPC6cr', name: 'Harry',    description: 'Anxious & whispery',     accent: 'American', gender: 'Male',   tags: ['character'] },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum',   description: 'Hoarse intensity',       accent: 'American', gender: 'Male',   tags: ['character', 'intense'] },
  { id: 'ODq5zmih8GrVes37Dy39', name: 'Patrick',  description: 'Shouty & loud',          accent: 'American', gender: 'Male',   tags: ['character', 'loud'] },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George',   description: 'Raspy narrator',         accent: 'British',  gender: 'Male',   tags: ['british', 'raspy'] },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel',   description: 'Deep & authoritative',   accent: 'British',  gender: 'Male',   tags: ['british', 'deep'] },
]

export interface KokoroVoiceOption {
  id: string
  name: string
  language: string
  gender: 'Female' | 'Male'
  grade: string
  recommended?: boolean
}

export const KOKORO_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX'

export const KOKORO_VOICES: KokoroVoiceOption[] = [
  { id: 'af_heart', name: 'Heart', language: 'American English', gender: 'Female', grade: 'A', recommended: true },
  { id: 'af_bella', name: 'Bella', language: 'American English', gender: 'Female', grade: 'A-', recommended: true },
  { id: 'af_nicole', name: 'Nicole', language: 'American English', gender: 'Female', grade: 'B-', recommended: true },
  { id: 'af_sarah', name: 'Sarah', language: 'American English', gender: 'Female', grade: 'C+' },
  { id: 'af_kore', name: 'Kore', language: 'American English', gender: 'Female', grade: 'C+' },
  { id: 'af_aoede', name: 'Aoede', language: 'American English', gender: 'Female', grade: 'C+' },
  { id: 'af_alloy', name: 'Alloy', language: 'American English', gender: 'Female', grade: 'C' },
  { id: 'af_nova', name: 'Nova', language: 'American English', gender: 'Female', grade: 'C' },
  { id: 'af_sky', name: 'Sky', language: 'American English', gender: 'Female', grade: 'C-' },
  { id: 'am_fenrir', name: 'Fenrir', language: 'American English', gender: 'Male', grade: 'C+', recommended: true },
  { id: 'am_michael', name: 'Michael', language: 'American English', gender: 'Male', grade: 'C+', recommended: true },
  { id: 'am_puck', name: 'Puck', language: 'American English', gender: 'Male', grade: 'C+' },
  { id: 'am_echo', name: 'Echo', language: 'American English', gender: 'Male', grade: 'D' },
  { id: 'am_eric', name: 'Eric', language: 'American English', gender: 'Male', grade: 'D' },
  { id: 'bf_emma', name: 'Emma', language: 'British English', gender: 'Female', grade: 'B-', recommended: true },
  { id: 'bf_isabella', name: 'Isabella', language: 'British English', gender: 'Female', grade: 'C' },
  { id: 'bf_alice', name: 'Alice', language: 'British English', gender: 'Female', grade: 'D' },
  { id: 'bm_fable', name: 'Fable', language: 'British English', gender: 'Male', grade: 'C' },
  { id: 'bm_george', name: 'George', language: 'British English', gender: 'Male', grade: 'C' },
  { id: 'bm_lewis', name: 'Lewis', language: 'British English', gender: 'Male', grade: 'D+' }
]

export interface KokoroVoicePreset {
  id: string
  name: string
  description: string
  useCase: string
  primaryVoice: string
  blendVoice?: string
  blendWeight?: number
  pitch: number
  rate: number
  volume: number
  tags: string[]
}

export const KOKORO_VOICE_PRESETS: KokoroVoicePreset[] = [
  {
    id: 'stream-host-bright',
    name: 'Bright Host',
    description: 'Clean, upbeat host voice for normal chat callouts.',
    useCase: 'Chat',
    primaryVoice: 'af_bella',
    pitch: 1,
    rate: 1.04,
    volume: 1,
    tags: ['friendly', 'clear']
  },
  {
    id: 'late-night-narrator',
    name: 'Late Night Narrator',
    description: 'Lower, smoother narration for dramatic moments and longer messages.',
    useCase: 'Narration',
    primaryVoice: 'am_michael',
    pitch: 0.96,
    rate: 0.94,
    volume: 1,
    tags: ['smooth', 'deep']
  },
  {
    id: 'arcade-announcer',
    name: 'Arcade Announcer',
    description: 'Punchy announcer voice for gifts, follows, and hype triggers.',
    useCase: 'Alerts',
    primaryVoice: 'am_fenrir',
    pitch: 1,
    rate: 1.12,
    volume: 1,
    tags: ['hype', 'alert']
  },
  {
    id: 'cozy-reader',
    name: 'Cozy Reader',
    description: 'Soft spoken voice for relaxed streams and lower-energy chats.',
    useCase: 'Chat',
    primaryVoice: 'af_nicole',
    pitch: 1,
    rate: 0.9,
    volume: 0.95,
    tags: ['soft', 'calm']
  },
  {
    id: 'british-stage',
    name: 'British Stage',
    description: 'Distinct British presenter tone for premium events and subs.',
    useCase: 'Subs',
    primaryVoice: 'bf_emma',
    pitch: 1,
    rate: 0.98,
    volume: 1,
    tags: ['british', 'presenter']
  },
  {
    id: 'gremlin-chat',
    name: 'Gremlin Chat',
    description: 'Fast, weird, playful voice for special users or chaos mode.',
    useCase: 'Special users',
    primaryVoice: 'am_puck',
    pitch: 1.08,
    rate: 1.16,
    volume: 1,
    tags: ['funny', 'character']
  },
  {
    id: 'radio-dispatch',
    name: 'Radio Dispatch',
    description: 'Dry command-center readout for moderation and system events.',
    useCase: 'System',
    primaryVoice: 'am_michael',
    pitch: 0.94,
    rate: 1.02,
    volume: 0.96,
    tags: ['utility', 'dry']
  },
  {
    id: 'gentle-brit',
    name: 'Gentle Brit',
    description: 'Gentle British voice with enough brightness to stay readable.',
    useCase: 'Chat',
    primaryVoice: 'bf_emma',
    pitch: 1,
    rate: 0.96,
    volume: 1,
    tags: ['british', 'warm']
  }
]

export function isKokoroVoiceId(value: string): boolean {
  return KOKORO_VOICES.some((voice) => voice.id === value)
}
