import { useCallback, useEffect, useRef, useState } from 'react'
import type { VoiceProfile } from '../../../../main/tts/voice-profiles'
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_TTS_COMMAND_PREFIXES,
  resolveAppSettings,
  type AppSettings,
  type TTSAudiencePermission
} from '../../../../shared/app-settings'
import {
  DEFAULT_KOKORO_VOICE,
  type ElevenLabsVoicePreset
} from '../../../../shared/tts-providers'
import { getMissingVoiceProfiles } from '../../../lib/local-voices'
import { useTTSStore } from '../../../stores/tts-store'
import { fetchElevenLabsVoices } from '../../../lib/elevenlabs-speech'
import { previewFallbackText } from '../constants'
import {
  cloneProfile,
  confirmElevenLabsSpend,
  getPreviewSpeechText,
  normalizeProfile,
  normalizeProviderSelection,
  sortProfiles,
  speakProfile,
  stopAllSpeech,
  upsertProfile
} from '../utils'
import { toast } from '../../../components/ui/Toast'

export function useTTSPage() {
  const { enabled, setEnabled } = useTTSStore()
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS)
  const [profiles, setProfiles] = useState<VoiceProfile[]>([])
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([])
  const [selectedProfileId, setSelectedProfileId] = useState<string>('default')
  const [draft, setDraft] = useState<VoiceProfile | null>(null)
  const [previewText, setPreviewText] = useState(previewFallbackText)
  const [ttsRequireCommand, setTtsRequireCommand] = useState(false)
  const [ttsCommandPrefixes, setTtsCommandPrefixes] = useState<string[]>(DEFAULT_TTS_COMMAND_PREFIXES)
  const [ttsAllowedRoles, setTtsAllowedRoles] = useState<TTSAudiencePermission[]>(['everyone'])
  const [ttsIgnoreEmotes, setTtsIgnoreEmotes] = useState(true)
  const [ttsVolume, setTtsVolume] = useState(0.8)
  const [elevenlabsApiKey, setElevenlabsApiKey] = useState('')
  const [syncedElevenLabsVoices, setSyncedElevenLabsVoices] = useState<ElevenLabsVoicePreset[]>([])
  const [voiceModifiers, setVoiceModifiers] = useState<AppSettings['voiceModifiers']>({
    radioFilter: false,
    speedRamping: true,
    pitchShifting: 'normal'
  })
  const [syncError, setSyncError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isSyncingVoices, setIsSyncingVoices] = useState(false)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const elevenlabsApiKeyRef = useRef('')

  // 1. Sync Settings
  useEffect(() => {
    if (!window.api?.settings) return
    let active = true

    void window.api.settings.getAll().then((settings: AppSettings) => {
      if (!active) return
      const resolved = resolveAppSettings(settings)
      setSettings(resolved)
      applySettingsToState(resolved)
    })

    const unsubscribe = window.api.on('settings:changed', (settings: unknown) => {
      const resolved = resolveAppSettings(settings as Partial<Record<keyof AppSettings, unknown>>)
      setSettings(resolved)
      applySettingsToState(resolved)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const applySettingsToState = (settings: AppSettings) => {
    if (settings.elevenlabsApiKey !== elevenlabsApiKeyRef.current) {
      elevenlabsApiKeyRef.current = settings.elevenlabsApiKey
      setElevenlabsApiKey(settings.elevenlabsApiKey)
      if (settings.elevenlabsApiKey) {
        setSyncError(null)
        void syncVoices(settings.elevenlabsApiKey)
      } else {
        setSyncedElevenLabsVoices([])
      }
    }
    setTtsRequireCommand(settings.tts.requireCommand)
    setTtsCommandPrefixes(settings.tts.commandPrefixes)
    setTtsAllowedRoles(settings.tts.allowedRoles)
    setTtsIgnoreEmotes(settings.tts.ignoreEmotes)
    setTtsVolume(settings.tts.volume)
    setVoiceModifiers(settings.tts.modifiers)
  }

  // 2. Sync Profiles
  useEffect(() => {
    if (!window.api?.voice) return

    const applyProfiles = (nextProfiles: VoiceProfile[]) => {
      const sortedProfiles = sortProfiles(nextProfiles)
      setProfiles(sortedProfiles)
      setSelectedProfileId((current) =>
        sortedProfiles.some((profile) => profile.id === current)
          ? current
          : (sortedProfiles[0]?.id ?? 'default')
      )
    }

    void window.api.voice.getAll().then(applyProfiles)
    const unsubscribe = window.api.on('voice:changed', (nextProfiles: unknown) => {
      applyProfiles(nextProfiles as VoiceProfile[])
    })
    return () => unsubscribe()
  }, [])

  // 3. System Voices
  const refreshVoices = useCallback(() => {
    const nextVoices = [...window.speechSynthesis.getVoices()].sort((left, right) =>
      `${left.lang}:${left.name}`.localeCompare(`${right.lang}:${right.name}`)
    )
    setAvailableVoices(nextVoices)
  }, [])

  useEffect(() => {
    refreshVoices()
    window.speechSynthesis.addEventListener('voiceschanged', refreshVoices)
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', refreshVoices)
      window.speechSynthesis.cancel()
    }
  }, [refreshVoices])

  // 4. ElevenLabs Sync
  const syncVoices = async (key?: string) => {
    const apiKey = key || elevenlabsApiKey
    if (!apiKey) {
      setSyncError('API key not configured')
      return
    }

    setIsSyncingVoices(true)
    setSyncError(null)
    try {
      const voices = await fetchElevenLabsVoices(apiKey)
      if (voices.length > 0) {
        setSyncedElevenLabsVoices(voices)
        toast.success(`Synced ${voices.length} neural voices`)
      } else {
        setSyncError('No voices found in account')
      }
    } catch (err: any) {
      setSyncError(err.message || 'Failed to sync voices')
      toast.error('ElevenLabs Sync Failed')
    } finally {
      setIsSyncingVoices(false)
    }
  }

  // 5. Actions
  const handleToggle = () => {
    const next = !enabled
    setEnabled(next)
    void window.api?.tts?.setEnabled(next)
    toast.info(next ? 'TTS Engine Active' : 'TTS Engine Muted')
  }

  const updateSetting = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((current) => resolveAppSettings({ ...current, [key]: value }))

    if (key === 'ttsEnabled') {
      setEnabled(Boolean(value))
      await window.api?.tts?.setEnabled(Boolean(value))
      return
    }

    await window.api?.settings?.set(key, value)
  }

  const createProfile = () => {
    const firstVoice = availableVoices[0]
    const nextProfile: VoiceProfile = {
      id: crypto.randomUUID(),
      name: `Voice ${profiles.length + 1}`,
      provider: 'system',
      voiceName: firstVoice?.name ?? '',
      kokoroVoice: DEFAULT_KOKORO_VOICE,
      lang: firstVoice?.lang ?? 'en-US',
      pitch: 1,
      rate: 1,
      volume: 1,
      effects: [],
      isDefault: false
    }

    setProfiles((current) => sortProfiles([...current, nextProfile]))
    setSelectedProfileId(nextProfile.id)
    setDraft(cloneProfile(nextProfile))
    toast.success('New profile created')
  }

  const saveDraft = async () => {
    if (!draft || !window.api?.voice) return
    const normalized = normalizeProfile(draft)
    if (normalized.name.length === 0) {
      toast.error('Profile name cannot be empty')
      return
    }

    setIsSaving(true)
    try {
      await window.api.voice.save(normalized)
      setProfiles((current) => sortProfiles(upsertProfile(current, normalized)))
      setSelectedProfileId(normalized.id)
      toast.success('Voice profile saved')
    } catch (err: any) {
      toast.error('Failed to save profile')
    } finally {
      setIsSaving(false)
    }
  }

  const deleteDraft = async () => {
    if (!draft || draft.id === 'default' || !window.api?.voice) return
    
    if (!confirm(`Are you sure you want to delete "${draft.name}"?`)) return

    const deleted = await window.api.voice.delete(draft.id)
    if (!deleted) return

    setProfiles((current) => {
      const nextProfiles = sortProfiles(current.filter((profile) => profile.id !== draft.id))
      setSelectedProfileId(nextProfiles[0]?.id ?? 'default')
      return nextProfiles
    })
    toast.info('Profile deleted')
  }

  const previewVoice = async () => {
    if (!draft) return
    const profile = normalizeProfile(draft)
    const text = getPreviewSpeechText(previewText)
    if (!confirmElevenLabsSpend(profile, text, elevenlabsApiKey)) return
    await speakProfile('preview', profile, text, setIsPreviewing, utteranceRef, elevenlabsApiKey)
  }

  const stopPreview = () => stopAllSpeech(setIsPreviewing)

  const setRequireCommandSetting = async (value: boolean) => {
    setTtsRequireCommand(value)
    await window.api?.settings?.set('ttsRequireCommand', value)
    toast.info(value ? 'Commands Required' : 'Open Speech Enabled')
  }

  const selectCommandPrefix = async (prefix: string) => {
    if (ttsCommandPrefixes.length === 1 && ttsCommandPrefixes[0] === prefix) return
    const next = [prefix]
    setTtsCommandPrefixes(next)
    await window.api?.settings?.set('ttsCommandPrefixes', next)
  }

  const toggleAudiencePermission = async (permission: TTSAudiencePermission) => {
    const nextRoles =
      permission === 'everyone'
        ? ['everyone' as TTSAudiencePermission]
        : ttsAllowedRoles.includes(permission)
          ? ttsAllowedRoles.filter((role) => role !== permission && role !== 'everyone')
          : [...ttsAllowedRoles.filter((role) => role !== 'everyone'), permission]
    const safeRoles = nextRoles.length > 0 ? nextRoles : ['everyone' as TTSAudiencePermission]

    setTtsAllowedRoles(safeRoles)
    await window.api?.settings?.set('ttsAllowedRoles', safeRoles)
  }

  const updateVoiceModifiers = async (updates: Partial<AppSettings['voiceModifiers']>) => {
    const next = { ...voiceModifiers, ...updates }
    setVoiceModifiers(next)
    await window.api?.settings?.set('voiceModifiers', next)
  }

  return {
    enabled,
    settings,
    profiles,
    availableVoices,
    selectedProfileId,
    draft,
    previewText,
    ttsRequireCommand,
    ttsCommandPrefixes,
    ttsAllowedRoles,
    ttsIgnoreEmotes,
    ttsVolume,
    elevenlabsApiKey,
    syncedElevenLabsVoices,
    voiceModifiers,
    syncError,
    isSaving,
    isPreviewing,
    isSyncingVoices,
    missingVoiceProfiles: getMissingVoiceProfiles(profiles, availableVoices),
    
    // Actions
    setSelectedProfileId,
    setDraft,
    setPreviewText,
    handleToggle,
    createProfile,
    saveDraft,
    deleteDraft,
    previewVoice,
    stopPreview,
    syncVoices,
    updateSetting,
    setRequireCommandSetting,
    selectCommandPrefix,
    toggleAudiencePermission,
    updateVoiceModifiers
  }
}

