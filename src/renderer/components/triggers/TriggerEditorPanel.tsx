import type { TriggerRule } from '../../../main/triggers/trigger-types'
import type { VoiceProfile } from '../../../main/tts/voice-profiles'
import type { SoundFile } from '../../hooks/useSoundboard'
import type { AssetFile } from '../../hooks/useAssets'
import {
  ACTION_TYPE_OPTIONS,
  CONDITION_TYPE_OPTIONS,
  PLATFORM_OPTIONS,
  createDefaultAction,
  createDefaultCondition
} from '../../lib/trigger-editor'
import { SectionHeader, FieldBlock, NumberInput, TypeWrapper } from './editor/common'
import { ConditionFields } from './editor/ConditionFields'
import { ActionFields } from './editor/ActionFields'

export function TriggerEditorPanel({
  mode,
  draft,
  voiceProfiles,
  validationErrors,
  isSaving,
  onClose,
  onSave,
  onChange,
  sounds,
  images
}: {
  mode: 'create' | 'edit'
  draft: TriggerRule
  voiceProfiles: VoiceProfile[]
  validationErrors: string[]
  isSaving: boolean
  onClose: () => void
  onSave: () => void
  onChange: (draft: TriggerRule) => void
  sounds: SoundFile[]
  images: AssetFile[]
}) {
  const updateDraft = (updater: (current: TriggerRule) => TriggerRule) => {
    onChange(updater(draft))
  }
  const allPlatformsSelected = draft.platforms.length === PLATFORM_OPTIONS.length

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="automation-rule-editor-title"
    >
      <div className="automation-editor-drawer absolute inset-y-0 right-0 w-full max-w-5xl overflow-y-auto border-l border-border bg-background shadow-2xl">
        <div className="automation-editor-header sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-accent">Automation rule</p>
              <h2 id="automation-rule-editor-title" className="automation-editor-title truncate text-xl font-semibold text-white">
                {mode === 'create' ? 'Create a new rule' : `Edit ${draft.name}`}
              </h2>
              <p className="automation-editor-subtitle text-xs text-muted">
                Work from top to bottom: choose where to listen, when to match, and what to do.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="app-button !h-10 !px-4 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={isSaving || validationErrors.length > 0}
                className="app-button-primary !h-10 !px-4 disabled:opacity-50"
              >
                {isSaving ? 'Saving…' : mode === 'create' ? 'Create rule' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>

        <div className="automation-editor-body mx-auto flex max-w-4xl flex-col gap-5">
          <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] sm:grid-cols-3">
            <FlowSummary
              label="Listens on"
              value={`${draft.platforms.length} ${draft.platforms.length === 1 ? 'platform' : 'platforms'}`}
            />
            <FlowSummary
              label="When"
              value={`${draft.conditions.length} ${draft.conditions.length === 1 ? 'condition' : 'conditions'}`}
            />
            <FlowSummary
              label="Then runs"
              value={`${draft.actions.length} ${draft.actions.length === 1 ? 'action' : 'actions'}`}
            />
          </div>

          {validationErrors.length > 0 && (
            <div className="automation-editor-validation rounded-xl border border-danger/30 bg-danger/10" role="alert">
              <p className="text-sm font-semibold text-danger">
                {validationErrors.length === 1 ? 'One detail needs attention' : `${validationErrors.length} details need attention`}
              </p>
              <ul className="mt-2 space-y-1 text-sm text-danger/90">
                {validationErrors.map((error) => (
                  <li key={error}>• {error}</li>
                ))}
              </ul>
            </div>
          )}

          <section className="automation-editor-step app-panel">
            <SectionHeader
              eyebrow="Step 1"
              title="Name and status"
              description="Give the rule a recognizable name and choose whether it should run now."
            />
            <div className="automation-editor-step-body grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
              <FieldBlock label="Rule name">
                <input
                  type="text"
                  value={draft.name}
                  onChange={(event) => onChange({ ...draft, name: event.target.value })}
                  placeholder="Welcome VIPs"
                  aria-label="Rule name"
                  className="app-input !h-11"
                />
              </FieldBlock>

              <FieldBlock label="Status">
                <button
                  type="button"
                  aria-pressed={draft.enabled}
                  onClick={() => onChange({ ...draft, enabled: !draft.enabled })}
                  className={`flex h-11 w-full items-center justify-between rounded-lg border px-3 text-sm font-medium transition-colors ${
                    draft.enabled
                      ? 'border-success/30 bg-success/10 text-success'
                      : 'border-border bg-card text-muted hover:bg-card-hover'
                  }`}
                >
                  <span>{draft.enabled ? 'Active' : 'Paused'}</span>
                  <span className={`h-2 w-2 rounded-full ${draft.enabled ? 'bg-success' : 'bg-white/20'}`} />
                </button>
              </FieldBlock>
            </div>
          </section>

          <section className="automation-editor-step app-panel">
            <SectionHeader
              eyebrow="Step 2"
              title="Choose where it listens"
              description="The rule will only consider events from the selected platforms."
              action={
                <button
                  type="button"
                  onClick={() => onChange({
                    ...draft,
                    platforms: allPlatformsSelected
                      ? []
                      : PLATFORM_OPTIONS.map((platform) => platform.value)
                  })}
                  className="app-button !h-9 !px-3 text-xs"
                >
                  {allPlatformsSelected ? 'Clear all' : 'Select all'}
                </button>
              }
            />
            <div className="automation-editor-step-body grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PLATFORM_OPTIONS.map((platform) => {
                const selected = draft.platforms.includes(platform.value)
                return (
                  <button
                    key={platform.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => updateDraft((current) => ({
                      ...current,
                      platforms: selected
                        ? current.platforms.filter((item) => item !== platform.value)
                        : [...current.platforms, platform.value]
                    }))}
                    className={`automation-platform-option flex h-11 items-center justify-between rounded-lg border text-sm font-medium transition-colors ${
                      selected
                        ? 'border-accent/35 bg-accent/10 text-accent'
                        : 'border-border bg-background text-muted hover:bg-card-hover hover:text-foreground'
                    }`}
                  >
                    {platform.label}
                    <span className={`h-2 w-2 rounded-full ${selected ? 'bg-accent' : 'bg-white/15'}`} />
                  </button>
                )
              })}
            </div>
          </section>

          <section className="automation-editor-step app-panel">
            <SectionHeader
              eyebrow="Step 3"
              title="Decide when it runs"
              description="Every condition below must match the same event before the rule can run."
              action={
                <button
                  type="button"
                  onClick={() => updateDraft((current) => ({
                    ...current,
                    conditions: [
                      ...current.conditions,
                      createDefaultCondition(current.conditions.length === 0 ? 'event_type' : 'keyword')
                    ]
                  }))}
                  className="app-button !h-9 !px-3 text-xs"
                >
                  + Add condition
                </button>
              }
            />
            <div className="automation-editor-step-body flex flex-col gap-3">
              {draft.conditions.length === 0 ? (
                <EmptyEditorSection
                  message="Add at least one event or condition so ilyStream knows when to run this rule."
                  actionLabel="Add event condition"
                  onAction={() => updateDraft((current) => ({
                    ...current,
                    conditions: [createDefaultCondition('event_type')]
                  }))}
                />
              ) : (
                draft.conditions.map((condition, index) => (
                  <TypeWrapper
                    key={index}
                    itemLabel={`Condition ${index + 1}`}
                    typeLabel="Match"
                    typeValue={condition.type}
                    typeOptions={CONDITION_TYPE_OPTIONS}
                    onTypeChange={(type) => updateDraft((current) => ({
                      ...current,
                      conditions: current.conditions.map((item, itemIndex) => (
                        itemIndex === index ? createDefaultCondition(type as any) : item
                      ))
                    }))}
                    onRemove={() => updateDraft((current) => ({
                      ...current,
                      conditions: current.conditions.filter((_, itemIndex) => itemIndex !== index)
                    }))}
                  >
                    <ConditionFields
                      condition={condition}
                      onChange={(next) => updateDraft((current) => ({
                        ...current,
                        conditions: current.conditions.map((item, itemIndex) => (
                          itemIndex === index ? next : item
                        ))
                      }))}
                    />
                  </TypeWrapper>
                ))
              )}
            </div>
          </section>

          <section className="automation-editor-step app-panel">
            <SectionHeader
              eyebrow="Step 4"
              title="Choose what happens"
              description="Actions run from top to bottom after every condition matches."
              action={
                <button
                  type="button"
                  onClick={() => updateDraft((current) => ({
                    ...current,
                    actions: [...current.actions, createDefaultAction('tts')]
                  }))}
                  className="app-button !h-9 !px-3 text-xs"
                >
                  + Add action
                </button>
              }
            />
            <div className="automation-editor-step-body flex flex-col gap-3">
              {draft.actions.length === 0 ? (
                <EmptyEditorSection
                  message="Add at least one action so the rule has something to do when it matches."
                  actionLabel="Add text-to-speech action"
                  onAction={() => updateDraft((current) => ({
                    ...current,
                    actions: [createDefaultAction('tts')]
                  }))}
                />
              ) : (
                draft.actions.map((action, index) => (
                  <TypeWrapper
                    key={index}
                    itemLabel={`Action ${index + 1}`}
                    typeLabel="Do this"
                    typeValue={action.type}
                    typeOptions={ACTION_TYPE_OPTIONS}
                    onTypeChange={(type) => updateDraft((current) => ({
                      ...current,
                      actions: current.actions.map((item, itemIndex) => (
                        itemIndex === index ? createDefaultAction(type as any) : item
                      ))
                    }))}
                    onRemove={() => updateDraft((current) => ({
                      ...current,
                      actions: current.actions.filter((_, itemIndex) => itemIndex !== index)
                    }))}
                  >
                    <ActionFields
                      action={action}
                      voiceProfiles={voiceProfiles}
                      sounds={sounds}
                      images={images}
                      onChange={(next) => updateDraft((current) => ({
                        ...current,
                        actions: current.actions.map((item, itemIndex) => (
                          itemIndex === index ? next : item
                        ))
                      }))}
                    />
                  </TypeWrapper>
                ))
              )}
            </div>
          </section>

          <section className="automation-editor-step app-panel">
            <SectionHeader
              eyebrow="Optional"
              title="Prevent repeat firing"
              description="Cooldowns keep busy events from running this rule too often. Leave them at zero to disable the limit."
            />
            <div className="automation-editor-step-body grid gap-4 md:grid-cols-2">
              <FieldBlock label="Rule cooldown (seconds)">
                <NumberInput
                  value={draft.cooldown}
                  min={0}
                  onChange={(value) => onChange({ ...draft, cooldown: value })}
                />
                <p className="automation-editor-field-help text-xs leading-relaxed text-muted">
                  Wait this long before anyone can run the rule again.
                </p>
              </FieldBlock>
              <FieldBlock label="Per-viewer cooldown (seconds)">
                <NumberInput
                  value={draft.userCooldown}
                  min={0}
                  onChange={(value) => onChange({ ...draft, userCooldown: value })}
                />
                <p className="automation-editor-field-help text-xs leading-relaxed text-muted">
                  Limit how often the same viewer can run the rule.
                </p>
              </FieldBlock>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function FlowSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="automation-editor-flow-cell border-b border-white/5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/25">{label}</p>
      <p className="automation-editor-flow-value text-sm font-semibold text-white/75">{value}</p>
    </div>
  )
}

function EmptyEditorSection({
  message,
  actionLabel,
  onAction
}: {
  message: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <div className="automation-editor-empty rounded-xl border border-dashed border-white/10 bg-black/10 text-center">
      <p className="mx-auto max-w-md text-sm leading-relaxed text-white/35">{message}</p>
      <button type="button" onClick={onAction} className="app-button !h-9 !px-4">
        {actionLabel}
      </button>
    </div>
  )
}
