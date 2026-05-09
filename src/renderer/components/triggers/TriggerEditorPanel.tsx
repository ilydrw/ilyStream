import type { ReactNode } from 'react'
import type { VoiceProfile } from '../../../main/tts/voice-profiles'
import type { Action, Condition, TriggerRule } from '../../../main/triggers/trigger-types'
import type { SoundFile } from '../../hooks/useSoundboard'
import type { AssetFile } from '../../hooks/useAssets'
import {
  ACTION_TYPE_OPTIONS,
  CONDITION_TYPE_OPTIONS,
  EVENT_TYPE_OPTIONS,
  PLATFORM_OPTIONS,
  createDefaultAction,
  createDefaultCondition,
  describeAction,
  describeCondition
} from '../../lib/trigger-editor'

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

  const setCondition = (index: number, nextCondition: Condition) => {
    updateDraft((current) => ({
      ...current,
      conditions: current.conditions.map((condition, conditionIndex) =>
        conditionIndex === index ? nextCondition : condition
      )
    }))
  }

  const setAction = (index: number, nextAction: Action) => {
    updateDraft((current) => ({
      ...current,
      actions: current.actions.map((action, actionIndex) =>
        actionIndex === index ? nextAction : action
      )
    }))
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
                  <p key={error} className="text-sm text-danger/90">
                    {error}
                  </p>
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
                  draft.enabled
                    ? 'bg-success/15 text-success border border-success/30'
                    : 'bg-card border border-border text-muted hover:bg-card-hover'
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
            <SectionHeader
              eyebrow="Targets"
              title="Platforms"
              description="Choose where this trigger should listen."
            />

            <div className="mt-4 flex flex-wrap gap-2">
              {PLATFORM_OPTIONS.map((platform) => {
                const selected = draft.platforms.includes(platform.value)
                return (
                  <button
                    key={platform.value}
                    onClick={() =>
                      updateDraft((current) => ({
                        ...current,
                        platforms: selected
                          ? current.platforms.filter((item) => item !== platform.value)
                          : [...current.platforms, platform.value]
                      }))
                    }
                    className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                      selected
                        ? 'bg-accent/15 border-accent/30 text-accent'
                        : 'border-border bg-background text-muted hover:text-foreground hover:bg-card-hover'
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
              eyebrow="Logic"
              title="Conditions"
              description="All conditions must match before actions run."
              action={
                <button
                  onClick={() =>
                    updateDraft((current) => ({
                      ...current,
                      conditions: [...current.conditions, createDefaultCondition('keyword')]
                    }))
                  }
                  className="px-3 py-1.5 rounded-lg bg-accent/15 text-accent hover:bg-accent/25 text-sm font-medium transition-colors"
                >
                  + Add Condition
                </button>
              }
            />

            <div className="mt-4 space-y-4">
              {draft.conditions.map((condition, index) => (
                <EditorCard
                  key={`condition-${index}`}
                  typeLabel="Condition Type"
                  typeValue={condition.type}
                  onTypeChange={(value) =>
                    setCondition(index, createDefaultCondition(value as Condition['type']))
                  }
                  typeOptions={CONDITION_TYPE_OPTIONS}
                  onRemove={() =>
                    updateDraft((current) => ({
                      ...current,
                      conditions: current.conditions.filter((_, conditionIndex) => conditionIndex !== index)
                    }))
                  }
                >
                  <ConditionFields
                    condition={condition}
                    onChange={(nextCondition) => setCondition(index, nextCondition)}
                  />
                </EditorCard>
              ))}
            </div>
          </section>

          <section className="app-panel p-5">
            <SectionHeader
              eyebrow="Output"
              title="Actions"
              description="Actions run in order when the trigger matches."
              action={
                <button
                  onClick={() =>
                    updateDraft((current) => ({
                      ...current,
                      actions: [...current.actions, createDefaultAction('tts')]
                    }))
                  }
                  className="px-3 py-1.5 rounded-lg bg-accent/15 text-accent hover:bg-accent/25 text-sm font-medium transition-colors"
                >
                  + Add Action
                </button>
              }
            />

            <div className="mt-4 space-y-4">
              {draft.actions.map((action, index) => (
                <EditorCard
                  key={`action-${index}`}
                  typeLabel="Action Type"
                  typeValue={action.type}
                  onTypeChange={(value) =>
                    setAction(index, createDefaultAction(value as Action['type']))
                  }
                  typeOptions={ACTION_TYPE_OPTIONS}
                  onRemove={() =>
                    updateDraft((current) => ({
                      ...current,
                      actions: current.actions.filter((_, actionIndex) => actionIndex !== index)
                    }))
                  }
                >
                  <ActionFields
                    action={action}
                    voiceProfiles={voiceProfiles}
                    sounds={sounds}
                    images={images}
                    onChange={(nextAction) => setAction(index, nextAction)}
                  />
                </EditorCard>
              ))}
            </div>
          </section>

          <section className="app-panel p-5">
            <SectionHeader
              eyebrow="Preview"
              title="What this rule does"
              description="Use placeholders like {username}, {message}, {platform}, and {event_type} in templates."
            />

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <SummaryGroup
                title="Conditions"
                items={draft.conditions.map((condition) => describeCondition(condition))}
              />
              <SummaryGroup
                title="Actions"
                items={draft.actions.map((action) => describeAction(action))}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function EditorCard({
  typeLabel,
  typeValue,
  onTypeChange,
  typeOptions,
  onRemove,
  children
}: {
  typeLabel: string
  typeValue: string
  onTypeChange: (value: string) => void
  typeOptions: Array<{ value: string; label: string }>
  onRemove: () => void
  children: ReactNode
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="lg:w-64">
          <label className="text-xs text-muted mb-1 block">{typeLabel}</label>
          <select
            value={typeValue}
            onChange={(event) => onTypeChange(event.target.value)}
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {typeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 grid gap-3">{children}</div>

        <button
          onClick={onRemove}
          className="px-3 py-2 text-sm rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition-colors"
        >
          Remove
        </button>
      </div>
    </div>
  )
}

function ConditionFields({
  condition,
  onChange
}: {
  condition: Condition
  onChange: (condition: Condition) => void
}) {
  switch (condition.type) {
    case 'event_type':
      return (
        <FieldBlock label="Event">
          <select
            value={condition.value}
            onChange={(event) => onChange({ ...condition, value: event.target.value as typeof condition.value })}
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {EVENT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FieldBlock>
      )

    case 'keyword':
      return (
        <div className="grid gap-3 md:grid-cols-3">
          <FieldBlock label="Keyword or Pattern">
            <input
              type="text"
              value={condition.value}
              onChange={(event) => onChange({ ...condition, value: event.target.value })}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </FieldBlock>
          <FieldBlock label="Match Mode">
            <select
              value={condition.matchMode}
              onChange={(event) =>
                onChange({ ...condition, matchMode: event.target.value as typeof condition.matchMode })
              }
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="contains">Contains</option>
              <option value="exact">Exact</option>
              <option value="starts_with">Starts With</option>
              <option value="regex">Regex</option>
            </select>
          </FieldBlock>
          <FieldBlock label="Case Sensitive">
            <button
              onClick={() => onChange({ ...condition, caseSensitive: !condition.caseSensitive })}
              className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                condition.caseSensitive
                  ? 'bg-accent/15 text-accent border border-accent/30'
                  : 'bg-card border border-border text-muted hover:bg-card-hover'
              }`}
            >
              {condition.caseSensitive ? 'Enabled' : 'Disabled'}
            </button>
          </FieldBlock>
        </div>
      )

    case 'gift_value_gte':
      return (
        <FieldBlock label="Minimum Value (cents)">
          <NumberInput
            value={condition.value}
            min={0}
            onChange={(value) => onChange({ ...condition, value })}
          />
        </FieldBlock>
      )

    case 'user_role':
      return (
        <FieldBlock label="Required Role">
          <select
            value={condition.value}
            onChange={(event) => onChange({ ...condition, value: event.target.value as typeof condition.value })}
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="moderator">Moderator</option>
            <option value="subscriber">Subscriber</option>
            <option value="vip">VIP / Broadcaster</option>
          </select>
        </FieldBlock>
      )

    case 'username':
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <FieldBlock label="Username">
            <input
              type="text"
              value={condition.value}
              onChange={(event) => onChange({ ...condition, value: event.target.value })}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </FieldBlock>
          <FieldBlock label="Match Mode">
            <select
              value={condition.matchMode}
              onChange={(event) =>
                onChange({ ...condition, matchMode: event.target.value as typeof condition.matchMode })
              }
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="exact">Exact</option>
              <option value="contains">Contains</option>
            </select>
          </FieldBlock>
        </div>
      )

    case 'viewer_count_gte':
      return (
        <FieldBlock label="Minimum Viewer Count">
          <NumberInput
            value={condition.value}
            min={0}
            onChange={(value) => onChange({ ...condition, value })}
          />
        </FieldBlock>
      )

    case 'user_status':
      return (
        <FieldBlock label="User Status Type">
          <select
            value={condition.status}
            onChange={(event) => onChange({ ...condition, status: event.target.value as any })}
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="is_super_fan">Super Fan (VIP/High Level/Top Gifter)</option>
            <option value="is_fan_club">Fan Club Member</option>
            <option value="is_team">Team Member</option>
          </select>
        </FieldBlock>
      )
  }
}

function ActionFields({
  action,
  voiceProfiles,
  sounds,
  onChange
}: {
  action: Action
  voiceProfiles: VoiceProfile[]
  sounds: SoundFile[]
  images: AssetFile[]
  onChange: (action: Action) => void
}) {
  switch (action.type) {
    case 'tts':
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <FieldBlock label="Voice Profile">
            <select
              value={action.voiceProfileId ?? ''}
              onChange={(event) => onChange({ ...action, voiceProfileId: event.target.value || undefined })}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="">Default Voice</option>
              {voiceProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </FieldBlock>
          <FieldBlock label="Template">
            <textarea
              value={action.template ?? ''}
              onChange={(event) => onChange({ ...action, template: event.target.value })}
              rows={4}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent resize-y"
            />
          </FieldBlock>
        </div>
      )

    case 'play_sound':
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <FieldBlock label="Sound">
            <select
              value={action.filePath}
              onChange={(event) => onChange({ ...action, filePath: event.target.value })}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="">Select a sound...</option>
              {sounds.map((sound) => (
                <option key={sound.id} value={sound.id}>
                  {sound.name}
                </option>
              ))}
            </select>
          </FieldBlock>
          <FieldBlock label="Volume">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={action.volume}
              onChange={(event) => onChange({ ...action, volume: Number(event.target.value) })}
              className="w-full accent-accent"
            />
            <p className="mt-1 text-xs text-muted">{Math.round(action.volume * 100)}%</p>
          </FieldBlock>
        </div>
      )

    case 'show_alert':
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <FieldBlock label="HTML Template">
            <textarea
              value={action.template}
              onChange={(event) => onChange({ ...action, template: event.target.value })}
              rows={5}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent resize-y"
            />
          </FieldBlock>
          <div className="grid gap-3">
            <FieldBlock label="Duration (ms)">
              <NumberInput
                value={action.durationMs}
                min={100}
                step={100}
                onChange={(value) => onChange({ ...action, durationMs: value })}
              />
            </FieldBlock>
            <FieldBlock label="Animation In">
              <select
                value={action.animationIn}
                onChange={(event) => onChange({ ...action, animationIn: event.target.value as typeof action.animationIn })}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="fade">Fade</option>
                <option value="slide">Slide</option>
                <option value="bounce">Bounce</option>
                <option value="zoom">Zoom</option>
                <option value="wave">Wave</option>
              </select>
            </FieldBlock>
            <FieldBlock label="Animation Out">
              <select
                value={action.animationOut}
                onChange={(event) => onChange({ ...action, animationOut: event.target.value as typeof action.animationOut })}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="fade">Fade</option>
                <option value="slide">Slide</option>
                <option value="dissolve">Dissolve</option>
              </select>
            </FieldBlock>
            <FieldBlock label="Alert Image">
              <select
                value={action.imageUrl || ''}
                onChange={(event) => onChange({ ...action, imageUrl: event.target.value || undefined })}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="">No Image</option>
                {images.map((image) => (
                  <option key={image.id} value={image.id}>
                    {image.name}
                  </option>
                ))}
              </select>
            </FieldBlock>
            <FieldBlock label="Alert Sound">
              <select
                value={action.audioUrl || ''}
                onChange={(event) => onChange({ ...action, audioUrl: event.target.value || undefined })}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="">No Sound</option>
                {sounds.map((sound) => (
                  <option key={sound.id} value={sound.id}>
                    {sound.name}
                  </option>
                ))}
              </select>
            </FieldBlock>
          </div>
        </div>
      )

    case 'http_webhook':
      return (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
            <FieldBlock label="URL">
              <input
                type="url"
                value={action.url}
                onChange={(event) => onChange({ ...action, url: event.target.value })}
                placeholder="https://example.com/webhook"
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </FieldBlock>
            <FieldBlock label="Method">
              <select
                value={action.method}
                onChange={(event) => onChange({ ...action, method: event.target.value as typeof action.method })}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
              </select>
            </FieldBlock>
          </div>

          <FieldBlock label="Headers">
            <div className="space-y-2">
              {Object.entries(action.headers).length === 0 && (
                <p className="text-xs text-muted">No custom headers yet.</p>
              )}
              {Object.entries(action.headers).map(([key, value]) => (
                <HeaderRow
                  key={key}
                  headerKey={key}
                  value={value}
                  onChange={(nextKey, nextValue) =>
                    onChange({
                      ...action,
                      headers: replaceHeader(action.headers, key, nextKey, nextValue)
                    })
                  }
                  onRemove={() =>
                    onChange({
                      ...action,
                      headers: removeHeader(action.headers, key)
                    })
                  }
                />
              ))}
              <button
                onClick={() =>
                  onChange({
                    ...action,
                    headers: {
                      ...action.headers,
                      [`Header-${Object.keys(action.headers).length + 1}`]: ''
                    }
                  })
                }
                className="text-xs px-3 py-1.5 rounded-lg bg-card hover:bg-card-hover border border-border transition-colors"
              >
                + Add Header
              </button>
            </div>
          </FieldBlock>

          <FieldBlock label="Body">
            <textarea
              value={action.body}
              onChange={(event) => onChange({ ...action, body: event.target.value })}
              rows={5}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent resize-y"
            />
          </FieldBlock>
        </div>
      )

    case 'obs_set_scene':
      return (
        <FieldBlock label="Scene Name">
          <input
            type="text"
            value={action.sceneName}
            onChange={(event) => onChange({ ...action, sceneName: event.target.value })}
            placeholder="Gameplay"
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </FieldBlock>
      )

    case 'obs_set_source_visibility':
      return (
        <div className="grid gap-3 md:grid-cols-3">
          <FieldBlock label="Scene Name">
            <input
              type="text"
              value={action.sceneName}
              onChange={(event) => onChange({ ...action, sceneName: event.target.value })}
              placeholder="Gameplay"
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </FieldBlock>
          <FieldBlock label="Source Name">
            <input
              type="text"
              value={action.sourceName}
              onChange={(event) => onChange({ ...action, sourceName: event.target.value })}
              placeholder="Camera"
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </FieldBlock>
          <FieldBlock label="Visibility">
            <button
              onClick={() => onChange({ ...action, visible: !action.visible })}
              className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                action.visible
                  ? 'bg-success/15 text-success border border-success/30'
                  : 'bg-card border border-border text-muted hover:bg-card-hover'
              }`}
            >
              {action.visible ? 'Visible' : 'Hidden'}
            </button>
          </FieldBlock>
        </div>
      )

    case 'obs_toggle_source_visibility':
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <FieldBlock label="Scene Name">
            <input
              type="text"
              value={action.sceneName}
              onChange={(event) => onChange({ ...action, sceneName: event.target.value })}
              placeholder="Gameplay"
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </FieldBlock>
          <FieldBlock label="Source Name">
            <input
              type="text"
              value={action.sourceName}
              onChange={(event) => onChange({ ...action, sourceName: event.target.value })}
              placeholder="Be Right Back"
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </FieldBlock>
        </div>
      )

    case 'run_command':
      return (
        <FieldBlock label="Command">
          <input
            type="text"
            value={action.command}
            onChange={(event) => onChange({ ...action, command: event.target.value })}
            placeholder="powershell -File scripts\\notify.ps1"
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </FieldBlock>
      )

    case 'ai_respond':
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <FieldBlock label="Output To">
            <select
              value={action.output}
              onChange={(event) => onChange({ ...action, output: event.target.value as any })}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="chat">Chat Only</option>
              <option value="tts">TTS Only</option>
              <option value="both">Both Chat & TTS</option>
            </select>
          </FieldBlock>
          <FieldBlock label="Voice Profile (for TTS)">
            <select
              value={action.voiceProfileId || ''}
              onChange={(event) =>
                onChange({ ...action, voiceProfileId: event.target.value || undefined })
              }
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="">Default Voice</option>
              {voiceProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name} ({profile.provider})
                </option>
              ))}
            </select>
          </FieldBlock>
          <div className="md:col-span-2">
            <FieldBlock label="System Prompt Override (Optional)">
              <textarea
                value={action.systemPrompt || ''}
                onChange={(event) =>
                  onChange({ ...action, systemPrompt: event.target.value || undefined })
                }
                placeholder="e.g. Respond as a grumpy pirate."
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent min-h-[80px]"
              />
            </FieldBlock>
          </div>
        </div>
      )

    case 'voicemod_voice':
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <FieldBlock label="Voice ID (Voicemod)">
            <input
              type="text"
              value={action.voiceId}
              onChange={(e) => onChange({ ...action, voiceId: e.target.value })}
              placeholder="VOICE_CHIPMUNK"
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </FieldBlock>
          <FieldBlock label="Duration (Seconds)">
            <NumberInput
              value={action.durationSec}
              min={1}
              onChange={(val) => onChange({ ...action, durationSec: val })}
            />
          </FieldBlock>
        </div>
      )

    case 'voicemod_sound':
      return (
        <FieldBlock label="Sound ID (Voicemod)">
          <input
            type="text"
            value={action.soundId}
            onChange={(e) => onChange({ ...action, soundId: e.target.value })}
            placeholder="SOUND_FAIL_HORN"
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </FieldBlock>
      )

    case 'vtube_expression':
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <FieldBlock label="Expression ID">
            <input
              type="text"
              value={action.expressionId}
              onChange={(e) => onChange({ ...action, expressionId: e.target.value })}
              placeholder="Blush"
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </FieldBlock>
          <FieldBlock label="Toggle Mode">
            <button
              onClick={() => onChange({ ...action, toggle: !action.toggle })}
              className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                action.toggle ? 'bg-accent/15 text-accent border border-accent/30' : 'bg-card border border-border text-muted'
              }`}
            >
              {action.toggle ? 'Toggle (On/Off)' : 'Trigger Once'}
            </button>
          </FieldBlock>
        </div>
      )

    case 'vtube_animation':
      return (
        <FieldBlock label="Animation ID">
          <input
            type="text"
            value={action.animationId}
            onChange={(e) => onChange({ ...action, animationId: e.target.value })}
            placeholder="WaveArms"
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </FieldBlock>
      )

    case 'vtube_throw':
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <FieldBlock label="Item ID">
            <input
              type="text"
              value={action.itemId}
              onChange={(e) => onChange({ ...action, itemId: e.target.value })}
              placeholder="CoffeeCup"
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </FieldBlock>
          <FieldBlock label="Amount">
            <NumberInput
              value={action.count || 1}
              min={1}
              onChange={(val) => onChange({ ...action, count: val })}
            />
          </FieldBlock>
        </div>
      )

    case 'discord_embed':
      return (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <FieldBlock label="Embed Title">
              <input
                type="text"
                value={action.title || ''}
                onChange={(e) => onChange({ ...action, title: e.target.value })}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </FieldBlock>
            <FieldBlock label="Color (Hex)">
              <input
                type="color"
                value={action.color || '#ff00ff'}
                onChange={(e) => onChange({ ...action, color: e.target.value })}
                className="w-full h-10 bg-card border border-border rounded-lg px-1 py-1 outline-none focus:border-accent"
              />
            </FieldBlock>
          </div>
          <FieldBlock label="Description">
            <textarea
              value={action.description || ''}
              onChange={(e) => onChange({ ...action, description: e.target.value })}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent min-h-[80px]"
            />
          </FieldBlock>
        </div>
      )

    case 'physics_spawn':
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <FieldBlock label="Amount of Objects">
            <NumberInput
              value={action.amount || 1}
              min={1}
              onChange={(val) => onChange({ ...action, amount: val })}
            />
          </FieldBlock>
          <FieldBlock label="Gravity Override">
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={action.gravityOverride || 1}
              onChange={(e) => onChange({ ...action, gravityOverride: Number(e.target.value) })}
              className="w-full accent-accent"
            />
            <p className="mt-1 text-xs text-muted">{(action.gravityOverride || 1).toFixed(1)}x</p>
          </FieldBlock>
        </div>
      )
  }
}

function SummaryGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/15 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-muted">{title}</p>
      <div className="mt-3 space-y-2">
        {items.map((item, index) => (
          <p key={`${title}-${index}`} className="text-sm text-foreground/90">
            {item}
          </p>
        ))}
      </div>
    </div>
  )
}

function SectionHeader({
  eyebrow,
  title,
  description,
  action
}: {
  eyebrow: string
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-muted">{eyebrow}</p>
        <h4 className="mt-1 text-lg font-semibold">{title}</h4>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
      {action}
    </div>
  )
}

function FieldBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted mb-1 block">{label}</label>
      {children}
    </div>
  )
}

function NumberInput({
  value,
  min,
  onChange,
  step = 1
}: {
  value: number
  min: number
  onChange: (value: number) => void
  step?: number
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      step={step}
      onChange={(event) => onChange(Math.max(min, Number(event.target.value) || 0))}
      className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent transition-colors"
    />
  )
}

function HeaderRow({
  headerKey,
  value,
  onChange,
  onRemove
}: {
  headerKey: string
  value: string
  onChange: (key: string, value: string) => void
  onRemove: () => void
}) {
  return (
    <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
      <input
        type="text"
        value={headerKey}
        onChange={(event) => onChange(event.target.value, value)}
        className="bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
      />
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(headerKey, event.target.value)}
        className="bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
      />
      <button
        onClick={onRemove}
        className="px-3 py-2 rounded-lg text-sm text-muted hover:text-danger hover:bg-danger/10 transition-colors"
      >
        Remove
      </button>
    </div>
  )
}

function replaceHeader(
  headers: Record<string, string>,
  previousKey: string,
  nextKey: string,
  nextValue: string
): Record<string, string> {
  const nextHeaders: Record<string, string> = {}

  for (const [key, value] of Object.entries(headers)) {
    if (key === previousKey) continue
    nextHeaders[key] = value
  }

  if (nextKey.trim().length > 0) {
    nextHeaders[nextKey] = nextValue
  }

  return nextHeaders
}

function removeHeader(
  headers: Record<string, string>,
  keyToRemove: string
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => key !== keyToRemove)
  )
}
