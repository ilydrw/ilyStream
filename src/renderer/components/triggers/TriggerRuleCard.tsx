import { useState } from 'react'
import type { Platform } from '../../../main/platforms/types'
import type { TriggerRule } from '../../../main/triggers/trigger-types'
import {
  PLATFORM_OPTIONS,
  describeAction,
  describeCondition
} from '../../lib/trigger-editor'

const platformBadgeStyles: Partial<Record<Platform, string>> = {
  tiktok: 'bg-tiktok/15 text-tiktok border-tiktok/30',
  twitch: 'bg-twitch/15 text-twitch border-twitch/30',
  youtube: 'bg-youtube/15 text-youtube border-youtube/30',
  kick: 'bg-kick/15 text-kick border-kick/30'
}

export function TriggerRuleCard({
  trigger,
  onToggle,
  onEdit,
  onDelete
}: {
  trigger: TriggerRule
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const cooldownSummary = describeCooldown(trigger)

  return (
    <article
      className={`automation-rule-card rounded-xl border transition-colors ${
        trigger.enabled
          ? 'border-white/10 bg-white/[0.025] hover:border-white/15'
          : 'border-white/5 bg-black/15 opacity-80 hover:opacity-100'
      }`}
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={trigger.enabled}
            aria-label={`${trigger.enabled ? 'Pause' : 'Enable'} ${trigger.name}`}
            onClick={onToggle}
            className={`mt-0.5 flex h-8 shrink-0 items-center gap-2 rounded-full border px-2.5 text-[10px] font-semibold transition-colors ${
              trigger.enabled
                ? 'border-success/30 bg-success/10 text-success'
                : 'border-white/10 bg-white/[0.03] text-white/35 hover:text-white'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${trigger.enabled ? 'bg-success' : 'bg-white/25'}`} />
            {trigger.enabled ? 'On' : 'Off'}
          </button>

          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold tracking-tight text-white">
              {trigger.name}
            </h3>
            <div className="automation-rule-meta flex flex-wrap items-center gap-1.5">
              {trigger.platforms.map((platform) => (
                <span
                  key={platform}
                  className={`automation-platform-badge rounded-md border text-[9px] font-semibold ${
                    platformBadgeStyles[platform] ?? 'border-white/10 bg-white/5 text-white/60'
                  }`}
                >
                  {PLATFORM_OPTIONS.find((option) => option.value === platform)?.label ?? platform}
                </span>
              ))}
              {cooldownSummary && (
                <span className="ml-1 text-[10px] text-white/30">{cooldownSummary}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {confirmingDelete ? (
            <>
              <span className="mr-1 text-xs text-danger">Delete this rule?</span>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="app-button !h-9 !px-3"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="app-button-danger !h-9 !px-3"
              >
                Delete rule
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onEdit} className="app-button !h-9 !px-4">
                Edit
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="app-button-danger !h-9 !px-3"
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      <div className="automation-rule-flow grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-stretch">
        <SummaryGroup
          label="When"
          helper={trigger.conditions.length > 1 ? 'All conditions must match' : 'Event condition'}
          items={trigger.conditions.map(describeConditionForFlow)}
        />
        <div className="hidden items-center justify-center px-1 text-lg text-white/15 lg:flex" aria-hidden="true">
          →
        </div>
        <SummaryGroup
          label="Then"
          helper={trigger.actions.length > 1 ? 'Runs these actions in order' : 'Automation action'}
          items={trigger.actions.map(describeAction)}
        />
      </div>
    </article>
  )
}

function SummaryGroup({
  label,
  helper,
  items
}: {
  label: string
  helper: string
  items: string[]
}) {
  return (
    <div className="automation-rule-summary rounded-lg border border-white/5 bg-black/20">
      <div className="automation-rule-summary-head flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">{label}</p>
        <p className="text-[10px] text-white/25">{helper}</p>
      </div>
      <div className="flex flex-col gap-2">
        {items.length === 0 ? (
          <p className="text-xs italic text-white/25">Nothing configured</p>
        ) : (
          items.map((item, index) => (
            <div key={`${label}-${index}`} className="flex items-start gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-white/25" />
              <p className="text-xs font-medium leading-relaxed text-white/70">{item}</p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function describeCooldown(trigger: TriggerRule): string | null {
  const parts: string[] = []

  if (trigger.cooldown > 0) parts.push(`${trigger.cooldown}s rule cooldown`)
  if (trigger.userCooldown > 0) parts.push(`${trigger.userCooldown}s per viewer`)

  return parts.length > 0 ? parts.join(' · ') : null
}

function describeConditionForFlow(condition: TriggerRule['conditions'][number]): string {
  const description = describeCondition(condition).replace(/^When\s+/i, '')
  return description.charAt(0).toLocaleUpperCase() + description.slice(1)
}
