import React from 'react'
import { VoiceProfileSidebar } from './components/VoiceProfileSidebar'
import { EngineLogicSidebar } from './components/EngineLogicSidebar'
import { VoiceModifiersSidebar } from './components/VoiceModifiersSidebar'
import { VoiceEngineSettings } from './components/VoiceEngineSettings'
import { VoiceEditor } from './components/VoiceEditor'

import { TTSHeader } from './components/TTSHeader'
import { MissingVoicesAlert } from './components/MissingVoicesAlert'
import { useTTSPage } from './hooks/useTTSPage'
import { normalizeProviderSelection } from './utils'

export default function TTSPage() {
  const {
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
    elevenlabsApiKeys,
    syncedElevenLabsVoices,
    voiceModifiers,
    syncError,
    isSaving,
    isPreviewing,
    isSyncingVoices,
    missingVoiceProfiles,

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
  } = useTTSPage()

  const [activeTab, setActiveTab] = React.useState<'profiles' | 'rules' | 'engine'>('profiles')

  return (
    <div className="app-page pb-32 flex flex-col h-full min-h-0">
      <div className="shrink-0">
        <TTSHeader enabled={enabled} onToggle={handleToggle} />
        <MissingVoicesAlert missingProfiles={missingVoiceProfiles} />

        <div className="px-8 mt-4 border-b border-white/[0.06] flex items-center gap-8">
          <button
            onClick={() => setActiveTab('profiles')}
            className={`pb-4 border-b-2 font-semibold text-sm transition-all outline-none ${activeTab === 'profiles' ? 'border-accent text-white' : 'border-transparent text-white/40 hover:text-white/70'}`}
          >
            Voice Profiles
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`pb-4 border-b-2 font-semibold text-sm transition-all outline-none ${activeTab === 'rules' ? 'border-accent text-white' : 'border-transparent text-white/40 hover:text-white/70'}`}
          >
            Chat Rules & Overrides
          </button>
          <button
            onClick={() => setActiveTab('engine')}
            className={`pb-4 border-b-2 font-semibold text-sm transition-all outline-none ${activeTab === 'engine' ? 'border-accent text-white' : 'border-transparent text-white/40 hover:text-white/70'}`}
          >
            Engine & Limits
          </button>
        </div>
      </div>

      <div className="tts-tab-region flex-1 min-h-0 overflow-y-auto px-8 py-8">
        {activeTab === 'profiles' && (
          <div className="tts-settings-layout tts-settings-layout--profiles">
            <div className="flex flex-col gap-10">
              <VoiceProfileSidebar
                profiles={profiles}
                viewerProfiles={viewerProfiles}
                selectedProfileId={selectedProfileId}
                onSelectProfile={setSelectedProfileId}
                onCreateProfile={createProfile}
              />
            </div>
            <div className="flex flex-col gap-10">
              <VoiceEditor
                draft={draft}
                isSaving={isSaving}
                isPreviewing={isPreviewing}
                isSyncingVoices={isSyncingVoices}
                syncError={syncError}
                elevenlabsApiKeys={elevenlabsApiKeys}
                syncedElevenLabsVoices={syncedElevenLabsVoices}
                previewText={previewText}
                voiceOptions={availableVoices.filter((v) => v.lang.startsWith('en'))}
                onUpdateDraft={(updates) => setDraft(c => c ? { ...c, ...updates } : c)}
                onProviderChange={(p) => setDraft(c => c ? normalizeProviderSelection(c, p) : c)}
                onSave={saveDraft}
                onDelete={deleteDraft}
                onPreview={previewVoice}
                onStopPreview={stopPreview}
                onSyncVoices={(keyId) => void syncVoices(keyId)}
                onPreviewTextChange={setPreviewText}
              />
            </div>
          </div>
        )}

        {activeTab === 'rules' && (
          <div className="tts-settings-layout tts-settings-layout--rules">
            <div className="flex flex-col gap-10">
              <EngineLogicSidebar
                ttsRequireCommand={ttsRequireCommand}
                ttsCommandPrefixes={ttsCommandPrefixes}
                ttsAllowedRoles={ttsAllowedRoles}
                ttsIgnoreEmotes={ttsIgnoreEmotes}
                ttsVolume={ttsVolume}
                profiles={profiles}
                settings={settings}
                onSetRequireCommand={setRequireCommandSetting}
                onSelectCommandPrefix={selectCommandPrefix}
                onToggleAudiencePermission={toggleAudiencePermission}
                onUpdateSetting={updateSetting}
              />
              <VoiceModifiersSidebar
                voiceModifiers={voiceModifiers}
                onUpdateModifiers={updateVoiceModifiers}
              />
            </div>
            <div className="flex flex-col gap-10">

            </div>
          </div>
        )}

        {activeTab === 'engine' && (
          <div className="max-w-[1200px]">
            <VoiceEngineSettings settings={settings} onUpdate={updateSetting} />
          </div>
        )}
      </div>
    </div>
  )
}
