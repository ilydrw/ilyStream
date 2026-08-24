import { useState, useEffect, useRef } from 'react'
import { IconCircleCheck, IconDeviceFloppy, IconAlert, IconPlus, IconLink } from '../../components/ui/icons'
import { IconLibrary, IconVolume } from '@tabler/icons-react'
import { AlertRoutesPane } from './AlertRoutesPane'
import { AlertEditorPane } from './AlertEditorPane'
import { Toggle } from './AlertRuleSection'

import { defaultEventSoundSettings } from './types'
import type { EventSoundSettings, EventSoundSettingKey } from './types'
import { useSoundboard } from '../../hooks/useSoundboard'
import { useAssets } from '../../hooks/useAssets'
import { SoundLibrary } from './SoundLibrary'
import { ImageLibrary } from './ImageLibrary'
import { EmojiPickerModal } from '../../components/ui/EmojiPickerModal'
import type { SoundFile } from '../../hooks/useSoundboard'
import type { AlertRule, AlertRulePlatform } from '../../../shared/alert-rules'
import { DEFAULT_ALERT_RULES, SUPPORTED_EVENTS_BY_PLATFORM } from '../../../shared/alert-rules'

import { normalizeAlertSettings, cloneAlertSettings, settingsMatch } from './utils'
import { PageHeader } from '../../components/layout/PageHeader'
import { LikeMilestoneAlertSection } from './LikeMilestoneAlertSection'

import './styles.css'
// Two-pane overhaul — touch comment forces vite to re-transform if HMR got stuck.

