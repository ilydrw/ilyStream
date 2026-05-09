import { describe, expect, it } from 'vitest'
import type { VoiceProfile } from '../../main/tts/voice-profiles'
import {
  createProfileFromSystemVoice,
  getMissingVoiceProfiles,
  groupSystemVoices,
  type SystemVoiceDescriptor
} from './local-voices'

const voices: SystemVoiceDescriptor[] = [
  { name: 'Microsoft Aria', lang: 'en-US', default: true },
  { name: 'Microsoft Jenny', lang: 'en-US' },
  { name: 'Microsoft Raul', lang: 'es-MX' }
]

describe('local voice helpers', () => {
  it('groups voices by language and filters search matches', () => {
    expect(groupSystemVoices(voices)).toEqual([
      {
        lang: 'en-US',
        voices: [
          { name: 'Microsoft Aria', lang: 'en-US', default: true },
          { name: 'Microsoft Jenny', lang: 'en-US' }
        ]
      },
      {
        lang: 'es-MX',
        voices: [{ name: 'Microsoft Raul', lang: 'es-MX' }]
      }
    ])

    expect(groupSystemVoices(voices, 'raul')).toEqual([
      {
        lang: 'es-MX',
        voices: [{ name: 'Microsoft Raul', lang: 'es-MX' }]
      }
    ])
  })

  it('detects saved profiles whose system voice is no longer available', () => {
    const profiles: VoiceProfile[] = [
      {
        id: 'default',
        name: 'Default',
        voiceName: '',
        lang: 'en-US',
        pitch: 1,
        rate: 1,
        volume: 1,
        effects: [],
        isDefault: true
      },
      {
        id: 'alert',
        name: 'Alert',
        provider: 'system',
        voiceName: 'Microsoft Missing',
        kokoroVoice: 'af_heart',
        lang: 'en-US',
        pitch: 1,
        rate: 1,
        volume: 1,
        effects: [],
        isDefault: false
      }
    ]

    expect(getMissingVoiceProfiles(profiles, voices)).toEqual([profiles[1]])

    expect(
      getMissingVoiceProfiles(
        [
          {
            ...profiles[1],
            provider: 'kokoro',
            voiceName: 'Microsoft Missing'
          }
        ],
        voices
      )
    ).toEqual([])
  })

  it('creates unique profile names when a voice already has a saved profile', () => {
    const existingProfiles: VoiceProfile[] = [
      {
        id: 'default',
        name: 'Default',
        voiceName: '',
        lang: 'en-US',
        pitch: 1,
        rate: 1,
        volume: 1,
        effects: [],
        isDefault: true
      },
      {
        id: 'aria-1',
        name: 'Microsoft Aria',
        voiceName: 'Microsoft Aria',
        lang: 'en-US',
        pitch: 1,
        rate: 1,
        volume: 1,
        effects: [],
        isDefault: false
      }
    ]

    expect(
      createProfileFromSystemVoice(voices[0], existingProfiles, () => 'generated-id')
    ).toEqual({
      id: 'generated-id',
      name: 'Microsoft Aria 2',
      provider: 'system',
      voiceName: 'Microsoft Aria',
      kokoroVoice: 'af_heart',
      lang: 'en-US',
      pitch: 1,
      rate: 1,
      volume: 1,
      effects: [],
      isDefault: false
    })
  })
})
