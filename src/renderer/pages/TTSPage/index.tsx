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

  return (
    <div className="app-page pb-32">
      <TTSHeader enabled={enabled} onToggle={handleToggle} />

      <MissingVoicesAlert missingProfiles={missingVoiceProfiles} />

      <VoiceEngineSettings settings={settings} onUpdate={updateSetting} />

      <div className="grid grid-cols-1 2xl:grid-cols-[400px_1fr] gap-16 flex-1 min-h-0">
        {/* Left Control Rail */}
        <div className="flex flex-col gap-16">
          <VoiceProfileSidebar
            profiles={profiles}
            selectedProfileId={selectedProfileId}
            onSelectProfile={setSelectedProfileId}
            onCreateProfile={createProfile}
          />
          
          <EngineLogicSidebar
            ttsRequireCommand={ttsRequireCommand}
            ttsCommandPrefixes={ttsCommandPrefixes}
            ttsAllowedRoles={ttsAllowedRoles}
            ttsIgnoreEmotes={ttsIgnoreEmotes}
            ttsVolume={ttsVolume}
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

        {/* Main Editor Canvas */}
        <div className="flex flex-col gap-10">
          <VoiceEditor
            draft={draft}
            isSaving={isSaving}
            isPreviewing={isPreviewing}
            isSyncingVoices={isSyncingVoices}
            syncError={syncError}
            elevenlabsApiKey={elevenlabsApiKey}
            syncedElevenLabsVoices={syncedElevenLabsVoices}
            previewText={previewText}
            voiceOptions={availableVoices.filter((v) => v.lang.startsWith('en'))}
            onUpdateDraft={(updates) => setDraft(c => c ? { ...c, ...updates } : c)}
            onProviderChange={(p) => setDraft(c => c ? normalizeProviderSelection(c, p) : c)}
            onSave={saveDraft}
            onDelete={deleteDraft}
            onPreview={previewVoice}
            onStopPreview={stopPreview}
            onSyncVoices={() => void syncVoices()}
            onPreviewTextChange={setPreviewText}
          />
        </div>
      </div>
    </div>
  )
}
