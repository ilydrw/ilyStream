import { IconTrash, IconPlus } from '../../../components/ui/icons'
import { Toggle } from '../../../components/ui/Inputs'
import { Select, type SelectOption } from '../../../components/ui/Select'
import type { ReactNode } from 'react'
import type { VoiceProfile } from '../../../../main/tts/voice-profiles'
import type { ViewerProfile } from '../../../../shared/stats'
import {
  DEFAULT_KOKORO_VOICE,
  ELEVENLABS_DEFAULT_VOICE_ID,
  ELEVENLABS_VOICES,
  KOKORO_VOICES,
  type SyncedElevenLabsVoicePreset,
  type TTSVoiceProvider
} from '../../../../shared/tts-providers'
import type { TTSUserVoiceOverride, TTSUserVoiceOverridePlatform } from '../../../../shared/app-settings'
import type { ResolvedElevenLabsApiKey } from '../../../../shared/elevenlabs-keys'
import { userVoicePlatformOptions } from '../constants'

interface UserVoiceOverridesPanelProps {
  overrides: TTSUserVoiceOverride[]
  profiles: VoiceProfile[]
  viewerProfiles?: ViewerProfile[]
  voiceOptions: SpeechSynthesisVoice[]
  elevenlabsApiKeys: ResolvedElevenLabsApiKey[]
  syncedElevenLabsVoices: SyncedElevenLabsVoicePreset[]
  onChange: (overrides: TTSUserVoiceOverride[]) => void
}

const providerOptions: SelectOption[] = [
  { value: 'system', label: 'System voices', group: 'Local' },
  { value: 'kokoro', label: 'Kokoro AI', group: 'Local' },
  { value: 'elevenlabs', label: 'ElevenLabs', group: 'Cloud' }
]

const modeOptions: SelectOption[] = [
  { value: 'profile', label: 'Profile' },
  { value: 'custom', label: 'Direct' }
]

