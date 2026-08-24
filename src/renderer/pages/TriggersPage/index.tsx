import { IconActivity, IconBook2, IconRobot } from '@tabler/icons-react'
import { IconPlus, IconSearch } from '../../components/ui/icons'
import { IconAutomation } from '../../components/ui/icons/nav'
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
import {
  filterAutomationRules,
  type AutomationRuleStatusFilter
} from '../../lib/automation-rule-filter'
import {
  automationRecipes,
  createRecipeRule,
  type AutomationRecipe
} from '../../lib/automation-recipes'
import { CommanderView } from './CommanderView'
import { RecipeGallery } from './RecipeGallery'
import { PageHeader } from '../../components/layout/PageHeader'
import './automation.css'

type AutomationView = 'rules' | 'templates' | 'activity'

const AUTOMATION_VIEWS = [
  {
    id: 'rules' as const,
    label: 'Rules',
    description: 'Create, pause, and edit your automations.',
    icon: IconRobot
  },
  {
    id: 'templates' as const,
    label: 'Templates',
    description: 'Start from a ready-made setup.',
    icon: IconBook2
  },
  {
    id: 'activity' as const,
    label: 'Activity',
    description: 'Watch events and connected services.',
    icon: IconActivity
  }
]

const STATUS_FILTERS: Array<{ value: AutomationRuleStatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' }
]

