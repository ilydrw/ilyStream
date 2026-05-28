import { useState, useEffect, useRef } from 'react'
import { IconRoute, IconSparkles, IconVolume } from '@tabler/icons-react'
import { IconCircleCheck, IconDeviceFloppy, IconAlert } from '../../components/ui/icons'
import { AlertRuleSection } from './AlertRuleSection'

import { defaultEventSoundSettings } from './types'
import type { EventSoundSettings, EventSoundSettingKey } from './types'
import { useSoundboard } from '../../hooks/useSoundboard'
import { useAssets } from '../../hooks/useAssets'
import { SoundLibrary } from './SoundLibrary'
import { ImageLibrary } from './ImageLibrary'
import { EmojiPickerModal } from '../../components/ui/EmojiPickerModal'
import type { SoundFile } from '../../hooks/useSoundboard'
import type { AlertRule } from '../../../shared/alert-rules'

// Modular Components & Utils
import { OverlayUrlCard } from './components/OverlayUrlCard'
import { normalizeAlertSettings, cloneAlertSettings, settingsMatch } from './utils'
import { PageHeader } from '../../components/layout/PageHeader'

import './styles.css'

export default function AlertsPage() {
  const { sounds, deleteSound, refreshSounds } = useSoundboard('alerts')
  const { images, deleteImage, uploadImage } = useAssets()

  const [draftSettings, setDraftSettings] = useState<EventSoundSettings | null>(null)
  const [savedSettings, setSavedSettings] = useState<EventSoundSettings | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const lastSyncRef = useRef<number>(0)
  const isDirtyRef = useRef(false)

  // Emoji Picker & Asset Management State
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false)
  const [emojiPickerMode, setEmojiPickerMode] = useState<'add' | 'edit'>('add')
  const [emojiInput, setEmojiInput] = useState('')
  const [assetNameInput, setAssetNameInput] = useState('')
  const [activeEmojiCategory, setActiveEmojiCategory] = useState('smileys-emotion')
  const [targetAssetId, setTargetAssetId] = useState<string | null>(null)
  const [pendingUploadPath, setPendingUploadPath] = useState<string | null>(null)

  // Load initial settings
  useEffect(() => {
    let mounted = true;
    const loadSettings = async () => {
      try {
        if (!window.api?.settings?.getAll) {
          const fallback = cloneAlertSettings(defaultEventSoundSettings);
          if (mounted) {
            setSavedSettings(fallback);
            setDraftSettings(fallback);
          }
          return;
        }

        const settings = normalizeAlertSettings(await window.api.settings.getAll());
        if (mounted) {
          setSavedSettings(settings);
          setDraftSettings(settings);
          setIsDirty(false);
          isDirtyRef.current = false;
        }
      } catch (err) {
        console.error('[Alerts] Failed to load settings:', err);
      }
    };
    loadSettings();
    return () => { mounted = false; };
  }, []);

  // Listen for external updates
  useEffect(() => {
    if (!window.api?.on) return;
    const unsubscribe = window.api.on('settings:changed', (newSettings: any) => {
      if (Date.now() - lastSyncRef.current < 2000) return;
      const normalizedSettings = normalizeAlertSettings(newSettings);
      setSavedSettings(normalizedSettings);
      if (!isDirtyRef.current) setDraftSettings(normalizedSettings);
    });
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, []);

  const handleUpdate = (key: EventSoundSettingKey, value: EventSoundSettings[EventSoundSettingKey]) => {
    if (!draftSettings) return;
    const newSettings = { ...draftSettings, [key]: value } as EventSoundSettings;
    const dirty = !settingsMatch(newSettings, savedSettings);
    setDraftSettings(newSettings);
    setIsDirty(dirty);
    isDirtyRef.current = dirty;
  };

  const handleRulesChange = (rules: AlertRule[]) => {
    handleUpdate('alertRules', rules as EventSoundSettings['alertRules'])
  }

  const handleSave = async () => {
    if (!draftSettings || isSaving) return;
    setIsSaving(true);
    try {
      await window.api.settings.setMany(draftSettings);
      const saved = cloneAlertSettings(draftSettings);
      setSavedSettings(saved);
      setDraftSettings(saved);
      setIsDirty(false);
      isDirtyRef.current = false;
      lastSyncRef.current = Date.now();
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save alert settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSoundUpload = async () => {
    const path = await window.api.sound.pickFile()
    if (path) {
      setPendingUploadPath(path)
      setAssetNameInput(path.split(/[\\/]/).pop()?.split('.')[0] || '')
      setEmojiInput('🔊')
      setEmojiPickerMode('add')
      setIsEmojiPickerOpen(true)
    }
  }

  const handleImageUpload = async () => {
    await uploadImage()
  }

  const handleEditEmoji = (sound: SoundFile) => {
    setTargetAssetId(sound.id)
    setAssetNameInput(sound.name.split('.')[0])
    setEmojiInput(sound.emoji || '🔊')
    setEmojiPickerMode('edit')
    setIsEmojiPickerOpen(true)
  }

  const handleEmojiConfirm = async (emoji: string) => {
    try {
      if (emojiPickerMode === 'add' && pendingUploadPath) {
        await window.api.sound.upload(pendingUploadPath, emoji, 'alerts')
        setPendingUploadPath(null)
      } else if (emojiPickerMode === 'edit' && targetAssetId) {
        await window.api.sound.setEmoji(targetAssetId, emoji)
        const currentSound = sounds.find(s => s.id === targetAssetId)
        if (currentSound && assetNameInput !== currentSound.name.split('.')[0]) {
          await window.api.sound.rename(targetAssetId, assetNameInput)
        }
      }
    } catch (err) {
      console.error('Failed to update sound emoji:', err)
    } finally {
      setTargetAssetId(null)
      setIsEmojiPickerOpen(false)
      refreshSounds()
    }
  }

  const [activeTab, setActiveTab] = useState<'routes' | 'assets'>('routes')

  if (!draftSettings) {
    return (
      <div className="flex flex-col h-full bg-background items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-[12px] text-white/55 mt-3">Loading alerts…</p>
      </div>
    );
  }

  return (
    <>
      <div className="app-page alerts-page">
        <PageHeader
          kicker="Event routing & delivery"
          title="Live alerts"
          icon={IconAlert}
          description="Build platform-aware routes for chat, follows, gifts, subs, raids, likes, shares, joins, sound cues, and overlay visuals."
          actions={
            <>
            {showSuccess && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-success/10 text-success animate-in fade-in slide-in-from-right-2">
                <IconCircleCheck size={13} />
                <span className="text-[12px] font-medium">Saved</span>
              </div>
            )}

            {isDirty && !isSaving && (
              <button
                onClick={() => {
                  setDraftSettings(savedSettings);
                  setIsDirty(false);
                  isDirtyRef.current = false;
                }}
                className="app-button"
              >
                Discard
              </button>
            )}

            {(isDirty || isSaving) && (
              <button
                onClick={handleSave}
                disabled={isSaving}
                className={`app-button-primary ${isSaving ? 'opacity-60 cursor-wait' : ''}`}
              >
                <IconDeviceFloppy size={14} className={isSaving ? 'animate-spin' : ''} />
                {isSaving ? 'Saving…' : 'Save changes'}
              </button>
            )}
            </>
          }
        />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-white/[0.03]">
            <button
              onClick={() => setActiveTab('routes')}
              className={`h-8 px-3 rounded-[5px] text-[12px] font-medium transition-colors ${activeTab === 'routes' ? 'bg-white/[0.06] text-white' : 'text-white/55 hover:text-white'}`}
            >
              <div className="flex items-center gap-1.5">
                <IconRoute size={13} />
                Alert routes
              </div>
            </button>
            <button
              onClick={() => setActiveTab('assets')}
              className={`h-8 px-3 rounded-[5px] text-[12px] font-medium transition-colors ${activeTab === 'assets' ? 'bg-white/[0.06] text-white' : 'text-white/55 hover:text-white'}`}
            >
              <div className="flex items-center gap-1.5">
                <IconSparkles size={13} />
                Asset library
              </div>
            </button>
          </div>

          <div className="flex items-center gap-5 px-4 py-2 rounded-md bg-white/[0.025]">
            <div className="flex flex-col">
              <span className="text-[11px] font-normal text-white/55">Active routes</span>
              <span className="text-[14px] font-semibold text-accent tabular-nums leading-tight">{(draftSettings.alertRules ?? []).filter(r => r.enabled).length}</span>
            </div>
            <div className="h-6 w-px bg-white/[0.05]" />
            <div className="flex flex-col">
              <span className="text-[11px] font-normal text-white/55">Audio pool</span>
              <span className="text-[14px] font-semibold text-white tabular-nums leading-tight">{sounds.length}</span>
            </div>
            <div className="h-6 w-px bg-white/[0.05]" />
            <div className="flex flex-col">
              <span className="text-[11px] font-normal text-white/55">Visual pool</span>
              <span className="text-[14px] font-semibold text-white tabular-nums leading-tight">{images.length}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-4">
            {activeTab === 'routes' ? (
              <AlertRuleSection
                rules={draftSettings.alertRules ?? []}
                sounds={sounds}
                images={images}
                onChange={handleRulesChange}
                onUploadSound={handleSoundUpload}
                onUploadImage={handleImageUpload}
              />
            ) : (
              <section className="app-section-card glass !p-5 animate-in fade-in duration-200">
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                  <SoundLibrary
                    sounds={sounds}
                    onUpload={handleSoundUpload}
                    onPlay={(id) => window.api.sound.play(id, 1.0)}
                    onDelete={(sound) => confirm(`Delete ${sound.name}?`) && deleteSound(sound.id)}
                    onEditEmoji={handleEditEmoji}
                  />
                  <ImageLibrary
                    images={images}
                    onUpload={handleImageUpload}
                    onDelete={(image) => confirm(`Delete ${image.name}?`) && deleteImage(image.id)}
                  />
                </div>
              </section>
            )}
          </div>

          <div className="flex flex-col gap-3 2xl:sticky 2xl:top-6 2xl:self-start">
            <OverlayUrlCard />

            <div className="p-5 rounded-md bg-white/[0.025]">
              <h4 className="text-[13px] font-semibold text-white mb-3">System status</h4>
              <div className="flex flex-col gap-2">
                <StatusRow label="Event orchestrator" active />
                <StatusRow label="Sound engine" active />
                <StatusRow label="Visual buffer" active />
              </div>
            </div>
          </div>
        </div>
      </div>

      <EmojiPickerModal
        isOpen={isEmojiPickerOpen}
        mode={emojiPickerMode}
        onClose={() => {
          setIsEmojiPickerOpen(false)
          setPendingUploadPath(null)
          setTargetAssetId(null)
        }}
        onConfirm={handleEmojiConfirm}
        emojiInput={emojiInput}
        setEmojiInput={setEmojiInput}
        assetName={assetNameInput}
        setAssetName={setAssetNameInput}
        activeCategory={activeEmojiCategory}
        setActiveCategory={setActiveEmojiCategory}
      />
    </>
  )
}

function StatusRow({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[12px] font-normal text-white/55">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-success' : 'bg-danger'}`} />
        <span className={`text-[11px] font-medium ${active ? 'text-success' : 'text-danger'}`}>{active ? 'Live' : 'Off'}</span>
      </div>
    </div>
  )
}
