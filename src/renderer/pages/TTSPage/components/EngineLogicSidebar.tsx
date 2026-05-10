import {IconCpu} from '@tabler/icons-react'
import { Toggle } from '../../../components/ui/Inputs'
import { TTSAudiencePermission } from '../../../../shared/app-settings'
import { commandPrefixOptions, audiencePermissionOptions } from '../constants'

interface EngineLogicSidebarProps {
  ttsRequireCommand: boolean
  ttsCommandPrefixes: string[]
  ttsAllowedRoles: TTSAudiencePermission[]
  ttsIgnoreEmotes: boolean
  ttsVolume: number
  onSetRequireCommand: (v: boolean) => void
  onSelectCommandPrefix: (prefix: string) => void
  onToggleAudiencePermission: (permission: TTSAudiencePermission) => void
  onUpdateSetting: (key: any, value: any) => void
}

export function EngineLogicSidebar({
  ttsRequireCommand,
  ttsCommandPrefixes,
  ttsAllowedRoles,
  ttsIgnoreEmotes,
  ttsVolume,
  onSetRequireCommand,
  onSelectCommandPrefix,
  onToggleAudiencePermission,
  onUpdateSetting
}: EngineLogicSidebarProps) {
  return (
    <section className="app-section-card glass">
      <div className="app-section-head">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center text-accent">
            <IconCpu size={32} />
          </div>
          <div>
            <h2>Engine Logic</h2>
            <p>Synthesis params.</p>
          </div>
        </div>
      </div>
      <div className="app-section-content">
        <div className="flex flex-col gap-6">
        {/* Implicit TTS row */}
        <div className="flex items-center justify-between gap-6">
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-white mb-0.5">Implicit TTS</h4>
            <p className="text-xs text-white/40">Speak all messages without prefix.</p>
          </div>
          <Toggle value={!ttsRequireCommand} onChange={(v) => onSetRequireCommand(!v)} />
        </div>

        {/* Ignore Emotes row */}
        <div className="flex items-center justify-between gap-6">
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-white mb-0.5">Ignore Emotes</h4>
            <p className="text-xs text-white/40">Don't speak Twitch emote names.</p>
          </div>
          <Toggle value={ttsIgnoreEmotes} onChange={(v) => onUpdateSetting('ttsIgnoreEmotes', v)} />
        </div>

        {/* Global Volume row */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-white mb-0.5">Global Volume</h4>
            <span className="text-xs font-mono text-accent">{Math.round(ttsVolume * 100)}%</span>
          </div>
          <div className="flex items-center gap-4">
            <input 
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={ttsVolume}
              onChange={(e) => onUpdateSetting('ttsVolume', parseFloat(e.target.value))}
              className="w-full h-1.5 bg-white/5 rounded-lg appearance-none cursor-pointer accent-accent"
            />
          </div>
        </div>

        {/* Command Prefix */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-black uppercase tracking-widest text-white/40">Command Prefix</label>
          <p className="text-xs text-white/40 leading-relaxed">
            When Implicit TTS is off, only chat messages starting with this character are spoken — e.g.{' '}
            <code className="font-mono text-white/70">
              {ttsCommandPrefixes[0] ?? '!'}tts hello
            </code>
            . Pick one.
          </p>
          <div role="radiogroup" aria-label="Command prefix" className="flex flex-wrap gap-2 mt-1">
            {commandPrefixOptions.map((opt) => {
              const active = ttsCommandPrefixes[0] === opt.value
              return (
                <button
                  key={opt.value}
                  onClick={() => onSelectCommandPrefix(opt.value)}
                  title={opt.label}
                  role="radio"
                  aria-checked={active}
                  className={`h-11 w-11 rounded-lg border flex items-center justify-center transition-all ${
                    active
                      ? 'bg-white border-white text-black shadow-[0_0_0_1px_rgba(255,255,255,0.1)]'
                      : 'bg-white/[0.03] border-white/5 text-white/50 hover:border-white/15 hover:text-white'
                  }`}
                >
                  <span className="text-lg font-black font-mono leading-none">{opt.value}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Access Control */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-black uppercase tracking-widest text-white/40">Access Control</label>
          <div className="rounded-lg border border-white/5 bg-white/[0.015] divide-y divide-white/[0.04] overflow-hidden">
            {audiencePermissionOptions.map((opt) => {
              const active = ttsAllowedRoles.includes(opt.value)
              const everyoneOn = ttsAllowedRoles.includes('everyone') && opt.value !== 'everyone'
              return (
                <button
                  key={opt.value}
                  onClick={() => onToggleAudiencePermission(opt.value)}
                  aria-pressed={active}
                  className={`w-full flex items-center justify-between gap-4 px-5 py-4 text-left transition-colors ${
                    active
                      ? 'bg-white/[0.06] text-white'
                      : everyoneOn
                        ? 'text-white/25 hover:bg-white/[0.02]'
                        : 'text-white/70 hover:bg-white/[0.03] hover:text-white'
                  }`}
                >
                  <span className="text-sm font-semibold">{opt.label}</span>
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                      active
                        ? 'bg-white border-white text-black'
                        : 'border-white/20 bg-transparent'
                    }`}
                  >
                    {active && (
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <path d="M2.5 6.5L5 9L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
          {ttsAllowedRoles.includes('everyone') && (
            <p className="text-xs text-white/30 italic mt-1">All users selected — other roles ignored.</p>
          )}
        </div>
      </div>
    </div>
  </section>
  )
}