export default function TriggersPage() {
  const [triggers, setTriggers] = useState<TriggerRule[]>([])
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([])
  const [sounds, setSounds] = useState<SoundFile[]>([])
  const { images } = useAssets()
  const [draft, setDraft] = useState<TriggerRule | null>(null)
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create')
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [activeView, setActiveView] = useState<AutomationView>('rules')
  const [ruleSearch, setRuleSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<AutomationRuleStatusFilter>('all')

  useEffect(() => {
    if (!window.api?.triggers) {
      setIsLoading(false)
      return
    }

    void window.api.triggers.getAll()
      .then((rules: TriggerRule[]) => {
        setTriggers(sortRules(rules))
      })
      .finally(() => {
        setIsLoading(false)
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
  const visibleRules = useMemo(
    () => filterAutomationRules(triggers, ruleSearch, statusFilter),
    [ruleSearch, statusFilter, triggers]
  )
  const hasRuleFilters = ruleSearch.trim().length > 0 || statusFilter !== 'all'

  const openCreateRule = () => {
    setEditorMode('create')
    setDraft(createDefaultTrigger(triggers.length))
  }

  const openEditRule = (rule: TriggerRule) => {
    setEditorMode('edit')
    setDraft(cloneTriggerRule(rule))
  }

  const closeEditor = () => {
    if (isSaving) return
    setDraft(null)
  }

  const persistRule = async (rule: TriggerRule, fallbackSortOrder = triggers.length) => {
    const existingRule = triggers.find((trigger) => trigger.id === rule.id)
    const normalized = normalizeTriggerRule(
      rule,
      existingRule?.sortOrder ?? fallbackSortOrder
    )

    await window.api.triggers.save(normalized)
    setTriggers((current) => sortRules(upsertRule(current, normalized)))
    return normalized
  }

  const saveDraft = async () => {
    if (!draft || validationErrors.length > 0) return

    setIsSaving(true)

    try {
      await persistRule(draft)
      setDraft(null)
    } finally {
      setIsSaving(false)
    }
  }

  const installRecipe = async (recipe: AutomationRecipe) => {
    const rule = createRecipeRule(recipe, triggers.length)
    await persistRule(rule, triggers.length)
  }

  const customizeRecipe = (recipe: AutomationRecipe) => {
    setEditorMode('create')
    setDraft(createRecipeRule(recipe, triggers.length))
  }

  const testRecipe = async (recipe: AutomationRecipe) => {
    await window.api?.events?.simulate?.(recipe.simulation)
  }

  const importRules = async (rules: TriggerRule[]) => {
    let imported = 0
    for (const [index, rule] of rules.entries()) {
      await persistRule(rule, triggers.length + index)
      imported += 1
    }
    return imported
  }

  const toggleRule = async (id: string) => {
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

  const deleteRule = async (id: string) => {
    await window.api.triggers.delete(id)
    setTriggers((current) => sortRules(current.filter((trigger) => trigger.id !== id)))
    setDraft((current) => (current?.id === id ? null : current))
  }

  const clearRuleFilters = () => {
    setRuleSearch('')
    setStatusFilter('all')
  }

  return (
    <div className="app-page automation-page">
      <PageHeader
        title="Automation Rules"
        description="Choose what should happen when a stream event matches your conditions."
        icon={IconAutomation}
        actions={
          <button onClick={openCreateRule} className="app-button-primary !h-11 !px-5">
            <IconPlus size={17} className="mr-2" />
            Create rule
          </button>
        }
      />

      <nav
        className="automation-view-nav app-section-card glass"
        aria-label="Automation sections"
      >
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-3" role="tablist">
          {AUTOMATION_VIEWS.map((view) => {
            const Icon = view.icon
            const selected = activeView === view.id
            const badge = view.id === 'rules'
              ? triggers.length.toString()
              : view.id === 'templates'
                ? automationRecipes.length.toString()
                : 'Live'

            return (
              <button
                key={view.id}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`automation-${view.id}-panel`}
                onClick={() => setActiveView(view.id)}
                className={`automation-view-tab flex min-h-[76px] items-center gap-3 rounded-xl border text-left transition-all ${
                  selected
                    ? 'border-accent/35 bg-accent/10 text-white'
                    : 'border-transparent text-white/45 hover:border-white/10 hover:bg-white/[0.025] hover:text-white'
                }`}
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                  selected ? 'bg-accent/15 text-accent' : 'bg-white/[0.035] text-white/35'
                }`}>
                  <Icon size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{view.label}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-white/35">
                    {view.description}
                  </span>
                </span>
                <span className={`automation-view-badge rounded-full text-[10px] font-semibold ${
                  selected ? 'bg-accent/15 text-accent' : 'bg-white/[0.04] text-white/30'
                }`}>
                  {badge}
                </span>
              </button>
            )
          })}
        </div>
      </nav>

      {activeView === 'rules' ? (
        <section
          id="automation-rules-panel"
          role="tabpanel"
          className="automation-view-panel app-section-card glass overflow-hidden"
        >
          <div className="app-section-head">
            <div>
              <h2>Your rules</h2>
              <p>Enabled rules listen for matching events and run their actions automatically.</p>
            </div>
            <div className="app-chip-accent">
              {enabledCount} active · {triggers.length - enabledCount} paused
            </div>
          </div>

          <div className="automation-rules-toolbar border-b border-white/5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <label className="relative block min-w-0 flex-1 lg:max-w-md">
                <span className="sr-only">Search automation rules</span>
                <IconSearch
                  size={15}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25"
                />
                <input
                  type="search"
                  value={ruleSearch}
                  onChange={(event) => setRuleSearch(event.target.value)}
                  placeholder="Search rules, platforms, or actions"
                  className="app-input !h-10 !pl-10 !text-xs"
                />
              </label>

              <div className="flex items-center gap-1 rounded-lg border border-white/5 bg-black/20 p-1">
                {STATUS_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    aria-pressed={statusFilter === filter.value}
                    onClick={() => setStatusFilter(filter.value)}
                    className={`automation-status-filter-button h-8 rounded-md text-[11px] font-semibold transition-colors ${
                      statusFilter === filter.value
                        ? 'bg-white/10 text-white'
                        : 'text-white/35 hover:text-white'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="app-section-content">
            {isLoading ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center text-center">
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent/20 border-t-accent" />
                <p className="mt-4 text-sm font-medium text-white/55">Loading your rules…</p>
              </div>
            ) : triggers.length === 0 ? (
              <div className="automation-empty-state flex min-h-[360px] flex-col items-center justify-center text-center">
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent">
                  <IconAutomation size={24} />
                </div>
                <h3 className="text-lg font-semibold text-white">Create your first automation</h3>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-white/40">
                  Build a rule from scratch, or start with a template and customize the details.
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                  <button onClick={openCreateRule} className="app-button-primary !h-10 !px-4">
                    <IconPlus size={15} className="mr-2" />
                    Create rule
                  </button>
                  <button
                    onClick={() => setActiveView('templates')}
                    className="app-button !h-10 !px-4"
                  >
                    Browse templates
                  </button>
                </div>
              </div>
            ) : visibleRules.length === 0 ? (
              <div className="automation-empty-state flex min-h-[280px] flex-col items-center justify-center text-center">
                <IconSearch size={24} className="mb-4 text-white/20" />
                <h3 className="text-base font-semibold text-white">No matching rules</h3>
                <p className="mt-2 text-sm text-white/35">Try another search or clear the current filters.</p>
                <button onClick={clearRuleFilters} className="app-button mt-5 !h-9 !px-4">
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between text-[11px] text-white/30">
                  <span>
                    Showing {visibleRules.length} of {triggers.length} {triggers.length === 1 ? 'rule' : 'rules'}
                  </span>
                  {hasRuleFilters && (
                    <button onClick={clearRuleFilters} className="font-medium text-accent hover:text-white">
                      Clear filters
                    </button>
                  )}
                </div>
                {visibleRules.map((trigger) => (
                  <TriggerRuleCard
                    key={trigger.id}
                    trigger={trigger}
                    onToggle={() => void toggleRule(trigger.id)}
                    onEdit={() => openEditRule(trigger)}
                    onDelete={() => void deleteRule(trigger.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      ) : activeView === 'templates' ? (
        <div id="automation-templates-panel" role="tabpanel" className="automation-view-panel">
          <RecipeGallery
            triggers={triggers}
            onInstallRecipe={installRecipe}
            onCustomizeRecipe={customizeRecipe}
            onTestRecipe={testRecipe}
            onImportRules={importRules}
          />
        </div>
      ) : (
        <div id="automation-activity-panel" role="tabpanel" className="automation-view-panel">
          <CommanderView />
        </div>
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
