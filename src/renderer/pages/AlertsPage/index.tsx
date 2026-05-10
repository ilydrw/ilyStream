import { useState, useEffect, useRef } from 'react'
import { Bell, Save, CheckCircle2, Copy, ExternalLink } from 'lucide-react'
import { AlertRuleSection } from './AlertRuleSection'

import { defaultEventSoundSettings, pickEventSoundSettings } from './types'
import type { EventSoundSettings, EventSoundSettingKey } from './types'
import { resolveAppSettings, type AppSettingKey } from '../../../shared/app-settings'
import { useSoundboard } from '../../hooks/useSoundboard'
import { useAssets } from '../../hooks/useAssets'
import { SoundLibrary } from './SoundLibrary'
import { ImageLibrary } from './ImageLibrary'
import { EmojiPickerModal } from '../../components/ui/EmojiPickerModal'
import type { SoundFile } from '../../hooks/useSoundboard'
import type { AlertRule } from '../../../shared/alert-rules'
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
        console.log('[Alerts] Loading settings...');
        if (!window.api?.settings?.getAll) {
          const fallback = cloneAlertSettings(defaultEventSoundSettings);
          if (mounted) {
            setSavedSettings(fallback);
            setDraftSettings(fallback);
            setIsDirty(false);
            isDirtyRef.current = false;
          }
          return;
        }

        const settingsPromise = window.api.settings.getAll();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Settings load timeout')), 5000)
        );
        
        const settings = normalizeAlertSettings(await Promise.race([settingsPromise, timeoutPromise]));
        
        if (mounted) {
          console.log('[Alerts] Settings loaded successfully');
          setSavedSettings(settings);
          setDraftSettings(settings);
          setIsDirty(false);
          isDirtyRef.current = false;
        }
      } catch (err) {
        console.error('[Alerts] Failed to load settings:', err);
        if (mounted) {
          const fallback = cloneAlertSettings(defaultEventSoundSettings);
          setSavedSettings(fallback);
          setDraftSettings(fallback);
          setIsDirty(false);
          isDirtyRef.current = false;
        }
      }
    };
    loadSettings();
    return () => { mounted = false; };
  }, []);

  // Listen for external updates
  useEffect(() => {
    if (!window.api?.on) return;
    
    let unsubscribe: any;
    try {
      unsubscribe = window.api.on('settings:changed', (newSettings: any) => {
        if (Date.now() - lastSyncRef.current < 2000) return;
        const normalizedSettings = normalizeAlertSettings(newSettings);
        setSavedSettings(normalizedSettings);
        if (!isDirtyRef.current) {
          setDraftSettings(normalizedSettings);
        }
      });
    } catch (err) {
      console.error('[Alerts] Failed to subscribe to settings:changed:', err);
    }
    
    return () => {
      if (typeof unsubscribe === 'function') {
        try { unsubscribe(); } catch (e) {}
      }
    };
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
      if (!window.api?.settings?.setMany) {
        throw new Error('Settings API not available');
      }
      console.log('[renderer] handleSave: sending draftSettings', draftSettings);
      await window.api.settings.setMany(draftSettings);
      console.log('[renderer] handleSave: setMany success');
      
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
        // Also check if we need to rename
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

  const handleImageUpload = async () => {
    const path = await window.api.assets.images.pickFile()
    if (path) {
      await uploadImage(path)
    }
  }

  if (!draftSettings) {
    return (
      <div className="flex flex-col h-full bg-[#050505] items-center justify-center">
        <div className="w-12 h-12 border-2 border-[#19c8ff] border-t-transparent rounded-full animate-spin" />
        <p className="text-[10px] text-white/20 mt-4 uppercase tracking-widest font-bold">Synchronizing Alert System...</p>
      </div>
    );
  }

  return (
    <>
      <div className="app-page overflow-y-auto custom-scrollbar">
      {/* Premium Header */}
      <header className="app-page-header">
        <div className="flex items-center gap-6">
          <div className="flex items-center justify-center">
            <Bell size={32} className="text-accent" />
          </div>
          <div>
            <div className="app-header-eyebrow">
              <Bell size={14} className="text-accent" />
              <span>Broadcast Feedback</span>
            </div>
            <h1>Live Alert System</h1>
            <p className="app-page-intro">
              Build platform-aware alert routes for chat, follows, gifts, subs, raids, likes, shares, and joins.
              Each route can target one platform, every platform, or a precise mix.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {showSuccess && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-success/10 border border-success/20 text-success animate-in fade-in slide-in-from-right-4">
              <CheckCircle2 size={14} />
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
              <Save size={14} className={isSaving ? 'animate-spin' : ''} />
              {isSaving ? 'Synchronizing...' : 'Commit Changes'}
            </button>
          )}
        </div>
      </header>

        <div className="grid grid-cols-1 gap-10 2xl:grid-cols-[minmax(0,1fr)_460px]">
          <div className="flex flex-col gap-10">
            <AlertRuleSection
              rules={draftSettings.alertRules}
              sounds={sounds}
              images={images}
              onChange={handleRulesChange}
              onUploadSound={handleSoundUpload}
              onUploadImage={handleImageUpload}
            />

            <section className="app-section-card glass">
              <div className="app-section-head">
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center text-accent">
                    <ExternalLink size={32} />
                  </div>
                  <div>
                    <h2>Alert Asset Library</h2>
                    <p>Upload, preview, and clean up reusable alert media.</p>
                  </div>
                </div>
              </div>
              
              <div className="app-section-content !p-0">
                <div className="grid grid-cols-1 gap-10 p-8 xl:grid-cols-2">
                  <SoundLibrary
                    sounds={sounds}
                    onUpload={handleSoundUpload}
                    onPlay={(id) => window.api.sound.play(id, 1.0)}
                    onDelete={(sound) => {
                      if (confirm(`Delete ${sound.name}?`)) deleteSound(sound.id)
                    }}
                    onEditEmoji={handleEditEmoji}
                  />

                  <ImageLibrary
                    images={images}
                    onUpload={handleImageUpload}
                    onDelete={(image) => {
                      if (confirm(`Delete ${image.name}?`)) deleteImage(image.id)
                    }}
                  />
                </div>
              </div>
            </section>
          </div>

          <div className="flex flex-col gap-6 2xl:sticky 2xl:top-6 2xl:self-start">
            <OverlayUrlCard settings={draftSettings} />
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
function normalizeAlertSettings(settings: unknown): EventSoundSettings {
  return pickEventSoundSettings(
    resolveAppSettings((settings || {}) as Partial<Record<AppSettingKey, unknown>>)
  )
}

function cloneAlertSettings(settings: EventSoundSettings): EventSoundSettings {
  return { ...settings }
}

function settingsMatch(
  left: EventSoundSettings | null,
  right: EventSoundSettings | null
): boolean {
  if (!left || !right) return left === right
  return JSON.stringify(left) === JSON.stringify(right)
}

function OverlayUrlCard({ settings }: { settings: EventSoundSettings }) {
  const [url, setUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const applyStatus = (status: { alertsUrl?: string | null }) => {
      if (status.alertsUrl) setUrl(status.alertsUrl)
    }

    if (window.api?.overlay?.getStatus) {
      window.api.overlay.getStatus().then(applyStatus)
    }

    const unsubscribe = window.api?.on?.('overlay:status-changed', (status: unknown) => {
      applyStatus(status as { alertsUrl?: string | null })
    })
    const statusTimer = window.setInterval(() => {
      void window.api?.overlay?.getStatus?.().then(applyStatus)
    }, 3000)

    return () => {
      unsubscribe?.()
      window.clearInterval(statusTimer)
    }
  }, [])

  const handleCopy = () => {
    if (!url) return
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ExternalLink size={14} className="text-white/20" />
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">Overlay Source</span>
        </div>
      </div>
      
      <div className="relative group">
        <div className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-[11px] text-[#19c8ff] font-mono truncate pr-12 select-all">
          {url || 'Detecting Server...'}
        </div>
        <button 
          onClick={handleCopy}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-white/5 text-white/40 hover:text-white hover:bg-white/10 transition-all"
          title="Copy to Clipboard"
        >
          {copied ? <CheckCircle2 size={14} className="text-emerald-500" /> : <Copy size={14} />}
        </button>
      </div>

      <div className="p-4 rounded-xl bg-blue-400/5 border border-blue-400/10 flex gap-3">
        <ExternalLink size={14} className="text-blue-400 shrink-0 mt-0.5" />
        <p className="text-[10px] text-blue-400/50 leading-relaxed">
          The overlay is active in your broadcast software. Use the <strong>Test</strong> buttons on the left to trigger live alerts and audio previews.
        </p>
      </div>
    </div>
  )
}
