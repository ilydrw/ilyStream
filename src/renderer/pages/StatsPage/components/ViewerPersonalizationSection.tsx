import { useEffect, useMemo, useState } from 'react'
import { IconMusic, IconPlayerPlay, IconPlus, IconUpload, IconVolume } from '@tabler/icons-react'
import { Select, type SelectOption } from '../../../components/ui/Select'
import type { VoiceProfile } from '../../../../main/tts/voice-profiles'
import {
  resolveAppSettings,
  type TTSUserVoiceOverride,
  type ViewerJoinSound
} from '../../../../shared/app-settings'
import { resolveElevenLabsApiKeys, type ResolvedElevenLabsApiKey } from '../../../../shared/elevenlabs-keys'
import type { SyncedElevenLabsVoicePreset } from '../../../../shared/tts-providers'
import { fetchElevenLabsVoices } from '../../../lib/elevenlabs-speech'
import {
  UserVoiceOverrideRow,
  createUserVoiceOverride,
  formatVoiceRuleProvider,
  normalizeOverridePatch
} from '../../../components/tts/UserVoiceRuleRow'

interface SoundFileEntry {
  id: string
  name: string
  emoji?: string
}

interface ViewerPersonalizationSectionProps {
  /** Persisted viewer profile id, or null when the identity isn't linked yet. */
  profileId: string | null
  displayName: string
  /** Linked platform accounts, used to match username-scoped voice rules. */
  accounts: Array<{ platform: string; username: string }>
  /** Creates a persisted profile for unlinked identities; returns its id. */
  ensureProfileId: () => Promise<string | null>
  /** Called after saving against a freshly created profile so the page can re-route. */
  onProfileCreated: (profileId: string) => void
}

const COOLDOWN_OPTIONS: SelectOption[] = [
  { value: '0', label: 'Every join' },
  { value: '5', label: '5 min cooldown' },
  { value: '15', label: '15 min cooldown' },
  { value: '30', label: '30 min cooldown' },
  { value: '60', label: '1 hour cooldown' }
]

function normalizeUsername(value: string): string {
  return String(value || '').trim().toLowerCase().replace(/^@+/, '')
}

