import { useState } from 'react'
import { IconVolume, IconPhoto, IconTypography, IconChevronDown } from '@tabler/icons-react'
import { IconPlus } from '../../components/ui/icons'
import { PlatformLogo } from '../../components/platforms/PlatformLogo'
import type { AlertRule, AlertRulePlatform } from '../../../shared/alert-rules'
import { EVENT_LABELS } from './AlertRuleSection'

const NEW_ROUTE_OPTIONS: Array<{ platform: AlertRulePlatform; label: string }> = [
  { platform: 'all', label: 'Shared — all platforms' },
  { platform: 'tiktok', label: 'TikTok' },
  { platform: 'twitch', label: 'Twitch' },
  { platform: 'youtube', label: 'YouTube' },
  { platform: 'kick', label: 'Kick' }
]

interface AlertRoutesPaneProps {
  rules: AlertRule[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAdd: (platform: AlertRulePlatform) => void
  onToggleEnabled: (id: string, enabled: boolean) => void
}

export function AlertRoutesPane({ rules, selectedId, onSelect, onAdd, onToggleEnabled }: AlertRoutesPaneProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const sorted = [...rules].sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name))

  return (
    <aside className="app-section-card glass !p-0 !overflow-visible flex flex-col">
      <div className="px-4 py-3.5 border-b border-white/[0.06] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-[14px] font-semibold text-white/90">Routes</h2>
          <span className="inline-flex h-5 items-center rounded-md bg-white/[0.05] px-1.5 text-[11px] font-semibold text-white/50">{rules.length}</span>
        </div>
        <div className="relative" onMouseLeave={() => setMenuOpen(false)}>
          <button onClick={() => setMenuOpen((o) => !o)} className="app-button-primary !h-8 !px-3 !text-[12px]">
            <IconPlus size={13} /> New route
            <IconChevronDown size={12} className={`transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-lg border border-white/10 bg-[#15171c] py-1 shadow-2xl">
              <div className="px-3 pb-1.5 pt-2 text-[10px] font-semibold text-white/30">Create route for</div>
              {NEW_ROUTE_OPTIONS.map((opt) => (
                <button
                  key={opt.platform}
                  onClick={() => { onAdd(opt.platform); setMenuOpen(false) }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] font-medium text-white/80 transition-colors hover:bg-white/[0.05] hover:text-white"
                >
                  {opt.platform === 'all' ? (
                    <span className="inline-flex h-4 w-5 items-center justify-center rounded bg-white/10 text-[9px] font-bold text-white/60">ALL</span>
                  ) : (
                    <PlatformLogo platform={opt.platform as any} size={15} />
                  )}
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1.5 px-6 py-16 text-center">
          <p className="text-[13px] font-medium text-white/55">No routes yet</p>
          <p className="text-[12px] leading-relaxed text-white/30">Hit “New route” to react to a follow, gift, sub, or raid.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5 p-2">
          {sorted.map((rule) => (
            <RouteListItem
              key={rule.id}
              rule={rule}
              selected={selectedId === rule.id}
              onSelect={() => onSelect(rule.id)}
              onToggleEnabled={(enabled) => onToggleEnabled(rule.id, enabled)}
            />
          ))}
        </div>
      )}
    </aside>
  )
}

function RoutePlatformBadge({ rule }: { rule: AlertRule }) {
  const platforms = rule.platforms ?? []
  if (platforms.length === 0 || platforms.includes('all')) {
    return (
      <span className="inline-flex h-5 w-8 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-[9px] font-bold tracking-wide text-white/55">
        ALL
      </span>
    )
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {platforms.slice(0, 3).map((p) => (
        <PlatformLogo key={p} platform={p as any} size={14} />
      ))}
    </span>
  )
}

interface RouteListItemProps {
  rule: AlertRule
  selected: boolean
  onSelect: () => void
  onToggleEnabled: (enabled: boolean) => void
}

function RouteListItem({ rule, selected, onSelect, onToggleEnabled }: RouteListItemProps) {
  const events = rule.eventTypes.map((e) => EVENT_LABELS[e] ?? e).join(' · ')
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
      className={`group flex items-center gap-3 rounded-md px-3 py-2.5 cursor-pointer transition-colors ${
        selected ? 'bg-accent/15 ring-1 ring-accent/40' : 'hover:bg-white/[0.04]'
      }`}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onToggleEnabled(!rule.enabled) }}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-all ${rule.enabled ? 'bg-accent' : 'bg-white/15'}`}
        title={rule.enabled ? 'Disable route' : 'Enable route'}
      >
        <span className={`absolute top-1 h-3 w-3 rounded-full bg-white shadow-sm transition-all ${rule.enabled ? 'left-5' : 'left-1'}`} />
      </button>

      <RoutePlatformBadge rule={rule} />

      <div className="min-w-0 flex-1">
        <div className={`truncate text-[13px] font-medium ${rule.enabled ? (selected ? 'text-white' : 'text-white/85') : 'text-white/40'}`}>
          {rule.name}
        </div>
        <div className={`truncate text-[11px] ${rule.enabled ? (selected ? 'text-accent/70' : 'text-white/35') : 'text-white/20'}`}>
          {events || 'no events'}
        </div>
      </div>

      <div className={`flex shrink-0 items-center gap-1.5 ${selected ? 'text-accent/80' : 'text-white/30'}`}>
        {rule.soundEnabled && <IconVolume size={13} />}
        {rule.imageEnabled && <IconPhoto size={13} />}
        {rule.textEnabled && <IconTypography size={13} />}
      </div>
    </div>
  )
}
