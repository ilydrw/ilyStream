import type { Platform } from '../../../main/platforms/types'
import type { TriggerRule } from '../../../main/triggers/trigger-types'
import {
  PLATFORM_OPTIONS,
  describeAction,
  describeCondition
} from '../../lib/trigger-editor'

const platformBadgeStyles: Record<Platform, string> = {
  tiktok: 'bg-tiktok/15 text-tiktok border border-tiktok/30',
  twitch: 'bg-twitch/15 text-twitch border border-twitch/30',
  youtube: 'bg-youtube/15 text-youtube border border-youtube/30',
  kick: 'bg-kick/15 text-kick border border-kick/30'
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
  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 transition-all hover:bg-white/[0.03] hover:border-white/10 group">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
        <div className="flex items-center gap-6 flex-1">
          <button
            onClick={onToggle}
            className={`w-12 h-6 rounded-full transition-all relative shrink-0 border border-white/10 ${
              trigger.enabled ? 'bg-white' : 'bg-white/5'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full absolute top-1 transition-all ${
                trigger.enabled ? 'left-7 bg-black' : 'left-1 bg-white/40'
              }`}
            />
          </button>

          <div className="min-width-0 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h4 className="font-black text-lg tracking-tight text-white">{trigger.name}</h4>
              <div className={trigger.enabled ? 'app-chip-accent' : 'app-chip'}>
                {trigger.enabled ? 'Active' : 'Paused'}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {trigger.platforms.map((platform) => (
                <span
                  key={platform}
                  className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${platformBadgeStyles[platform]}`}
                >
                  {PLATFORM_OPTIONS.find((option) => option.value === platform)?.label ?? platform}
                </span>
              ))}
              <div className="h-4 w-[1px] bg-white/10 mx-1 hidden sm:block" />
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                {trigger.conditions.length} Conditions
              </span>
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                • {trigger.actions.length} Actions
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            className="app-button !h-9 !px-4"
          >
            Edit Rule
          </button>
          <button
            onClick={onDelete}
            className="app-button-danger !h-9 !px-4"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <SummaryGroup
          title="Execution Logic"
          items={trigger.conditions.map((condition) => describeCondition(condition))}
        />
        <SummaryGroup
          title="Response Payload"
          items={trigger.actions.map((action) => describeAction(action))}
        />
      </div>
    </div>
  )
}

function SummaryGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 p-4">
      <p className="app-eyebrow text-[9px] text-white/20 mb-3">{title}</p>
      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-xs text-white/20 italic">No configuration detected</p>
        ) : (
          items.map((item, index) => (
            <div key={`${title}-${index}`} className="flex items-start gap-2">
              <div className="w-1 h-1 rounded-full bg-white/20 mt-1.5 shrink-0" />
              <p className="text-xs font-medium text-white/70 leading-relaxed">
                {item}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