export default function AlertsPage() {
  const { sounds, deleteSound, refreshSounds } = useSoundboard('alerts')
  const { images, deleteImage, uploadImage } = useAssets()

  const [draftSettings, setDraftSettings] = useState<EventSoundSettings | null>(null)
  const [savedSettings, setSavedSettings] = useState<EventSoundSettings | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
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
    let mounted = true
    const loadSettings = async () => {
      try {
        if (!window.api?.settings?.getAll) {
          const fallback = cloneAlertSettings(defaultEventSoundSettings)
          if (mounted) {
            setSavedSettings(fallback)
            setDraftSettings(fallback)
          }
          return
        }

        const settings = normalizeAlertSettings(await window.api.settings.getAll())
        if (mounted) {
          setSavedSettings(settings)
          setDraftSettings(settings)
          setIsDirty(false)
          isDirtyRef.current = false
        }
      } catch (err) {
        console.error('[Alerts] Failed to load settings:', err)
      }
    }
    loadSettings()
    return () => {
      mounted = false
    }
  }, [])

  // Listen for external updates
  useEffect(() => {
    if (!window.api?.on) return
    const unsubscribe = window.api.on('settings:changed', (newSettings: any) => {
      if (Date.now() - lastSyncRef.current < 2000) return
      const normalizedSettings = normalizeAlertSettings(newSettings)
      setSavedSettings(normalizedSettings)
      if (!isDirtyRef.current) setDraftSettings(normalizedSettings)
    })
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [])

  const handleUpdate = (key: EventSoundSettingKey, value: EventSoundSettings[EventSoundSettingKey]) => {
    if (!draftSettings) return
    const newSettings = { ...draftSettings, [key]: value } as EventSoundSettings
    const dirty = !settingsMatch(newSettings, savedSettings)
    setDraftSettings(newSettings)
    setIsDirty(dirty)
    isDirtyRef.current = dirty
  }

  const rules: AlertRule[] = draftSettings?.alertRules ?? []
  const selectedRule = rules.find(r => r.id === selectedRouteId) ?? null

  // If the selected rule disappears (deleted, settings reload), clear selection.
  useEffect(() => {
    if (selectedRouteId && !rules.some(r => r.id === selectedRouteId)) {
      setSelectedRouteId(null)
    }
  }, [rules, selectedRouteId])

  const writeRules = (next: AlertRule[]) => {
    handleUpdate('alertRules', next as EventSoundSettings['alertRules'])
  }

  const updateRule = (id: string, patch: Partial<AlertRule>) => {
    writeRules(rules.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  const deleteRule = (id: string) => {
    writeRules(rules.filter(r => r.id !== id))
    if (selectedRouteId === id) setSelectedRouteId(null)
  }

  const duplicateRule = (rule: AlertRule) => {
    const newId = crypto.randomUUID()
    writeRules([...rules, { ...rule, id: newId, name: `${rule.name} Copy`, priority: Math.max(0, rule.priority - 1) }])
    setSelectedRouteId(newId)
  }

  const createRule = (platform: AlertRulePlatform) => {
    const newId = crypto.randomUUID()
    const template = rules[0] ?? DEFAULT_ALERT_RULES[0]
    const events = platform === 'all'
      ? ['follow' as const]
      : [(SUPPORTED_EVENTS_BY_PLATFORM[platform]?.[0] ?? 'follow')]
    writeRules([
      ...rules,
      {
        ...template,
        id: newId,
        name: 'New alert route',
        enabled: true,
        platforms: [platform],
        eventTypes: events as AlertRule['eventTypes'],
        priority: 50,
        cooldownMs: 0,
        minGiftCount: 0,
        minAmountCents: 0,
        keyword: '',
        soundEnabled: false,
        soundId: '',
        imageEnabled: true,
        imageAssetId: '',
        useEventImage: true,
        textEnabled: true,
        textTemplate: '{displayName} triggered {eventType}!'
      }
    ])
    setSelectedRouteId(newId)
  }

  const handleSave = async () => {
    if (!draftSettings || isSaving) return
    setIsSaving(true)
    try {
      await window.api.settings.setMany(draftSettings)
      const saved = cloneAlertSettings(draftSettings)
      setSavedSettings(saved)
      setDraftSettings(saved)
      setIsDirty(false)
      isDirtyRef.current = false
      lastSyncRef.current = Date.now()
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 3000)
    } catch (err) {
      console.error('Failed to save alert settings:', err)
    } finally {
      setIsSaving(false)
    }
  }

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
        const currentSound = sounds.find((s) => s.id === targetAssetId)
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

  if (!draftSettings) {
    return (
      <div className="flex flex-col h-full bg-background items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-[12px] text-white/55 mt-3">Loading alerts…</p>
      </div>
    )
  }

  return (
    <>
      <div className="app-page alerts-page">
        <PageHeader
          kicker="Event routing & delivery"
          title="Alert Routes"
          icon={IconAlert}
          description="Route platform events to sound cues and on-screen visuals. Pick a route from the rail on the left, or create a new one for the platform you want to react to."
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
                    setDraftSettings(savedSettings)
                    setIsDirty(false)
                    isDirtyRef.current = false
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

        {/* ── Widget source guidance ─────────────────────────────────── */}
        <section className="app-section-card glass !overflow-visible">
          <div className="app-section-head">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-7 h-7 rounded-md bg-white/[0.05] border border-white/[0.08] flex items-center justify-center shrink-0">
                <IconLink size={15} className="text-white/55" />
              </div>
              <div className="min-w-0">
                <h2>Alert widget source</h2>
                <p>Routes below configure alert behavior. The OBS browser-source URL lives on your Event Alerts widget card.</p>
              </div>
            </div>
          </div>
          <div className="border-t border-white/[0.05] p-5 flex items-center justify-between gap-4">
            <p className="text-[12px] text-white/45 leading-relaxed">
              Create or open an Event Alerts widget in Overlays & Widgets, then use the browser-source URL shown on that widget. Do not add a separate legacy alert URL.
            </p>
            <a href="#/widgets" className="app-button shrink-0">
              Open widgets
            </a>
          </div>
        </section>

        {/* ── Local audio monitoring ──────────────────────────────────
            Once the overlay is connected in OBS, alert sounds play through the
            browser source (not the app) to avoid double audio. Streamers who
            don't monitor their OBS audio hear nothing — this makes the app play
            the sound locally too. */}
        <label
          className="app-section-card glass flex !flex-row shrink-0 items-center justify-between gap-4 px-5 py-3.5 cursor-pointer hover:bg-white/[0.015] transition-colors"
          onClick={(e) => {
            e.preventDefault()
            handleUpdate('alertSoundLocalMonitoring', !draftSettings.alertSoundLocalMonitoring)
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-7 h-7 rounded-md bg-white/[0.05] border border-white/[0.08] flex items-center justify-center shrink-0">
              <IconVolume size={15} className="text-white/55" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[14px] font-semibold text-white/90">Also play alert sounds in this app</h2>
              <p className="text-[12px] text-white/45 leading-relaxed">
                Keep hearing alerts locally even when your OBS overlay is connected. Leave off if you already monitor the overlay’s audio in OBS (avoids double sound).
              </p>
            </div>
          </div>
          <Toggle value={Boolean(draftSettings.alertSoundLocalMonitoring)} />
        </label>

        <LikeMilestoneAlertSection
          settings={draftSettings}
          sounds={sounds}
          onUpdate={handleUpdate}
        />

        {/* ── Routes (rail) + Editor (pane) ───────────────────────────── */}
        <div className="alerts-two-pane">
          <AlertRoutesPane
            rules={rules}
            selectedId={selectedRouteId}
            onSelect={setSelectedRouteId}
            onAdd={createRule}
            onToggleEnabled={(id, enabled) => updateRule(id, { enabled })}
          />
          <AlertEditorPane
            rule={selectedRule}
            sounds={sounds}
            images={images}
            totalRoutes={rules.length}
            onUpdateRule={updateRule}
            onDuplicateRule={duplicateRule}
            onDeleteRule={deleteRule}
            onCreateRule={createRule}
            onUploadSound={handleSoundUpload}
            onUploadImage={handleImageUpload}
          />
        </div>

        {/* ── Manage assets (collapsed) ───────────────────────────────
            The picker grids inside the editor are now the primary way to
            select sounds + images. This section is only for managing the
            underlying library — rename, edit emoji, delete. Collapsed by
            default so it doesn't push the editor / rail off-screen. */}
        <details className="app-section-card glass !overflow-visible">
          <summary className="app-section-head cursor-pointer select-none hover:bg-white/[0.015] transition-colors rounded-t-md">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-7 h-7 rounded-md bg-white/[0.05] border border-white/[0.08] flex items-center justify-center shrink-0">
                <IconLibrary size={15} className="text-white/55" />
              </div>
              <div className="min-w-0">
                <h2>Manage assets</h2>
                <p>{sounds.length} sound{sounds.length === 1 ? '' : 's'} · {images.length} image{images.length === 1 ? '' : 's'} — expand to rename, edit emoji, or delete.</p>
              </div>
            </div>
            <span className="text-[11px] text-white/35 shrink-0">Expand</span>
          </summary>
          <div className="border-t border-white/[0.05] space-y-6 p-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[13px] font-semibold text-white/80">Sound library</h3>
                <button onClick={handleSoundUpload} className="app-button !h-9 !text-[12px]">
                  <IconPlus size={13} />
                  Add sound
                </button>
              </div>
              <SoundLibrary
                sounds={sounds}
                onPlay={(id) => window.api.sound.play(id, 1.0)}
                onDelete={(sound) => confirm(`Delete ${sound.name}?`) && deleteSound(sound.id)}
                onEditEmoji={handleEditEmoji}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[13px] font-semibold text-white/80">Image library</h3>
                <button onClick={handleImageUpload} className="app-button !h-9 !text-[12px]">
                  <IconPlus size={13} />
                  Add image
                </button>
              </div>
              <ImageLibrary
                images={images}
                onDelete={(image) => confirm(`Delete ${image.name}?`) && deleteImage(image.id)}
              />
            </div>
          </div>
        </details>
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
