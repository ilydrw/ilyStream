import { useState, useEffect, useRef } from 'react'
import {IconBell, IconCircleCheck, IconDeviceFloppy, IconRoute, IconSparkles, IconVolume} from '@tabler/icons-react'
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
      <div className="flex flex-col h-full bg-[#050505] items-center justify-center">
        <div className="w-12 h-12 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-[10px] text-white/20 mt-4 uppercase tracking-widest font-bold">Synchronizing Alert System...</p>
      </div>
    );
  }

  return (
    <>
      <div className="app-page alerts-page">
        <PageHeader
          kicker="Event routing & delivery"
          title="Live Alerts"
          icon={IconBell}
          description="Build platform-aware routes for chat, follows, gifts, subs, raids, likes, shares, joins, sound cues, and overlay visuals."
          actions={
            <>
            {showSuccess && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-success/10 border border-success/20 text-success animate-in fade-in slide-in-from-right-4">
                <IconCircleCheck size={14} />
                <span className="text-[10px] font-black uppercase tracking-widest">Saved</span>
              </div>
            )}

            {isDirty && !isSaving && (
              <button
                onClick={() => {
                  setDraftSettings(savedSettings);
                  setIsDirty(false);
                  isDirtyRef.current = false;
                }}
                className="app-button !bg-white/5 !text-white/40 hover:!text-white !px-6"
              >
                Discard
              </button>
            )}

            {(isDirty || isSaving) && (
              <button
                onClick={handleSave}
                disabled={isSaving}
                className={`app-button !px-8 ${isSaving ? 'opacity-50 cursor-wait' : 'bg-brand-gradient'}`}
              >
                <IconDeviceFloppy size={14} className={isSaving ? 'animate-spin' : ''} />
                {isSaving ? 'Synchronizing...' : 'Commit Changes'}
              </button>
            )}
            </>
          }
        />

        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-1 p-1 rounded-2xl bg-white/[0.03] border border-white/[0.05]">
            <button
              onClick={() => setActiveTab('routes')}
              className={`h-10 px-6 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'routes' ? 'bg-white/10 text-white shadow-lg' : 'text-white/30 hover:text-white/50'}`}
            >
              <div className="flex items-center gap-2">
                <IconRoute size={14} />
                Alert Routes
              </div>
            </button>
            <button
              onClick={() => setActiveTab('assets')}
              className={`h-10 px-6 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'assets' ? 'bg-white/10 text-white shadow-lg' : 'text-white/30 hover:text-white/50'}`}
            >
              <div className="flex items-center gap-2">
                <IconSparkles size={14} />
                Asset Library
              </div>
            </button>
          </div>

          <div className="flex items-center gap-8 px-6 py-2 rounded-2xl border border-white/[0.03] bg-white/[0.01]">
            <div className="flex flex-col">
              <span className="text-[8px] font-black uppercase tracking-widest text-white/20">Active Routes</span>
              <span className="text-sm font-black text-accent">{(draftSettings.alertRules ?? []).filter(r => r.enabled).length}</span>
            </div>
            <div className="h-4 w-px bg-white/5" />
            <div className="flex flex-col">
              <span className="text-[8px] font-black uppercase tracking-widest text-white/20">Audio Pool</span>
              <span className="text-sm font-black text-white/80">{sounds.length}</span>
            </div>
            <div className="h-4 w-px bg-white/5" />
            <div className="flex flex-col">
              <span className="text-[8px] font-black uppercase tracking-widest text-white/20">Visual Pool</span>
              <span className="text-sm font-black text-white/80">{images.length}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-10 2xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="flex flex-col gap-10">
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
              <section className="app-section-card glass !p-8 animate-in fade-in zoom-in-95 duration-300">
                <div className="grid grid-cols-1 gap-10 xl:grid-cols-2">
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

          <div className="flex flex-col gap-6 2xl:sticky 2xl:top-6 2xl:self-start">
            <OverlayUrlCard />

            <div className="p-6 rounded-3xl border border-white/[0.05] bg-white/[0.02] space-y-4">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-white/30">System Status</h4>
              <div className="space-y-3">
                <StatusRow label="Event Orchestrator" active />
                <StatusRow label="Sound Engine" active />
                <StatusRow label="Visual Buffer" active />
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
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-bold text-white/50">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`h-1 w-1 rounded-full ${active ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`} />
        <span className="text-[9px] font-black uppercase tracking-widest text-white/20">{active ? 'Live' : 'Off'}</span>
      </div>
    </div>
  )
}
