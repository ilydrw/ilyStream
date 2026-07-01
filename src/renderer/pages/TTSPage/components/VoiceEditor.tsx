import { IconVolume } from '@tabler/icons-react'
import { IconDeviceFloppy, IconTrash, IconPlayerPlay, IconX, IconPlus } from '../../../components/ui/icons'
import { VoiceProfile } from '../../../../main/tts/voice-profiles'
import { Select, SelectOption } from '../../../components/ui/Select'
import {
  KOKORO_VOICES,
  ELEVENLABS_VOICES,
  DEFAULT_KOKORO_VOICE,
  ELEVENLABS_DEFAULT_VOICE_ID,
  type SyncedElevenLabsVoicePreset,
  type TTSVoiceProvider
} from '../../../../shared/tts-providers'
import type { ResolvedElevenLabsApiKey } from '../../../../shared/elevenlabs-keys'

interface VoiceEditorProps {
  draft: VoiceProfile | null
  isSaving: boolean
  isPreviewing: boolean
  isSyncingVoices: boolean
  syncError: string | null
  elevenlabsApiKeys: ResolvedElevenLabsApiKey[]
  syncedElevenLabsVoices: SyncedElevenLabsVoicePreset[]
  previewText: string
  voiceOptions: SpeechSynthesisVoice[]
  onUpdateDraft: (updates: Partial<VoiceProfile>) => void
  onProviderChange: (provider: any) => void
  onSave: () => void
  onDelete: () => void
  onPreview: () => void
  onStopPreview: () => void
  onSyncVoices: (keyId?: string) => void
  onPreviewTextChange: (text: string) => void
}

const providerCatalog: Array<{
  id: TTSVoiceProvider
  label: string
  hint: string
}> = [
  { id: 'system', label: 'System', hint: 'Windows voices' },
  { id: 'kokoro', label: 'Kokoro', hint: 'Local AI' },
  { id: 'elevenlabs', label: 'ElevenLabs', hint: 'Cloud voices' }
]

