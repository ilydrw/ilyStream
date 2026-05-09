import { Bot, Plus, Volume2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import type { VoiceProfile } from '../../../main/tts/voice-profiles'
import type { TriggerRule } from '../../../main/triggers/trigger-types'
import type { SoundFile } from '../../hooks/useSoundboard'
import { useAssets } from '../../hooks/useAssets'
import { TriggerEditorPanel } from '../../components/triggers/TriggerEditorPanel'
import { TriggerRuleCard } from '../../components/triggers/TriggerRuleCard'
import {
  cloneTriggerRule,
  createDefaultTrigger,
  getTriggerValidationErrors,
  normalizeTriggerRule
} from '../../lib/trigger-editor'
import { CommanderView } from './CommanderView'

export default function TriggersPage() {
  const [triggers, setTriggers] = useState<TriggerRule[]>([])
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([])
  const [sounds, setSounds] = useState<SoundFile[]>([])
  const { images } = useAssets()
  const [draft, setDraft] = useState<TriggerRule | null>(null)
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create')
  const [isSaving, setIsSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'rules' | 'commander'>('commander')

  useEffect(() => {
    if (!window.api?.triggers) return

    void window.api.triggers.getAll().then((rules: TriggerRule[]) => {
      setTriggers(sortRules(rules))
    })

    void window.api.voice.getAll().then((profiles: VoiceProfile[]) => {
      setVoiceProfiles(profiles)
    })

    void window.api.sound.getAll().then((allSounds: SoundFile[]) => {
      setSounds(allSounds)
    })

    const unsubscribe = window.api.on('voice:changed', (profiles: unknown) => {
      setVoiceProfiles(profiles as VoiceProfile[])
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const validationErrors = useMemo(
    () => (draft ? getTriggerValidationErrors(draft) : []),
    [draft]
  )
  const enabledCount = useMemo(
    () => triggers.filter((trigger) => trigger.enabled).length,
    [triggers]
  )

  const openCreateTrigger = () => {
    setEditorMode('create')
    setDraft(createDefaultTrigger(triggers.length))
  }

  const openEditTrigger = (rule: TriggerRule) => {
    setEditorMode('edit')
    setDraft(cloneTriggerRule(rule))
  }

  const closeEditor = () => {
    if (isSaving) return
    setDraft(null)
  }

  const saveDraft = async () => {
    if (!draft || validationErrors.length > 0) return

    setIsSaving(true)

    try {
      const existingRule = triggers.find((trigger) => trigger.id === draft.id)
      const normalized = normalizeTriggerRule(
        draft,
        existingRule?.sortOrder ?? triggers.length
      )

      await window.api.triggers.save(normalized)
      setTriggers((current) => sortRules(upsertRule(current, normalized)))
      setDraft(null)
    } finally {
      setIsSaving(false)
    }
  }

  const toggleTrigger = async (id: string) => {
    const currentRule = triggers.find((trigger) => trigger.id === id)
    if (!currentRule) return

    const updated = { ...currentRule, enabled: !currentRule.enabled }
    await window.api.triggers.save(updated)
    setTriggers((current) => sortRules(upsertRule(current, updated)))

    setDraft((current) => {
      if (current?.id !== id) return current
      return cloneTriggerRule(updated)
    })
  }

  const deleteTrigger = async (id: string) => {
    await window.api.triggers.delete(id)
    setTriggers((current) => sortRules(current.filter((trigger) => trigger.id !== id)))
    setDraft((current) => (current?.id === id ? null : current))
  }

  return (
    <div className="app-page">
      <header className="app-page-header">
        <div className="flex items-center gap-6">
          <div className="flex items-center justify-center">
            <Bot size={32} className="text-accent" />
          </div>
          <div>
            <div className="app-header-eyebrow">
              <Bot size={14} className="text-accent" />
              <span>Core Configuration</span>
            </div>
            <h1>Stream Triggers</h1>
            <p className="app-page-intro">
              Automate your stream reactions. Create complex logic that connects chat events, 
              voice responses, and sound alerts into seamless automated workflows.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-white/[0.03] border border-white/5 rounded-xl p-1 h-12">
            <button 
              onClick={() => setActiveTab('commander')}
              className={`px-6 h-full rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                activeTab === 'commander' ? 'bg-accent text-black' : 'text-white/40 hover:text-white'
              }`}
            >
              Command Center
            </button>
            <button 
              onClick={() => setActiveTab('rules')}
              className={`px-6 h-full rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                activeTab === 'rules' ? 'bg-accent text-black' : 'text-white/40 hover:text-white'
              }`}
            >
              Rules Manager
            </button>
          </div>
          <button onClick={openCreateTrigger} className="app-button-primary !h-12 !px-8">
            <Plus size={18} className="mr-2" />
            New Trigger
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-20">
        <Metric
          icon={<Bot size={18} className="text-white" />}
          label="Total Rules"
          value={triggers.length.toString()}
        />
        <Metric
          icon={<Volume2 size={18} className="text-white/60" />}
          label="Active Automations"
          value={enabledCount.toString()}
        />
        <div className="app-section-card glass p-6 flex flex-col items-start gap-4">
          <div className="flex items-center justify-center text-success">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-1">Engine Status</p>
            <p className="text-xl font-black text-white tracking-tight">Online</p>
          </div>
        </div>
      </div>

      {activeTab === 'commander' ? (
        <CommanderView />
      ) : (
        <section className="app-section-card glass overflow-hidden">
          <div className="app-section-head">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center text-accent">
                <Bot size={32} />
              </div>
              <div>
                <h2>Automation Rules</h2>
                <p>Manage event-based triggers.</p>
              </div>
            </div>
            <div className="app-chip-accent">
              {enabledCount} / {triggers.length} Active
            </div>
          </div>

          <div className="app-section-content">
            <div className="flex flex-col gap-6">
            {triggers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-20 h-20 rounded-3xl bg-white/[0.02] border border-white/5 flex items-center justify-center mb-6">
                  <Plus size={32} className="text-white/10" />
                </div>
                <h3 className="text-xl font-black text-white mb-2 tracking-tight">No Triggers Configured</h3>
                <p className="text-sm text-white/40 max-w-xs mb-8">
                  Create your first automation rule to start responding to chat events and alerts.
                </p>
                <button onClick={openCreateTrigger} className="app-button-primary !h-12 !px-8">
                  Create First Trigger
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-12">
                {triggers.map((trigger) => (
                  <TriggerRuleCard
                    key={trigger.id}
                    trigger={trigger}
                    onToggle={() => void toggleTrigger(trigger.id)}
                    onEdit={() => openEditTrigger(trigger)}
                    onDelete={() => void deleteTrigger(trigger.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
      )}

      {draft && (
        <TriggerEditorPanel
          mode={editorMode}
          draft={draft}
          voiceProfiles={voiceProfiles}
          sounds={sounds}
          images={images}
          validationErrors={validationErrors}
          isSaving={isSaving}
          onClose={closeEditor}
          onSave={() => void saveDraft()}
          onChange={setDraft}
        />
      )}
    </div>
  )
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="app-section-card glass p-6 flex flex-col items-start gap-4 hover:bg-white/[0.02] transition-all group">
      <div className="flex items-center justify-center text-white/20 group-hover:text-accent transition-all">
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-1">{label}</p>
        <p className="text-xl font-black text-white tracking-tight">{value}</p>
      </div>
    </div>
  )
}

function upsertRule(rules: TriggerRule[], nextRule: TriggerRule): TriggerRule[] {
  const index = rules.findIndex((rule) => rule.id === nextRule.id)
  if (index === -1) return [...rules, nextRule]

  const nextRules = [...rules]
  nextRules[index] = nextRule
  return nextRules
}

function sortRules(rules: TriggerRule[]): TriggerRule[] {
  return [...rules].sort((left, right) => left.sortOrder - right.sortOrder)
}
