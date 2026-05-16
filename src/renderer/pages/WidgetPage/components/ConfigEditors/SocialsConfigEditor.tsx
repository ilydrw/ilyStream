import { useMemo } from 'react'
import {IconTrash, IconPlus} from '@tabler/icons-react'
import {
  DEFAULT_SOCIALS_CONFIG,
  type SocialsConfig,
  type SocialAccount,
  type Widget
} from '../../../../../shared/widgets'
import { NumberInput } from '../../../../components/ui/Inputs'
import { Section, Field, SwitchRow, ColorRow } from './Shared'
import { DesignSystemSection } from './DesignSystemSection'

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
    const newAccount: SocialAccount = { id: crypto.randomUUID(), platform: 'twitter', username: '@Username' }
    update('accounts', [...config.accounts, newAccount])
  }

  const removeAccount = (id: string) => {
    update('accounts', config.accounts.filter(a => a.id !== id))
  }

  const updateAccount = (id: string, updates: Partial<SocialAccount>) => {
    update('accounts', config.accounts.map(a => a.id === id ? { ...a, ...updates } : a))
  }

  return (
    <div className="flex flex-col gap-8">
      <Section label="Linked Accounts">
        <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
          {config.accounts.map((acc) => (
            <div key={acc.id} className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.03] border border-white/5 group hover:bg-white/[0.05] transition-all">
              <div className="w-8 h-8 rounded-lg bg-black/40 flex items-center justify-center shrink-0 border border-white/5 relative">
                <select
                  value={acc.platform}
                  onChange={(e) => updateAccount(acc.id, { platform: e.target.value as any })}
                  className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10"
                >
                  <option value="twitter">X</option>
                  <option value="youtube">YT</option>
                  <option value="tiktok">TT</option>
                  <option value="twitch">TW</option>
                  <option value="kick">KK</option>
                  <option value="instagram">IG</option>
                  <option value="discord">DC</option>
                  <option value="custom">CS</option>
                </select>
                <span className="text-[9px] font-black uppercase text-[#d035f1] pointer-events-none">{acc.platform.slice(0, 2)}</span>
              </div>

              <input
                type="text"
                value={acc.username}
                onChange={(e) => updateAccount(acc.id, { username: e.target.value })}
                className="flex-1 bg-transparent border-none text-xs font-bold text-white/90 outline-none placeholder:text-white/10"
                placeholder="@handle"
              />

              <button
                onClick={() => removeAccount(acc.id)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white/10 hover:text-danger hover:bg-danger/10 transition-all opacity-0 group-hover:opacity-100"
              >
                <IconTrash size={12} />
              </button>
            </div>
          ))}

          <button
            onClick={addAccount}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-white/10 text-[10px] font-black uppercase tracking-widest text-white/20 hover:border-white/20 hover:text-white hover:bg-white/[0.02] transition-all"
          >
            <IconPlus size={12} />
            Add Account
          </button>
        </div>
      </Section>

      <Section label="Rotation">
        <Field label={`Interval — ${config.interval} seconds`}>
          <input
            type="range"
            min={3}
            max={60}
            step={1}
            value={config.interval}
            onChange={(e) => update('interval', Number(e.currentTarget.value))}
            className="w-full accent-[#d035f1]"
          />
        </Field>
      </Section>

      <Section label="Layout">
        <Field label="Anchor position">
          <div className="grid grid-cols-3 gap-2">
            {(['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'] as const).map((pos) => (
              <button
                key={pos}
                onClick={() => update('position', pos)}
                className={`h-10 rounded-lg text-[10px] font-bold border transition-all ${
                  config.position === pos
                    ? 'bg-brand-gradient text-white border-transparent shadow-glow'
                    : 'bg-white/[0.03] text-white/60 border-white/10 hover:border-white/20'
                }`}
              >
                {pos.replace('-', ' ')}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Widget width (px)">
          <NumberInput
            value={config.width}
            onChange={(v) => update('width', v)}
            min={200}
            max={600}
            step={10}
            className="!w-24 !h-9 !text-xs text-right"
          />
        </Field>

        <SwitchRow
          label="Show border"
          value={config.showBorder}
          onChange={(v) => update('showBorder', v)}
        />
      </Section>

      <Section label="Appearance">
        <Field label="Theme">
          <div className="grid grid-cols-3 gap-2">
            {(['classic', 'chroma', 'cyber'] as const).map((s) => (
              <button
                key={s}
                onClick={() => update('style', s)}
                className={`h-9 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${
                  config.style === s
                    ? s === 'chroma'
                      ? 'bg-gradient-to-r from-red-500 via-green-500 to-blue-500 text-white border-transparent'
                      : s === 'cyber'
                        ? 'bg-brand-gradient text-white border-transparent shadow-glow'
                        : 'bg-brand-gradient text-white border-transparent shadow-glow'
                    : 'bg-white/[0.03] text-white/60 border-white/10 hover:border-white/20'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </Field>

        <ColorRow label="Accent" value={config.accentColor} onChange={(v) => update('accentColor', v)} />
        <ColorRow label="Background" value={config.backgroundColor || '#0b0d10'} onChange={(v) => update('backgroundColor', v)} />
      </Section>

      <DesignSystemSection config={config as any} onUpdate={update as any} />
    </div>
  )
}