export function ViewerPersonalizationSection({
  profileId,
  displayName,
  accounts,
  ensureProfileId,
  onProfileCreated
}: ViewerPersonalizationSectionProps) {
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([])
  const [sounds, setSounds] = useState<SoundFileEntry[]>([])
  const [voiceOverrides, setVoiceOverrides] = useState<TTSUserVoiceOverride[]>([])
  const [joinSounds, setJoinSounds] = useState<ViewerJoinSound[]>([])
  const [systemVoices, setSystemVoices] = useState<SpeechSynthesisVoice[]>([])
  const [elevenlabsApiKeys, setElevenlabsApiKeys] = useState<ResolvedElevenLabsApiKey[]>([])
  const [syncedElevenLabsVoices, setSyncedElevenLabsVoices] = useState<SyncedElevenLabsVoicePreset[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true

    void window.api.voice.getAll().then((profiles: VoiceProfile[]) => {
      if (active) setVoiceProfiles(profiles || [])
    }).catch(() => {})

    void window.api.sound.getAll('join').then((files: SoundFileEntry[]) => {
      if (active) setSounds(files || [])
    }).catch(() => {})

    const applySettings = (raw: unknown) => {
      const resolved = resolveAppSettings((raw || {}) as Record<string, any>)
      setVoiceOverrides(resolved.ttsUserVoiceOverrides || [])
      setJoinSounds(resolved.viewerJoinSounds || [])
      setElevenlabsApiKeys(resolveElevenLabsApiKeys(resolved))
    }

    void window.api.settings.getAll().then((settings: unknown) => {
      if (active) applySettings(settings)
    }).catch(() => {})

    const unsubscribe = window.api.on('settings:changed', (settings: unknown) => {
      if (active && settings) applySettings(settings)
    })

    const refreshVoices = () => {
      if (!active) return
      setSystemVoices([...window.speechSynthesis.getVoices()].sort((left, right) =>
        `${left.lang}:${left.name}`.localeCompare(`${right.lang}:${right.name}`)
      ))
    }
    refreshVoices()
    window.speechSynthesis.addEventListener('voiceschanged', refreshVoices)

    return () => {
      active = false
      unsubscribe()
      window.speechSynthesis.removeEventListener('voiceschanged', refreshVoices)
    }
  }, [])

  // Same synced-voice list the TTS page shows, so the Voice dropdown matches.
  const elevenlabsKeySignature = useMemo(
    () => JSON.stringify(elevenlabsApiKeys.map((key) => [key.id, key.apiKey])),
    [elevenlabsApiKeys]
  )
  useEffect(() => {
    if (elevenlabsApiKeys.length === 0) {
      setSyncedElevenLabsVoices([])
      return
    }
    let active = true
    void Promise.allSettled(
      elevenlabsApiKeys.map(async (key) => ({ key, voices: await fetchElevenLabsVoices(key.apiKey) }))
    ).then((results) => {
      if (!active) return
      setSyncedElevenLabsVoices(results.flatMap((result) => {
        if (result.status !== 'fulfilled') return []
        return result.value.voices.map((voice) => ({
          ...voice,
          apiKeyId: result.value.key.id,
          apiKeyLabel: result.value.key.label
        }))
      }))
    })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elevenlabsKeySignature])

  // Every rule that speaks for this viewer: profile-scoped rules, plus legacy
  // username rules that match one of their linked accounts (e.g. "queena.chaos").
  const matchingRules = voiceOverrides.filter((rule) => {
    if (profileId && rule.viewerProfileId === profileId) return true
    if (rule.viewerProfileId) return false
    const ruleUsername = normalizeUsername(rule.username)
    if (!ruleUsername) return false
    return accounts.some((account) =>
      normalizeUsername(account.username) === ruleUsername &&
      (rule.platform === 'all' || rule.platform === account.platform)
    )
  })

  const joinSound = profileId
    ? joinSounds.find((rule) => rule.viewerProfileId === profileId) ?? null
    : null

  const withEnsuredProfile = async (apply: (id: string) => Promise<void>) => {
    setSaving(true)
    try {
      const ensuredId = await ensureProfileId()
      if (!ensuredId) return
      await apply(ensuredId)
      if (ensuredId !== profileId) onProfileCreated(ensuredId)
    } finally {
      setSaving(false)
    }
  }

  const saveVoiceOverrides = async (mutate: (current: TTSUserVoiceOverride[]) => TTSUserVoiceOverride[]) => {
    const current = await window.api.settings.get('ttsUserVoiceOverrides')
    const next = mutate(Array.isArray(current) ? current : [])
    setVoiceOverrides(next)
    await window.api.settings.set('ttsUserVoiceOverrides', next)
  }

  const saveJoinSounds = async (mutate: (current: ViewerJoinSound[]) => ViewerJoinSound[]) => {
    const current = await window.api.settings.get('viewerJoinSounds')
    const next = mutate(Array.isArray(current) ? current : [])
    setJoinSounds(next)
    await window.api.settings.set('viewerJoinSounds', next)
  }

  const addVoiceRule = () => {
    void withEnsuredProfile(async (id) => {
      await saveVoiceOverrides((current) => [
        ...current,
        { ...createUserVoiceOverride(voiceProfiles[0]?.id ?? ''), viewerProfileId: id }
      ])
    })
  }

  const updateVoiceRule = (ruleId: string, patch: Partial<TTSUserVoiceOverride>) => {
    void saveVoiceOverrides((current) =>
      current.map((rule) => rule.id === ruleId ? normalizeOverridePatch(rule, patch) : rule)
    )
  }

  const deleteVoiceRule = (ruleId: string) => {
    void saveVoiceOverrides((current) => current.filter((rule) => rule.id !== ruleId))
  }

  const setJoinSoundId = (soundId: string) => {
    void withEnsuredProfile(async (id) => {
      await saveJoinSounds((current) => {
        if (!soundId) return current.filter((rule) => rule.viewerProfileId !== id)
        const existing = current.find((rule) => rule.viewerProfileId === id)
        if (existing) {
          return current.map((rule) => rule.viewerProfileId === id ? { ...rule, soundId, enabled: true } : rule)
        }
        return [...current, {
          id: crypto.randomUUID(),
          viewerProfileId: id,
          platform: 'all' as const,
          username: '',
          soundId,
          volume: 1,
          cooldownMinutes: 15,
          enabled: true
        }]
      })
    })
  }

  const patchJoinSound = (patch: Partial<ViewerJoinSound>) => {
    if (!profileId || !joinSound) return
    void withEnsuredProfile(async (id) => {
      await saveJoinSounds((current) =>
        current.map((rule) => rule.viewerProfileId === id ? { ...rule, ...patch } : rule)
      )
    })
  }

  const uploadJoinSound = async () => {
    const path = await window.api.sound.pickFile()
    if (!path) return
    const uploaded = await window.api.sound.upload(path, undefined, 'join')
    if (!uploaded?.id) return
    setSounds((current) => current.some((sound) => sound.id === uploaded.id)
      ? current
      : [...current, uploaded])
    setJoinSoundId(uploaded.id)
  }

  const previewJoinSound = () => {
    if (!joinSound?.soundId) return
    void window.api.sound.play(joinSound.soundId, joinSound.volume)
  }

  const voiceProfileOptions: SelectOption[] = voiceProfiles.map((profile) => ({
    value: profile.id,
    label: profile.name,
    group: formatVoiceRuleProvider(profile.provider)
  }))

  const viewerProfileOptions: SelectOption[] = [
    { value: '', label: 'Username', group: 'Rule scope' },
    ...(profileId
      ? [{
          value: profileId,
          label: displayName,
          group: accounts.length > 0
            ? accounts.map((account) => `@${account.username}`).join(', ')
            : 'This viewer'
        }]
      : [])
  ]

  const soundOptions: SelectOption[] = [
    { value: '', label: 'No join sound', group: 'Join sound library' },
    ...sounds.map((sound) => ({
      value: sound.id,
      label: `${sound.emoji ? `${sound.emoji} ` : ''}${sound.name.replace(/\.(mp3|wav)$/i, '')}`,
      group: 'Join sound library'
    }))
  ]

  return (
    <>
      <h2 className="mb-4 text-[13px] font-semibold tracking-tight text-white/55">Personalization</h2>

      {/* Voice rules — the same User Voice Rules workflow as the TTS page,
          filtered to rules that apply to this viewer. */}
      <div className="tts-user-rules-panel rounded-xl border border-white/[0.07] bg-white/[0.02]">
        <div className="flex items-start justify-between gap-3 p-5 pb-4">
          <div>
            <div className="flex items-center gap-2 text-[14px] font-bold text-white">
              <IconVolume size={16} className="text-accent" />
              User voice rules
            </div>
            <p className="mt-1 text-[12px] font-medium text-white/40">
              Voices used when {displayName}&apos;s messages are read aloud. Shared with the TTS page.
            </p>
          </div>
          <button
            onClick={addVoiceRule}
            disabled={saving}
            className="app-button !h-9 !px-3 text-xs font-semibold disabled:opacity-40"
          >
            <IconPlus size={14} />
            Add rule
          </button>
        </div>

        {matchingRules.length === 0 ? (
          <div className="mx-5 mb-5 rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center">
            <p className="text-sm font-semibold text-white/65">No voice rules for {displayName} yet.</p>
            <p className="mt-1 text-xs text-white/35">Add one to give them their own voice in TTS.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 border-t border-white/[0.05] bg-black/10 p-2">
            {matchingRules.map((rule) => (
              <UserVoiceOverrideRow
                key={rule.id}
                override={rule}
                profileOptions={voiceProfileOptions}
                viewerProfileOptions={viewerProfileOptions}
                voiceOptions={systemVoices}
                elevenlabsApiKeys={elevenlabsApiKeys}
                syncedElevenLabsVoices={syncedElevenLabsVoices}
                onUpdate={(patch) => updateVoiceRule(rule.id, patch)}
                onDelete={() => deleteVoiceRule(rule.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Join sound — its own library, separate from soundboard and alerts. */}
      <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[14px] font-bold text-white">
              <IconMusic size={16} className="text-accent" />
              Join sound
            </div>
            <p className="mt-1 text-[12px] font-medium text-white/40">
              Plays when {displayName} joins the stream. Uses the join sound library.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void uploadJoinSound()}
            disabled={saving}
            className="app-button !h-9 !px-3 text-xs font-semibold disabled:opacity-40"
            title="Upload a new sound to the join library"
          >
            <IconUpload size={14} />
            Upload
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[220px] flex-1">
            <Select
              value={joinSound?.soundId || ''}
              options={soundOptions}
              onChange={setJoinSoundId}
              buttonClassName="!h-9 !px-3 !text-xs"
              maxListHeight={260}
              searchable
              disabled={saving}
            />
          </div>
          <button
            type="button"
            onClick={previewJoinSound}
            disabled={saving || !joinSound?.soundId}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-[12px] font-bold text-white/50 transition-colors hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            title="Preview this sound"
          >
            <IconPlayerPlay size={14} />
            Test
          </button>
        </div>

        {joinSound?.soundId && (
          <div className="mt-4 grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border border-white/[0.04] bg-black/20 px-3 py-2.5">
            <label className="flex min-w-0 items-center gap-2.5">
              <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-white/35">Vol</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={joinSound.volume}
                onChange={(event) => patchJoinSound({ volume: Number(event.currentTarget.value) })}
                className="w-full accent-[var(--accent,#19c8ff)]"
              />
              <span className="w-9 shrink-0 text-right text-[11px] font-bold tabular-nums text-white/55">
                {Math.round(joinSound.volume * 100)}%
              </span>
            </label>
            <Select
              value={String(joinSound.cooldownMinutes)}
              options={COOLDOWN_OPTIONS}
              onChange={(value) => patchJoinSound({ cooldownMinutes: Number(value) })}
              buttonClassName="!h-8 !px-3 !text-xs"
            />
          </div>
        )}
      </div>
    </>
  )
}
