import { useMemo } from 'react'
import { IconTrash, IconPlus } from '../../../../components/ui/icons'
import {
  DEFAULT_SOCIALS_CONFIG,
  type SocialsConfig,
  type SocialAccount,
  type Widget
} from '../../../../../shared/widgets'
import { Section, Slider, PositionGrid, ColorRow, SegmentedRow } from './Shared'
import { DesignSystemSection } from './DesignSystemSection'

const POSITIONS = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right'
] as const

const PLATFORM_OPTIONS: Array<{ value: SocialAccount['platform']; label: string; short: string }> = [
  { value: 'twitter', label: 'X / Twitter', short: 'X' },
  { value: 'youtube', label: 'YouTube', short: 'YT' },
  { value: 'tiktok', label: 'TikTok', short: 'TT' },
  { value: 'twitch', label: 'Twitch', short: 'TW' },
  { value: 'kick', label: 'Kick', short: 'KK' },
  { value: 'instagram', label: 'Instagram', short: 'IG' },
  { value: 'discord', label: 'Discord', short: 'DC' },
  { value: 'custom', label: 'Custom', short: '···' }
]

export function SocialsConfigEditor({
  draft,
  onChange
}: {
  draft: Widget
  onChange: (next: Widget) => void
}) {
  const config = useMemo<SocialsConfig>(
    () => ({ ...DEFAULT_SOCIALS_CONFIG, ...(draft.config as Partial<SocialsConfig>) }),
    [draft.config]
  )

  const update = <K extends keyof SocialsConfig>(key: K, value: SocialsConfig[K]) => {
    onChange({ ...draft, config: { ...config, [key]: value } })
  }

  const addAccount = () => {
    const newAccount: SocialAccount = { id: crypto.randomUUID(), platform: 'twitter', username: '@handle' }
    update('accounts', [...config.accounts, newAccount])
  }

  const removeAccount = (id: string) => {
    update('accounts', config.accounts.filter((a) => a.id !== id))
  }

  const updateAccount = (id: string, updates: Partial<SocialAccount>) => {
    update('accounts', config.accounts.map((a) => (a.id === id ? { ...a, ...updates } : a)))
  }

  return (
    <div className="flex flex-col gap-8">
      <Section
        label="Accounts"
        description="Handles rotate one at a time in the order below."
      >
        <div className="flex flex-col gap-2 max-h-[340px] overflow-y-auto custom-scrollbar pr-1">
          {config.accounts.map((acc) => {
            const platform = PLATFORM_OPTIONS.find((p) => p.value === acc.platform)
            return (
              <div
                key={acc.id}
                className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/10 group hover:border-white/20 transition-all"
              >
                <div
                  className="w-9 h-9 rounded-md bg-black/40 flex items-center justify-center shrink-0 border border-white/10 relative"
                  title={platform?.label}
                >
                  <select
                    value={acc.platform}
                    onChange={(e) => updateAccount(acc.id, { platform: e.target.value as SocialAccount['platform'] })}
                    className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10"
                    aria-label="Account platform"
                  >
                    {PLATFORM_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                  <span className="text-[10px] font-semibold text-accent pointer-events-none">
                    {platform?.short ?? '?'}
                  </span>
                </div>

                <input
                  type="text"
                  value={acc.username}
                  onChange={(e) => updateAccount(acc.id, { username: e.target.value })}
                  className="flex-1 bg-transparent border-none text-[12px] font-semibold text-white/90 outline-none placeholder:text-white/20"
                  placeholder="@handle"
                  aria-label="Account handle"
                />

                <button
                  onClick={() => removeAccount(acc.id)}
                  className="w-8 h-8 rounded-md flex items-center justify-center text-white/20 hover:text-danger hover:bg-danger/10 transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                  aria-label={`Remove ${acc.username}`}
                >
                  <IconTrash size={13} />
                </button>
              </div>
            )
          })}

          <button
            onClick={addAccount}
            className="flex items-center justify-center gap-2 h-9 rounded-lg border border-dashed border-white/15 text-[11px] font-semibold text-white/40 hover:border-white/30 hover:text-white/80 hover:bg-white/[0.02] transition-all cursor-pointer"
          >
            <IconPlus size={13} />
            Add account
          </button>
        </div>
      </Section>

      <Section label="Rotation">
        <Slider
          label="Time per handle"
          value={config.interval}
          min={3}
          max={60}
          unit="s"
          onChange={(v) => update('interval', v)}
        />
        <SegmentedRow
          label="Transition"
          value={config.animation}
          options={[
            { value: 'roll', label: 'Roll' },
            { value: 'fade', label: 'Fade' },
            { value: 'slide', label: 'Slide' }
          ]}
          onChange={(v) => update('animation', v)}
        />
      </Section>

      <Section label="Placement">
        <PositionGrid
          label="Anchor"
          value={config.position}
          allowed={POSITIONS}
          onChange={(v) => update('position', v)}
        />
        <Slider
          label="Widget width"
          value={config.width}
          min={200}
          max={600}
          step={10}
          unit="px"
          onChange={(v) => update('width', v)}
        />
      </Section>

      <Section label="Style">
        <SegmentedRow
          label="Look"
          value={config.style}
          options={[
            { value: 'classic', label: 'Classic' },
            { value: 'chroma', label: 'Chroma' },
            { value: 'cyber', label: 'Cyber' },
            { value: 'gob-the-stopper', label: 'Gob' }
          ]}
          onChange={(v) => update('style', v)}
        />
        <ColorRow label="Accent" value={config.accentColor} onChange={(v) => update('accentColor', v)} />
        <ColorRow label="Background" value={config.backgroundColor || '#0b0d10'} onChange={(v) => update('backgroundColor', v)} />
      </Section>

      <DesignSystemSection
        config={config}
        onUpdate={update as (key: string, value: unknown) => void}
        features={{ font: true, radius: true, glass: true, animation: false }}
      />
    </div>
  )
}
