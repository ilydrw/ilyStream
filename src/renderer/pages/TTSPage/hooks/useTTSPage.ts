import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react'
import type { VoiceProfile } from '../../../../main/tts/voice-profiles'
import type { ViewerProfile } from '../../../../shared/stats'
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_TTS_COMMAND_PREFIXES,
  resolveAppSettings,
  type AppSettings,
  type TTSAudiencePermission
} from '../../../../shared/app-settings'
import {
  DEFAULT_KOKORO_VOICE,
  type SyncedElevenLabsVoicePreset
} from '../../../../shared/tts-providers'
import { resolveElevenLabsApiKeys, type ResolvedElevenLabsApiKey } from '../../../../shared/elevenlabs-keys'
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

const SELECTED_PROFILE_STORAGE_KEY = 'ilystream:tts:selectedProfileId'

function getPersistedSelectedProfileId(): string {
  try {
    return window.localStorage.getItem(SELECTED_PROFILE_STORAGE_KEY) || 'default'
  } catch {
    return 'default'
  }
}

export function useTTSPage() {
  const { enabled, setEnabled } = useTTSStore()
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS)
  const [profiles, setProfiles] = useState<VoiceProfile[]>([])
  const [viewerProfiles, setViewerProfiles] = useState<ViewerProfile[]>([])
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([])
  const [selectedProfileId, setSelectedProfileIdState] = useState<string>(getPersistedSelectedProfileId)
  const [draft, setDraft] = useState<VoiceProfile | null>(null)
  const [previewText, setPreviewText] = useState(previewFallbackText)
  const [ttsRequireCommand, setTtsRequireCommand] = useState(false)
  const [ttsCommandPrefixes, setTtsCommandPrefixes] = useState<string[]>(DEFAULT_TTS_COMMAND_PREFIXES)
  const [ttsAllowedRoles, setTtsAllowedRoles] = useState<TTSAudiencePermission[]>(['everyone'])
  const [ttsIgnoreEmotes, setTtsIgnoreEmotes] = useState(true)
  const [ttsVolume, setTtsVolume] = useState(0.8)
  const [elevenlabsApiKey, setElevenlabsApiKey] = useState('')
  const [elevenlabsApiKeys, setElevenlabsApiKeys] = useState<ResolvedElevenLabsApiKey[]>([])
  const [syncedElevenLabsVoices, setSyncedElevenLabsVoices] = useState<SyncedElevenLabsVoicePreset[]>([])
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
  const hasAutoSyncedElevenLabsRef = useRef(false)

  const setSelectedProfileId = useCallback((next: SetStateAction<string>) => {
    setSelectedProfileIdState((current) => {
      const resolved = typeof next === 'function'
        ? (next as (value: string) => string)(current)
        : next
      try {
        window.localStorage.setItem(SELECTED_PROFILE_STORAGE_KEY, resolved)
      } catch {
        // Selection persistence is a UI convenience; ignore storage failures.
      }
      return resolved
    })
  }, [])

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
    const nextElevenLabsKeys = resolveElevenLabsApiKeys(settings)
    const nextElevenLabsSignature = JSON.stringify(nextElevenLabsKeys.map((key) => [key.id, key.label, key.apiKey, key.isDefault]))
    if (nextElevenLabsSignature !== elevenlabsApiKeyRef.current) {
      elevenlabsApiKeyRef.current = nextElevenLabsSignature
      setElevenlabsApiKey(settings.elevenlabsApiKey)
      setElevenlabsApiKeys(nextElevenLabsKeys)
      if (nextElevenLabsKeys.length > 0 && !hasAutoSyncedElevenLabsRef.current) {
        hasAutoSyncedElevenLabsRef.current = true
        setSyncError(null)
        void syncVoices(undefined, settings)
      } else if (nextElevenLabsKeys.length === 0) {
        hasAutoSyncedElevenLabsRef.current = false
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

  useEffect(() => {
    if (!window.api?.stats?.getViewerProfiles) return
    let active = true

    const loadViewerProfiles = async () => {
      try {
        const nextProfiles = await window.api.stats.getViewerProfiles({ limit: 500 })
        if (active) setViewerProfiles(Array.isArray(nextProfiles) ? nextProfiles as ViewerProfile[] : [])
      } catch (err) {
        console.warn('[tts] Viewer profiles failed to load:', err)
        if (active) setViewerProfiles([])
      }
    }

    void loadViewerProfiles()
    const interval = setInterval(loadViewerProfiles, 15_000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0] ?? null
    setDraft((current) => {
      if (!selectedProfile) return null
      if (current?.id === selectedProfile.id) return current
      return cloneProfile(selectedProfile)
    })
  }, [profiles, selectedProfileId])

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
  const syncVoices = async (keyId?: string, settingsSnapshot: AppSettings = settings) => {
    const keys = resolveElevenLabsApiKeys(settingsSnapshot)
    const targets = keyId ? keys.filter((key) => key.id === keyId) : keys
    if (targets.length === 0) {
      setSyncError('API key not configured')
      return
    }

    setIsSyncingVoices(true)
    setSyncError(null)
    try {
      const results = await Promise.allSettled(
        targets.map(async (key) => ({
          key,
          voices: await fetchElevenLabsVoices(key.apiKey)
        }))
      )
      const voices = results.flatMap((result) => {
        if (result.status !== 'fulfilled') return []
        return result.value.voices.map((voice) => ({
          ...voice,
          apiKeyId: result.value.key.id,
          apiKeyLabel: result.value.key.label
        }))
      })
      const failed = results.filter((result) => result.status === 'rejected')

      if (voices.length > 0) {
        setSyncedElevenLabsVoices((current) => {
          const keep = keyId ? current.filter((voice) => voice.apiKeyId !== keyId) : []
          return [...keep, ...voices]
        })
        toast.success(`Synced ${voices.length} neural voices`)
        if (failed.length > 0) {
          setSyncError(`${failed.length} workspace key${failed.length === 1 ? '' : 's'} failed`)
        }
      } else {
        const firstError = results.find((result) => result.status === 'rejected') as PromiseRejectedResult | undefined
        setSyncError(firstError?.reason?.message || 'No voices found in configured workspaces')
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

  const syncLocalTtsSettingState = (key: string, value: unknown) => {
    const resolved = resolveAppSettings({ [key]: value })

    if (key === 'ttsRequireCommand') setTtsRequireCommand(resolved.tts.requireCommand)
    if (key === 'ttsCommandPrefixes') setTtsCommandPrefixes(resolved.tts.commandPrefixes)
    if (key === 'ttsAllowedRoles') setTtsAllowedRoles(resolved.tts.allowedRoles)
    if (key === 'ttsIgnoreEmotes') setTtsIgnoreEmotes(resolved.tts.ignoreEmotes)
    if (key === 'ttsVolume') setTtsVolume(resolved.tts.volume)
    if (key === 'voiceModifiers') setVoiceModifiers(resolved.tts.modifiers)
    if (key === 'elevenlabsApiKey') {
      const nextKey = typeof value === 'string' ? value : ''
      setElevenlabsApiKey(nextKey)
    }
    if (key === 'elevenlabsApiKeys' || key === 'elevenlabsDefaultApiKeyId') {
      setElevenlabsApiKeys(resolveElevenLabsApiKeys(resolveAppSettings({ ...settings, [key]: value })))
    }
  }

  const updateSetting = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const keyName = String(key)
    syncLocalTtsSettingState(keyName, value)
    setSettings((current) => resolveAppSettings({ ...current, [key]: value }))

    if (key === 'ttsEnabled') {
      setEnabled(Boolean(value))
      await window.api?.tts?.setEnabled(Boolean(value))
      return
    }

    await window.api?.settings?.set(keyName, value)
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
    if (!confirmElevenLabsSpend(profile, text, settings)) return
    await speakProfile('preview', profile, text, setIsPreviewing, utteranceRef, settings)
  }

  const stopPreview = () => stopAllSpeech(setIsPreviewing)

  const setRequireCommandSetting = async (value: boolean) => {
    await updateSetting('ttsRequireCommand', value)
    toast.info(value ? 'Commands Required' : 'Open Speech Enabled')
  }

  const selectCommandPrefix = async (prefix: string) => {
    if (ttsCommandPrefixes.length === 1 && ttsCommandPrefixes[0] === prefix) return
    const next = [prefix]
    await updateSetting('ttsCommandPrefixes', next)
  }

  const toggleAudiencePermission = async (permission: TTSAudiencePermission) => {
    const nextRoles =
      permission === 'everyone'
        ? ['everyone' as TTSAudiencePermission]
        : ttsAllowedRoles.includes(permission)
          ? ttsAllowedRoles.filter((role) => role !== permission && role !== 'everyone')
          : [...ttsAllowedRoles.filter((role) => role !== 'everyone'), permission]
    const safeRoles = nextRoles.length > 0 ? nextRoles : ['everyone' as TTSAudiencePermission]

    await updateSetting('ttsAllowedRoles', safeRoles)
  }

  const updateVoiceModifiers = async (updates: Partial<AppSettings['voiceModifiers']>) => {
    const next = { ...voiceModifiers, ...updates }
    await updateSetting('voiceModifiers', next)
  }

  return {
    enabled,
    settings,
    profiles,
    viewerProfiles,
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
    elevenlabsApiKeys,
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

