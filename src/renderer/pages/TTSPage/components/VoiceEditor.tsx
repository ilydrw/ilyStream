import {IconDeviceFloppy, IconTrash, IconVolume, IconPlayerPlay, IconX, IconPlus} from '@tabler/icons-react'
import { VoiceProfile } from '../../../../main/tts/voice-profiles'
import { Select, SelectOption } from '../../../components/ui/Select'
import {
  KOKORO_VOICES,
  ELEVENLABS_VOICES,
  DEFAULT_KOKORO_VOICE,
  ELEVENLABS_DEFAULT_VOICE_ID,
  type ElevenLabsVoicePreset
} from '../../../../shared/tts-providers'
import { normalizeProviderSelection } from '../utils'

interface VoiceEditorProps {
  draft: VoiceProfile | null
  isSaving: boolean
  isPreviewing: boolean
  isSyncingVoices: boolean
  syncError: string | null
  elevenlabsApiKey: string
  syncedElevenLabsVoices: ElevenLabsVoicePreset[]
  previewText: string
  voiceOptions: SpeechSynthesisVoice[]
  onUpdateDraft: (updates: Partial<VoiceProfile>) => void
  onProviderChange: (provider: any) => void
  onSave: () => void
  onDelete: () => void
  onPreview: () => void
  onStopPreview: () => void
  onSyncVoices: () => void
  onPreviewTextChange: (text: string) => void
}

export function VoiceEditor({
  draft,
  isSaving,
  isPreviewing,
  isSyncingVoices,
  syncError,
  elevenlabsApiKey,
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
        <h3 className="text-sm font-bold uppercase tracking-widest">Select Persona</h3>
        <p className="text-xs mt-2">Initialize a voice profile to begin configuration.</p>
      </div>
    )
  }

  const provider = draft.provider ?? 'system'
  const voiceSelectOptions: SelectOption[] =
    provider === 'kokoro'
      ? KOKORO_VOICES.map((v) => ({ value: v.id, label: `${v.name} (${v.gender})` }))
      : provider === 'elevenlabs'
        ? (syncedElevenLabsVoices.length > 0 ? syncedElevenLabsVoices : ELEVENLABS_VOICES).map((v) => ({
            value: v.id,
            label: `${v.name} (${v.accent})`,
            group: v.gender
          }))
        : voiceOptions.map((v) => ({ value: v.name, label: `${v.name} (${v.lang})` }))

  const selectedValue =
    provider === 'kokoro'
      ? (draft.kokoroVoice ?? DEFAULT_KOKORO_VOICE)
      : provider === 'elevenlabs'
        ? (draft.elevenlabsVoiceId ?? ELEVENLABS_DEFAULT_VOICE_ID)
        : draft.voiceName

  return (
    <section className="app-section-card glass">
      <div className="app-section-head">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center text-accent">
            <IconVolume size={32} />
          </div>
          <div>
            <h2>{draft.name}</h2>
            <p>Persona Configuration</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={onSave} 
            disabled={isSaving}
            className="app-button !h-12 !px-6 text-xs font-black uppercase tracking-widest"
          >
            <IconDeviceFloppy size={16} className="mr-2 opacity-40" />
            {isSaving ? 'Syncing...' : 'Save Profile'}
          </button>
          <button onClick={onDelete} className="p-3 text-white/10 hover:text-danger hover:bg-danger/10 rounded-xl transition-all">
            <IconTrash size={18} />
          </button>
        </div>
      </div>

      <div className="app-section-content">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
          {/* Core Synthesis Params */}
          <div className="space-y-10">
            <div className="space-y-3">
              <label className="text-xs font-black uppercase tracking-widest text-white/40">Profile Identifier</label>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => onUpdateDraft({ name: e.target.value })}
                className="app-input !h-12 !px-5 !text-sm font-bold"
                placeholder="Enter profile name..."
              />
            </div>

            <div className="space-y-3">
              <label className="text-xs font-black uppercase tracking-widest text-white/40">Voice Provider</label>
              <div className="grid grid-cols-3 gap-2">
                {['system', 'kokoro', 'elevenlabs'].map((p) => (
                  <button
                    key={p}
                    onClick={() => onProviderChange(p)}
                    className={`h-12 rounded-xl border text-xs font-black uppercase tracking-widest transition-all ${
                      (draft.provider ?? 'system') === p
                        ? 'bg-accent/10 border-accent/30 text-accent'
                        : 'bg-white/[0.02] border-white/5 text-white/50 hover:border-white/10 hover:text-white/80'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-black uppercase tracking-widest text-white/40">Voice Selection</label>
              <div className="space-y-3">
                <Select
                  value={selectedValue}
                  options={voiceSelectOptions}
                  placeholder="Choose a voice…"
                  buttonClassName="!h-12 !px-5"
                  onChange={(val) => {
                    if (provider === 'kokoro') onUpdateDraft({ kokoroVoice: val })
                    else if (provider === 'elevenlabs') onUpdateDraft({ elevenlabsVoiceId: val })
                    else onUpdateDraft({ voiceName: val })
                  }}
                />
                {provider === 'elevenlabs' && (
                  <>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <p className={`text-[10px] font-black uppercase tracking-widest ${syncError ? 'text-danger' : 'text-white/20'}`}>
                          {syncError 
                            ? `Sync Failed: ${syncError}`
                            : syncedElevenLabsVoices.length > 0 
                              ? `${syncedElevenLabsVoices.length} voices synced from account` 
                              : 'Using curated built-in voices'}
                        </p>
                        <button 
                          onClick={onSyncVoices}
                          disabled={isSyncingVoices || !elevenlabsApiKey}
                          className="text-[10px] font-black uppercase tracking-widest text-accent hover:text-accent/80 disabled:opacity-30 transition-all flex items-center gap-1.5"
                        >
                          {isSyncingVoices ? (
                            <>
                              <div className="w-2 h-2 rounded-full border border-accent/30 border-t-accent animate-spin" />
                              Syncing...
                            </>
                          ) : (
                            <>
                              <IconPlus size={10} />
                              Sync All Account Voices
                            </>
                          )}
                        </button>
                      </div>
                      {syncError && (
                        <p className="text-[10px] text-white/30 italic">
                          Check the provider key in Voice Engine or verify connection.
                        </p>
                      )}
                    </div>
                    
                    <div className="pt-4 border-t border-white/5 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-black uppercase tracking-widest text-white/40">Manual Voice ID</label>
                        <span className="text-[10px] font-medium text-white/20 italic">Overwrites selection above</span>
                      </div>
                      <input
                        type="text"
                        value={draft.elevenlabsVoiceId || ''}
                        onChange={(e) => onUpdateDraft({ elevenlabsVoiceId: e.target.value })}
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
          <div className="space-y-10">
            <div className="space-y-6">
              <label className="text-xs font-black uppercase tracking-widest text-white/40">Acoustic Tuning</label>
              <div className="space-y-8">
                <div className="space-y-3">
                  <div className="flex justify-between text-xs font-black uppercase tracking-widest text-white/60">
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
                  <div className="flex justify-between text-xs font-black uppercase tracking-widest text-white/60">
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

            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3 group hover:border-white/10 transition-all">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20">Synthesis Test</label>
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
