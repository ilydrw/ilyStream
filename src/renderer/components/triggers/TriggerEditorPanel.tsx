import React from 'react'
import type { TriggerRule } from '../../../../main/triggers/trigger-types'
import type { VoiceProfile } from '../../../../main/tts/voice-profiles'
import type { SoundFile } from '../../../hooks/useSoundboard'
import type { AssetFile } from '../../../hooks/useAssets'
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

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm">
      <div className="absolute inset-y-0 right-0 w-full max-w-5xl border-l border-border bg-background shadow-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-6 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted">Rule Builder</p>
              <h3 className="text-xl font-semibold">
                {mode === 'create' ? 'Create Trigger' : `Edit ${draft.name}`}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                disabled={isSaving}
                className="px-4 py-2 text-sm rounded-lg bg-card border border-border hover:bg-card-hover disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onSave}
                disabled={isSaving || validationErrors.length > 0}
                className="px-4 py-2 text-sm rounded-lg bg-accent hover:bg-accent-hover text-white font-medium disabled:opacity-50 transition-colors"
              >
                {isSaving ? 'Saving...' : 'Save Trigger'}
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {validationErrors.length > 0 && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 p-4">
              <p className="text-sm font-medium text-danger">Fix these before saving:</p>
              <div className="mt-2 space-y-1">
                {validationErrors.map((error) => (
                  <p key={error} className="text-sm text-danger/90">{error}</p>
                ))}
              </div>
            </div>
          )}

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <FieldBlock label="Trigger Name">
              <input
                type="text"
                value={draft.name}
                onChange={(event) => onChange({ ...draft, name: event.target.value })}
                placeholder="Welcome VIPs"
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent transition-colors"
              />
            </FieldBlock>

            <FieldBlock label="Enabled">
              <button
                onClick={() => onChange({ ...draft, enabled: !draft.enabled })}
                className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  draft.enabled ? 'bg-success/15 text-success border border-success/30' : 'bg-card border border-border text-muted hover:bg-card-hover'
                }`}
              >
                {draft.enabled ? 'Enabled' : 'Disabled'}
              </button>
            </FieldBlock>

            <FieldBlock label="Global Cooldown (sec)">
              <NumberInput
                value={draft.cooldown}
                min={0}
                onChange={(value) => onChange({ ...draft, cooldown: value })}
              />
            </FieldBlock>

            <FieldBlock label="Per-User Cooldown (sec)">
              <NumberInput
                value={draft.userCooldown}
                min={0}
                onChange={(value) => onChange({ ...draft, userCooldown: value })}
              />
            </FieldBlock>
          </section>

          <section className="app-panel p-5">
            <SectionHeader eyebrow="Targets" title="Platforms" description="Choose where this trigger should listen." />
            <div className="mt-4 flex flex-wrap gap-2">
              {PLATFORM_OPTIONS.map((platform) => {
                const selected = draft.platforms.includes(platform.value)
                return (
                  <button
                    key={platform.value}
                    onClick={() => updateDraft(current => ({
                      ...current,
                      platforms: selected ? current.platforms.filter(i => i !== platform.value) : [...current.platforms, platform.value]
                    }))}
                    className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                      selected ? 'bg-accent/15 border-accent/30 text-accent' : 'border-border bg-background text-muted hover:text-foreground hover:bg-card-hover'
                    }`}
                  >
                    {platform.label}
                  </button>
                )
              })}
            </div>
          </section>

          <section className="app-panel p-5">
            <SectionHeader
              eyebrow="Logic" title="Conditions" description="All conditions must match before actions run."
              action={
                <button
                  onClick={() => updateDraft(current => ({ ...current, conditions: [...current.conditions, createDefaultCondition('keyword')] }))}
                  className="px-3 py-1.5 rounded-lg bg-accent/15 text-accent hover:bg-accent/25 text-sm font-medium transition-colors"
                >
                  + Add Condition
                </button>
              }
            />
            <div className="mt-6 space-y-4">
              {draft.conditions.map((condition, index) => (
                <TypeWrapper
                  key={index}
                  typeLabel="Condition Type"
                  typeValue={condition.type}
                  typeOptions={CONDITION_TYPE_OPTIONS}
                  onTypeChange={(type) => updateDraft(current => ({
                    ...current,
                    conditions: current.conditions.map((c, i) => i === index ? createDefaultCondition(type as any) : c)
                  }))}
                  onRemove={() => updateDraft(current => ({ ...current, conditions: current.conditions.filter((_, i) => i !== index) }))}
                >
                  <ConditionFields
                    condition={condition}
                    onChange={(next) => updateDraft(current => ({
                      ...current,
                      conditions: current.conditions.map((c, i) => i === index ? next : c)
                    }))}
                  />
                </TypeWrapper>
              ))}
            </div>
          </section>

          <section className="app-panel p-5">
            <SectionHeader
              eyebrow="Output" title="Actions" description="What happens when the trigger fires."
              action={
                <button
                  onClick={() => updateDraft(current => ({ ...current, actions: [...current.actions, createDefaultAction('tts')] }))}
                  className="px-3 py-1.5 rounded-lg bg-accent/15 text-accent hover:bg-accent/25 text-sm font-medium transition-colors"
                >
                  + Add Action
                </button>
              }
            />
            <div className="mt-6 space-y-4">
              {draft.actions.map((action, index) => (
                <TypeWrapper
                  key={index}
                  typeLabel="Action Type"
                  typeValue={action.type}
                  typeOptions={ACTION_TYPE_OPTIONS}
                  onTypeChange={(type) => updateDraft(current => ({
                    ...current,
                    actions: current.actions.map((a, i) => i === index ? createDefaultAction(type as any) : a)
                  }))}
                  onRemove={() => updateDraft(current => ({ ...current, actions: current.actions.filter((_, i) => i !== index) }))}
                >
                  <ActionFields
                    action={action}
                    voiceProfiles={voiceProfiles}
                    sounds={sounds}
                    images={images}
                    onChange={(next) => updateDraft(current => ({
                      ...current,
                      actions: current.actions.map((a, i) => i === index ? next : a)
                    }))}
                  />
                </TypeWrapper>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
