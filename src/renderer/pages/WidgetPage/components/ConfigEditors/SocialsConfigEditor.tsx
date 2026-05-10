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
      <Section label="Accounts">
        <div className="flex flex-col gap-3">
          {config.accounts.map((acc) => (
            <div key={acc.id} className="flex flex-col gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/5 group relative">
              <button 
                onClick={() => removeAccount(acc.id)}
                className="absolute top-2 right-2 w-7 h-7 rounded-lg flex items-center justify-center text-white/20 hover:text-danger hover:bg-danger/10 transition-all opacity-0 group-hover:opacity-100"
              >
                <IconTrash size={13} />
              </button>
              
              <div className="grid grid-cols-2 gap-3">
                <Field label="Platform">
                  <select
                    value={acc.platform}
                    onChange={(e) => updateAccount(acc.id, { platform: e.target.value as any })}
                    className="app-input !h-9 !text-xs !px-2 bg-white/[0.05] border-white/10"
                  >
                    <option value="twitter">Twitter / X</option>
                    <option value="youtube">YouTube</option>
                    <option value="tiktok">TikTok</option>
                    <option value="twitch">Twitch</option>
                    <option value="kick">Kick</option>
                    <option value="instagram">Instagram</option>
                    <option value="discord">Discord</option>
                    <option value="custom">Custom</option>
                  </select>
                </Field>
                <Field label="Username">
                  <input
                    type="text"
                    value={acc.username}
                    onChange={(e) => updateAccount(acc.id, { username: e.target.value })}
                    className="app-input !h-9 !text-xs !px-3"
                    placeholder="@handle"
                  />
                </Field>
              </div>
            </div>
          ))}
          <button
            onClick={addAccount}
            className="flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-white/10 text-white/40 hover:border-white/20 hover:text-white transition-all text-xs font-bold"
          >
            <IconPlus size={14} />
            Add Social Account
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
            className="w-full accent-white"
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
                    ? 'bg-white text-black border-white'
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
                        ? 'bg-gradient-to-r from-[#D035F1] to-[#19C8FF] text-white border-transparent'
                        : 'bg-white text-black border-white'
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
        
        <Field label={`Background opacity — ${Math.round(config.backgroundOpacity * 100)}%`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={config.backgroundOpacity}
            onChange={(e) => update('backgroundOpacity', Number(e.currentTarget.value))}
            className="w-full accent-white"
          />
        </Field>
      </Section>
    </div>
  )
}