export function VoiceEditor({
  draft,
  isSaving,
  isPreviewing,
  isSyncingVoices,
  syncError,
  elevenlabsApiKeys,
  syncedElevenLabsVoices,
  previewText,
  voiceOptions,
  onUpdateDraft,
  onProviderChange,
  onSave,
  onDelete,
  onPreview,
  onStopPreview,
  onSyncVoices,
  onPreviewTextChange
}: VoiceEditorProps) {
  if (!draft) {
    return (
      <div className="app-section-card glass flex flex-col items-center justify-center py-40 text-center opacity-40">
        <IconVolume size={48} className="mb-6 text-white/10" />
        <h3 className="text-sm font-semibold tracking-tight">Select Persona</h3>
        <p className="text-xs mt-2">Initialize a voice profile to begin configuration.</p>
      </div>
    )
  }

  const provider = draft.provider ?? 'system'
  const selectedElevenLabsKeyId = draft.elevenlabsApiKeyId || elevenlabsApiKeys.find((key) => key.isDefault)?.id || elevenlabsApiKeys[0]?.id || ''
  const selectedValue =
    provider === 'kokoro'
      ? (draft.kokoroVoice ?? DEFAULT_KOKORO_VOICE)
      : provider === 'elevenlabs'
        ? (draft.elevenlabsVoiceId || ELEVENLABS_DEFAULT_VOICE_ID)
        : draft.voiceName

  const voiceSelectOptions = buildVoiceSelectOptions(
    provider,
    selectedValue,
    voiceOptions,
    syncedElevenLabsVoices,
    selectedElevenLabsKeyId
  )
  const selectedSyncedVoiceCount = selectedElevenLabsKeyId
    ? syncedElevenLabsVoices.filter((voice) => voice.apiKeyId === selectedElevenLabsKeyId).length
    : syncedElevenLabsVoices.length
  const elevenlabsKeyOptions: SelectOption[] = elevenlabsApiKeys.map((key) => ({
    value: key.id,
    label: key.label,
    group: key.isDefault ? 'Default workspace' : 'Workspace'
  }))
  const selectedProvider = providerCatalog.find((item) => item.id === provider) ?? providerCatalog[0]

  return (
    <section className="tts-voice-editor app-section-card glass overflow-visible">
      <div className="tts-voice-editor-head app-section-head">
        <div className="flex items-center gap-4">
          <div className="tts-voice-editor-icon flex items-center justify-center text-accent">
            <IconVolume size={28} />
          </div>
          <div>
            <h2>{draft.name}</h2>
            <p>Persona Configuration</p>
          </div>
        </div>
        <div className="tts-voice-editor-actions flex items-center gap-3">
          <button 
            onClick={onSave} 
            disabled={isSaving}
            className="app-button !h-10 !px-4 text-xs font-semibold tracking-tight"
          >
            <IconDeviceFloppy size={15} className="mr-2 opacity-50" />
            {isSaving ? 'Syncing...' : 'Save Profile'}
          </button>
          {draft.id !== 'default' && (
            <button
              onClick={onDelete}
              title="Delete profile"
              className="p-3 text-white/50 hover:text-danger hover:bg-danger/10 rounded-xl transition-all"
            >
              <IconTrash size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="tts-voice-editor-content app-section-content">
        <div className="tts-voice-editor-grid grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* Core Synthesis Params */}
          <div className="tts-voice-editor-stack">
            <div className="space-y-3">
              <label className="text-xs font-semibold tracking-tight text-white/40">Profile Identifier</label>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => onUpdateDraft({ name: e.target.value })}
                className="tts-profile-id-input app-input !h-11 !px-4 !text-sm font-semibold"
                placeholder="Enter profile name..."
              />
            </div>

            <div className="space-y-3">
              <label className="text-xs font-semibold tracking-tight text-white/40">Voice Provider</label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {providerCatalog.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onProviderChange(item.id)}
                    className={`tts-provider-tile min-h-14 rounded-md border px-3 py-2 text-left transition-all ${ provider === item.id ? 'border-accent/35 bg-accent/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]' : 'border-white/5 bg-white/[0.018] text-white/45 hover:border-white/12 hover:bg-white/[0.035] hover:text-white/75' }`}
                  >
                    <span className="block text-xs font-semibold">{item.label}</span>
                    <span className="mt-0.5 block text-[10px] font-medium text-white/35">{item.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-end justify-between gap-3">
                <label className="text-xs font-semibold tracking-tight text-white/40">Voice Catalog</label>
                <span className="text-[10px] font-semibold text-white/25">
                  {selectedProvider.label} · {voiceSelectOptions.length} voices
                </span>
              </div>
              <div className="space-y-3">
                <Select
                  value={selectedValue}
                  options={voiceSelectOptions}
                  placeholder="Choose a voice…"
                  buttonClassName="!h-12 !px-5"
                  maxListHeight={320}
                  searchable
                  onChange={(val) => {
                    if (provider === 'kokoro') onUpdateDraft({ kokoroVoice: val })
                    else if (provider === 'elevenlabs') {
                      const voice = syncedElevenLabsVoices.find((item) => item.id === val && (!selectedElevenLabsKeyId || item.apiKeyId === selectedElevenLabsKeyId))
                      onUpdateDraft({ elevenlabsVoiceId: val, elevenlabsApiKeyId: voice?.apiKeyId || selectedElevenLabsKeyId })
                    }
                    else onUpdateDraft({ voiceName: val })
                  }}
                />
                {provider === 'elevenlabs' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold tracking-tight text-white/40">Workspace Key</label>
                      <Select
                        value={selectedElevenLabsKeyId}
                        options={elevenlabsKeyOptions}
                        placeholder="Choose workspace key..."
                        onChange={(value) => onUpdateDraft({ elevenlabsApiKeyId: value })}
                        buttonClassName="!h-11 !px-4 !text-xs"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <p className={`text-[10px] font-semibold tracking-tight ${syncError ? 'text-danger' : 'text-white/20'}`}>
                          {syncError
                            ? `Sync Failed: ${syncError}`
                            : selectedSyncedVoiceCount > 0
                              ? `${selectedSyncedVoiceCount} voices synced from this workspace`
                              : 'Using curated built-in voices'}
                        </p>
                        <button
                          onClick={() => onSyncVoices(selectedElevenLabsKeyId || undefined)}
                          disabled={isSyncingVoices || elevenlabsApiKeys.length === 0}
                          className="text-[10px] font-semibold tracking-tight text-accent hover:text-accent/80 disabled:opacity-30 transition-all flex items-center gap-1.5"
                        >
                          {isSyncingVoices ? (
                            <>
                              <div className="w-2 h-2 rounded-full border border-accent/30 border-t-accent animate-spin" />
                              Syncing...
                            </>
                          ) : (
                            <>
                              <IconPlus size={10} />
                              Sync account voices
                            </>
                          )}
                        </button>
                      </div>
                      {syncError && (
                        <p className="text-[10px] text-white/30 italic">
                          Check the workspace key in Voice Engine or verify connection.
                        </p>
                      )}
                    </div>
                    
                    <div className="pt-4 border-t border-white/5 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold tracking-tight text-white/40">Manual Voice ID</label>
                        <span className="text-[10px] font-medium text-white/20 italic">Overwrites selection above</span>
                      </div>
                      <input
                        type="text"
                        value={draft.elevenlabsVoiceId ?? ELEVENLABS_DEFAULT_VOICE_ID}
                        onChange={(e) => onUpdateDraft({ elevenlabsVoiceId: e.target.value.trim(), elevenlabsApiKeyId: selectedElevenLabsKeyId })}
                        className="app-input !h-11 !px-4 !text-xs font-mono bg-white/[0.01]"
                        placeholder="Paste ElevenLabs Voice ID here..."
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Performance & Tuning */}
          <div className="tts-voice-editor-stack">
            <div className="tts-tuning-panel space-y-6">
              <label className="text-xs font-semibold tracking-tight text-white/40">Acoustic Tuning</label>
              <div className="space-y-8">
                <div className="space-y-3">
                  <div className="flex justify-between text-xs font-semibold tracking-tight text-white/60">
                    <span>Playback Rate</span>
                    <span className="text-accent">{draft.rate}x</span>
                  </div>
                  <input 
                    type="range" min="0.5" max="2" step="0.1" 
                    value={draft.rate} 
                    onChange={(e) => onUpdateDraft({ rate: parseFloat(e.target.value) })}
                    className="w-full accent-accent bg-white/5 h-1.5 rounded-full appearance-none cursor-pointer"
                  />
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between text-xs font-semibold tracking-tight text-white/60">
                    <span>Output Volume</span>
                    <span className="text-accent">{Math.round(draft.volume * 100)}%</span>
                  </div>
                  <input 
                    type="range" min="0" max="1" step="0.05" 
                    value={draft.volume} 
                    onChange={(e) => onUpdateDraft({ volume: parseFloat(e.target.value) })}
                    className="w-full accent-accent bg-white/5 h-1.5 rounded-full appearance-none cursor-pointer"
                  />
                </div>
              </div>
            </div>

            <div className="tts-preview-inline p-5 rounded-md bg-white/[0.02] border border-white/5 space-y-3 group hover:border-white/10 transition-all">
              <label className="text-[10px] font-medium tracking-normal text-white/20">Synthesis Test</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={previewText}
                  onChange={(e) => onPreviewTextChange(e.target.value)}
                  className="app-input !h-10 !px-4 !bg-transparent border-white/5 flex-1"
                  placeholder="Test synthesis string..."
                />
                <button 
                  onClick={isPreviewing ? onStopPreview : onPreview}
                  className={`app-button !h-10 !w-10 !p-0 ${isPreviewing ? '!text-danger' : 'text-accent'}`}
                >
                  {isPreviewing ? <IconX size={18} /> : <IconPlayerPlay size={18} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function buildVoiceSelectOptions(
  provider: string,
  selectedValue: string,
  voiceOptions: SpeechSynthesisVoice[],
  syncedElevenLabsVoices: SyncedElevenLabsVoicePreset[],
  elevenlabsApiKeyId: string
): SelectOption[] {
  if (provider === 'kokoro') {
    return KOKORO_VOICES.map((voice) => ({
      value: voice.id,
      label: voice.name,
      group: `Kokoro · ${voice.gender}`
    }))
  }

  if (provider === 'elevenlabs') {
    const scopedVoices = elevenlabsApiKeyId
      ? syncedElevenLabsVoices.filter((voice) => voice.apiKeyId === elevenlabsApiKeyId)
      : syncedElevenLabsVoices
    const usingSyncedVoices = scopedVoices.length > 0
    const voices = usingSyncedVoices ? scopedVoices : ELEVENLABS_VOICES
    const groupPrefix = usingSyncedVoices ? 'Synced ElevenLabs' : 'Curated ElevenLabs'
    const options: SelectOption[] = voices.map((voice) => ({
      value: voice.id,
      label: `${voice.name} · ${voice.accent}`,
      group: `${voice.apiKeyLabel || groupPrefix} · ${voice.gender}`
    }))

    if (selectedValue && !options.some((option) => option.value === selectedValue)) {
      options.unshift({
        value: selectedValue,
        label: `Custom · ${selectedValue}`,
        group: 'Manual voice ID'
      })
    }

    return options
  }

  return voiceOptions.map((voice) => ({
    value: voice.name,
    label: voice.name,
    group: `System · ${voice.lang || 'Unknown'}`
  }))
}