export function UserVoiceOverridesPanel({
  overrides = [],
  profiles = [],
  viewerProfiles = [],
  voiceOptions = [],
  elevenlabsApiKeys = [],
  syncedElevenLabsVoices = [],
  onChange
}: UserVoiceOverridesPanelProps) {
  const profileOptions: SelectOption[] = profiles.map((profile) => ({
    value: profile.id,
    label: profile.name,
    group: formatProvider(profile.provider)
  }))
  const viewerProfileOptions: SelectOption[] = [
    { value: '', label: 'Username', group: 'Rule scope' },
    ...viewerProfiles.map((profile) => ({
      value: profile.id,
      label: profile.displayName,
      group: (profile.accounts || []).length > 0
        ? profile.accounts.map((account) => `@${account.username}`).join(', ')
        : 'Linked viewer'
    }))
  ]

  const addOverride = () => {
    onChange([
      ...overrides,
      createUserVoiceOverride(profileOptions[0]?.value ?? '')
    ])
  }

  const updateOverride = (id: string, patch: Partial<TTSUserVoiceOverride>) => {
    onChange(overrides.map((override) => override.id === id ? normalizeOverridePatch(override, patch) : override))
  }

  const deleteOverride = (id: string) => {
    onChange(overrides.filter((override) => override.id !== id))
  }

  return (
    <section className="app-section-card glass overflow-visible tts-user-rules-panel">
      <div className="app-section-head">
        <div>
          <h2>User Voice Rules</h2>
          <p>Assign specific voices to specific chatters.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-1 font-mono text-[10px] font-semibold text-white/35">
            {overrides.length} rules
          </span>
          <button onClick={addOverride} className="app-button !h-9 !px-3 text-xs font-semibold">
            <IconPlus size={14} />
            Add
          </button>
        </div>
      </div>

      <div className="app-section-content !p-0">
        {overrides.length === 0 ? (
          <div className="m-4 rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center">
            <p className="text-sm font-semibold text-white/65">No user-specific voices yet.</p>
            <p className="mt-1 text-xs text-white/35">Add a row for VIPs, friends, or recurring characters.</p>
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="tts-user-rules-head border-b border-white/[0.05] bg-black/15 px-5 py-1.5 text-[9px] font-semibold text-white/30">
              <span>Scope</span>
              <span>User</span>
              <span>Platform</span>
              <span>Mode</span>
              <span>Voice</span>
              <span className="text-center">Active</span>
              <span />
            </div>
            <div className="flex flex-col gap-2 bg-black/10 p-2">
              {overrides.map((override) => (
                <UserVoiceOverrideRow
                  key={override.id}
                  override={override}
                  profileOptions={profileOptions}
                  viewerProfileOptions={viewerProfileOptions}
                  voiceOptions={voiceOptions}
                  elevenlabsApiKeys={elevenlabsApiKeys}
                  syncedElevenLabsVoices={syncedElevenLabsVoices}
                  onUpdate={(patch) => updateOverride(override.id, patch)}
                  onDelete={() => deleteOverride(override.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function UserVoiceOverrideRow({
  override,
  profileOptions,
  viewerProfileOptions,
  voiceOptions,
  elevenlabsApiKeys,
  syncedElevenLabsVoices,
  onUpdate,
  onDelete
}: {
  override: TTSUserVoiceOverride
  profileOptions: SelectOption[]
  viewerProfileOptions: SelectOption[]
  voiceOptions: SpeechSynthesisVoice[]
  elevenlabsApiKeys: ResolvedElevenLabsApiKey[]
  syncedElevenLabsVoices: SyncedElevenLabsVoicePreset[]
  onUpdate: (patch: Partial<TTSUserVoiceOverride>) => void
  onDelete: () => void
}) {
  const provider = override.provider || 'system'
  const mode = override.mode || 'profile'
  const selectedElevenLabsKeyId = override.elevenlabsApiKeyId || elevenlabsApiKeys.find((key) => key.isDefault)?.id || elevenlabsApiKeys[0]?.id || ''
  const elevenlabsKeyOptions: SelectOption[] = elevenlabsApiKeys.map((key) => ({
    value: key.id,
    label: key.label,
    group: key.isDefault ? 'Default workspace' : 'Workspace'
  }))
  const systemVoiceOptions = voiceOptions.map((voice) => ({
    value: voice.name,
    label: voice.name,
    group: `System · ${voice.lang || 'Unknown'}`
  }))
  const kokoroVoiceOptions = KOKORO_VOICES.map((voice) => ({
    value: voice.id,
    label: voice.name,
    group: `Kokoro · ${voice.gender}`
  }))
  const elevenlabsOptions = buildElevenLabsOptions(override.elevenlabsVoiceId, syncedElevenLabsVoices, selectedElevenLabsKeyId)
  const isIdentityScoped = Boolean(override.viewerProfileId)

  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.045] bg-white/[0.02] shadow-sm">
      <div className="tts-user-rule-main gap-2 px-3 py-2">
        <Select
          value={override.viewerProfileId || ''}
          options={viewerProfileOptions}
          onChange={(value) => onUpdate({ viewerProfileId: value || '', platform: value ? 'all' : override.platform })}
          buttonClassName="!h-8 !px-3 !text-xs"
          maxListHeight={260}
          searchable
        />

        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-7 shrink-0 items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.025] text-xs font-semibold text-white/35">
            @
          </span>
          <input
            value={override.username}
            onChange={(event) => onUpdate({ username: event.currentTarget.value })}
            className="app-input !h-8 !min-w-0 !px-3 !text-xs"
            placeholder={isIdentityScoped ? 'optional alias' : 'username'}
          />
        </div>

        <Select
          value={override.platform}
          options={userVoicePlatformOptions}
          onChange={(value) => onUpdate({ platform: value as TTSUserVoiceOverridePlatform })}
          buttonClassName="!h-8 !px-3 !text-xs"
          disabled={isIdentityScoped}
        />

        <Select
          value={mode}
          options={modeOptions}
          onChange={(value) => onUpdate({ mode: value as TTSUserVoiceOverride['mode'] })}
          buttonClassName="!h-8 !px-3 !text-xs"
        />

        {mode === 'profile' ? (
          <Select
            value={override.voiceProfileId}
            options={profileOptions}
            placeholder="Choose profile..."
            onChange={(value) => onUpdate({ voiceProfileId: value })}
            buttonClassName="!h-8 !px-3 !text-xs"
            searchable
          />
        ) : (
          <Select
            value={provider}
            options={providerOptions}
            onChange={(value) => onUpdate({ provider: value as TTSVoiceProvider })}
            buttonClassName="!h-8 !px-3 !text-xs"
          />
        )}

        <div className="tts-user-rule-active flex items-center justify-between gap-2">
          <span className="tts-user-rule-active-label text-xs font-semibold text-white/35">Active</span>
          <Toggle value={override.enabled} onChange={(enabled) => onUpdate({ enabled })} />
        </div>

        <button
          type="button"
          onClick={onDelete}
          className="app-button !h-8 !w-8 !p-0 hover:!border-danger/30 hover:!text-danger"
          title="Delete user voice"
        >
          <IconTrash size={14} />
        </button>
      </div>

      {mode === 'custom' && (
        <div className="border-t border-white/[0.035] bg-black/10 px-3 py-2">
          <div className={provider === 'elevenlabs'
            ? 'tts-user-rule-custom tts-user-rule-custom--elevenlabs gap-2'
            : 'tts-user-rule-custom tts-user-rule-custom--local gap-2'
          }>
            {provider === 'system' && (
              <LabeledControl label="System Voice">
                <Select
                  value={override.voiceName}
                  options={systemVoiceOptions}
                  placeholder="Choose voice..."
                  onChange={(value) => onUpdate({ voiceName: value })}
                  buttonClassName="!h-8 !px-3 !text-xs"
                  maxListHeight={260}
                  searchable
                />
              </LabeledControl>
            )}

            {provider === 'kokoro' && (
              <LabeledControl label="Kokoro Voice">
                <Select
                  value={override.kokoroVoice || DEFAULT_KOKORO_VOICE}
                  options={kokoroVoiceOptions}
                  onChange={(value) => onUpdate({ kokoroVoice: value })}
                  buttonClassName="!h-8 !px-3 !text-xs"
                  maxListHeight={260}
                  searchable
                />
              </LabeledControl>
            )}

            {provider === 'elevenlabs' && (
              <>
                <LabeledControl label="Workspace">
                  <Select
                    value={selectedElevenLabsKeyId}
                    options={elevenlabsKeyOptions}
                    placeholder="Choose workspace..."
                    onChange={(value) => onUpdate({ elevenlabsApiKeyId: value })}
                    buttonClassName="!h-8 !px-3 !text-xs"
                    maxListHeight={240}
                  />
                </LabeledControl>
                <LabeledControl label="Voice">
                  <Select
                    value={override.elevenlabsVoiceId || ELEVENLABS_DEFAULT_VOICE_ID}
                    options={elevenlabsOptions}
                    onChange={(value) => {
                      const voice = syncedElevenLabsVoices.find((item) => item.id === value && (!selectedElevenLabsKeyId || item.apiKeyId === selectedElevenLabsKeyId))
                      onUpdate({ elevenlabsVoiceId: value, elevenlabsApiKeyId: voice?.apiKeyId || selectedElevenLabsKeyId })
                    }}
                    buttonClassName="!h-8 !px-3 !text-xs"
                    maxListHeight={260}
                    searchable
                  />
                </LabeledControl>
                <LabeledControl label="Manual ID">
                  <input
                    value={override.elevenlabsVoiceId || ''}
                    onChange={(event) => onUpdate({ elevenlabsVoiceId: event.currentTarget.value.trim(), elevenlabsApiKeyId: selectedElevenLabsKeyId })}
                    className="app-input !h-8 !px-3 !font-mono !text-xs"
                    placeholder="Voice ID"
                  />
                </LabeledControl>
              </>
            )}
            {provider === 'elevenlabs' && (
              <>
                <NumberMiniField
                  label="Stable"
                  value={override.elevenlabsStability}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(value) => onUpdate({ elevenlabsStability: value })}
                />
                <NumberMiniField
                  label="Similar"
                  value={override.elevenlabsSimilarity}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(value) => onUpdate({ elevenlabsSimilarity: value })}
                />
                <NumberMiniField
                  label="Style"
                  value={override.elevenlabsStyle}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(value) => onUpdate({ elevenlabsStyle: value })}
                />
              </>
            )}
            <NumberMiniField
              label="Pitch"
              value={override.pitch}
              min={0.1}
              max={2}
              step={0.05}
              onChange={(value) => onUpdate({ pitch: value })}
            />
            <NumberMiniField
              label="Rate"
              value={override.rate}
              min={0.1}
              max={2}
              step={0.05}
              onChange={(value) => onUpdate({ rate: value })}
            />
            <NumberMiniField
              label="Vol"
              value={override.volume}
              min={0}
              max={1}
              step={0.05}
              onChange={(value) => onUpdate({ volume: value })}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function LabeledControl({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[9px] font-semibold text-white/28">{label}</span>
      {children}
    </label>
  )
}

function NumberMiniField({
  label,
  value,
  min,
  max,
  step,
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <label className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[9px] font-semibold text-white/28">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = Number(event.currentTarget.value)
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)))
        }}
        className="app-input !h-8 !min-w-0 !px-2 !text-xs"
      />
    </label>
  )
}

function buildElevenLabsOptions(
  selectedVoiceId: string,
  syncedElevenLabsVoices: SyncedElevenLabsVoicePreset[],
  elevenlabsApiKeyId: string
): SelectOption[] {
  const scopedVoices = elevenlabsApiKeyId
    ? syncedElevenLabsVoices.filter((voice) => voice.apiKeyId === elevenlabsApiKeyId)
    : syncedElevenLabsVoices
  const usingSyncedVoices = scopedVoices.length > 0
  const voices: SyncedElevenLabsVoicePreset[] = usingSyncedVoices ? scopedVoices : ELEVENLABS_VOICES
  const groupPrefix = usingSyncedVoices ? 'Synced ElevenLabs' : 'Curated ElevenLabs'
  const options: SelectOption[] = voices.map((voice) => ({
    value: voice.id,
    label: `${voice.name} · ${voice.accent}`,
    group: `${voice.apiKeyLabel || groupPrefix} · ${voice.gender}`
  }))

  if (selectedVoiceId && !options.some((option) => option.value === selectedVoiceId)) {
    options.unshift({
      value: selectedVoiceId,
      label: `Custom · ${selectedVoiceId}`,
      group: 'Manual voice ID'
    })
  }

  return options
}

function normalizeOverridePatch(
  current: TTSUserVoiceOverride,
  patch: Partial<TTSUserVoiceOverride>
): TTSUserVoiceOverride {
  const next = { ...current, ...patch }

  if (patch.viewerProfileId !== undefined && patch.viewerProfileId) {
    next.platform = 'all'
  }

  if (patch.mode === 'custom') {
    next.voiceProfileId = ''
  }
  if (patch.mode === 'profile') {
    next.provider = current.provider || 'system'
  }
  if (patch.provider === 'elevenlabs' && !next.elevenlabsVoiceId) {
    next.elevenlabsVoiceId = ELEVENLABS_DEFAULT_VOICE_ID
  }
  if (patch.provider === 'elevenlabs' && !next.elevenlabsApiKeyId) {
    next.elevenlabsApiKeyId = current.elevenlabsApiKeyId || ''
  }
  if (patch.provider === 'kokoro' && !next.kokoroVoice) {
    next.kokoroVoice = DEFAULT_KOKORO_VOICE
  }

  return next
}

function createUserVoiceOverride(profileId: string): TTSUserVoiceOverride {
  return {
    id: crypto.randomUUID(),
    platform: 'all',
    username: '',
    viewerProfileId: '',
    mode: 'profile',
    voiceProfileId: profileId,
    provider: 'system',
    voiceName: '',
    kokoroVoice: DEFAULT_KOKORO_VOICE,
    elevenlabsVoiceId: '',
    elevenlabsApiKeyId: '',
    elevenlabsStability: 0.5,
    elevenlabsSimilarity: 0.8,
    elevenlabsStyle: 0,
    lang: 'en-US',
    pitch: 1,
    rate: 1,
    volume: 1,
    enabled: true
  }
}

function formatProvider(provider?: string): string {
  if (provider === 'elevenlabs') return 'ElevenLabs'
  if (provider === 'kokoro') return 'Kokoro'
  return 'System'
}
