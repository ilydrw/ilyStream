import {IconCpu} from '@tabler/icons-react'
import { Toggle } from '../../../components/ui/Inputs'
import { Select, type SelectOption } from '../../../components/ui/Select'
import { DEFAULT_TTS_CHAT_MESSAGE_TEMPLATE, TTSAudiencePermission, type AppSettings } from '../../../../shared/app-settings'
import type { VoiceProfile } from '../../../../main/tts/voice-profiles'
import { commandPrefixOptions, audiencePermissionOptions, voiceRoutingFields } from '../constants'

const chatTemplateTokens = [
  '{message}',
  '{username}',
  '{displayName}',
  '{platform}',
  '{mention}'
]

interface EngineLogicSidebarProps {
  ttsRequireCommand: boolean
  ttsCommandPrefixes: string[]
  ttsAllowedRoles: TTSAudiencePermission[]
  ttsIgnoreEmotes: boolean
  ttsVolume: number
  profiles: VoiceProfile[]
  settings: AppSettings
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
  profiles,
  settings,
  onSetRequireCommand,
  onSelectCommandPrefix,
  onToggleAudiencePermission,
  onUpdateSetting
}: EngineLogicSidebarProps) {
  const defaultProfile = profiles.find((p) => p.isDefault) ?? profiles[0]
  const chatMessageTemplate = settings.tts.chatMessageTemplate || DEFAULT_TTS_CHAT_MESSAGE_TEMPLATE
  const profileOptions: SelectOption[] = [
    {
      value: '',
      label: defaultProfile ? `Default · ${defaultProfile.name}` : 'Default profile',
      group: 'Default route'
    },
    ...profiles.map((profile) => ({
      value: profile.id,
      label: profile.name,
      group: formatProvider(profile.provider)
    }))
  ]
  return (
    <section className="app-section-card glass overflow-visible">
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
        {/* Voice Routing — assign profiles to event types */}
        <div className="flex flex-col gap-3 pb-6 border-b border-white/[0.04]">
          <label className="text-xs font-semibold tracking-tight text-white/40">Voice Routing</label>
          <p className="text-xs text-white/40 leading-relaxed">
            Pick which profile speaks each event. Default falls back to the profile marked default.
          </p>
          {voiceRoutingFields.map((field) => (
            <div key={field.key} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold text-white/70">{field.label}</span>
                <span className="text-[10px] text-white/30">{field.hint}</span>
              </div>
              <Select
                value={settings.tts[field.target] ?? ''}
                options={profileOptions}
                onChange={(value) => void onUpdateSetting(field.key, value)}
                buttonClassName="!h-10 !px-4 !text-xs"
                searchable
              />
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 pb-6 border-b border-white/[0.04]">
          <label className="text-xs font-semibold tracking-tight text-white/40">Chat Speech Format</label>
          <textarea
            value={chatMessageTemplate}
            onChange={(event) => onUpdateSetting('ttsChatMessageTemplate', event.currentTarget.value)}
            placeholder={DEFAULT_TTS_CHAT_MESSAGE_TEMPLATE}
            rows={2}
            className="app-textarea !min-h-[76px] !px-4 !py-3 !text-sm font-mono leading-relaxed resize-none"
          />
          <div className="flex flex-wrap gap-2">
            {chatTemplateTokens.map((token) => (
              <button
                key={token}
                type="button"
                onClick={() => onUpdateSetting('ttsChatMessageTemplate', appendTemplateToken(chatMessageTemplate, token))}
                className="h-8 rounded-md border border-white/5 bg-white/[0.03] px-2.5 font-mono text-[11px] font-semibold text-white/50 transition-colors hover:border-white/15 hover:text-white"
              >
                {token}
              </button>
            ))}
          </div>
          <p className="text-xs text-white/35 leading-relaxed">
            Example: <code className="font-mono text-white/65">{'{username} says {message}'}</code>
          </p>
        </div>

        {/* Implicit TTS row */}
        <div className="flex items-center justify-between gap-6">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-white mb-0.5">Implicit TTS</h4>
            <p className="text-xs text-white/40">Speak all messages without prefix.</p>
          </div>
          <Toggle value={!ttsRequireCommand} onChange={(v) => onSetRequireCommand(!v)} />
        </div>

        {/* Ignore Emotes row */}
        <div className="flex items-center justify-between gap-6">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-white mb-0.5">Ignore Emotes</h4>
            <p className="text-xs text-white/40">Don't speak Twitch emote names.</p>
          </div>
          <Toggle value={ttsIgnoreEmotes} onChange={(v) => onUpdateSetting('ttsIgnoreEmotes', v)} />
        </div>

        {/* Global Volume row */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-white mb-0.5">Global Volume</h4>
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
          <label className="text-xs font-semibold tracking-tight text-white/40">Command Prefix</label>
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
                  className={`h-11 w-11 rounded-lg border flex items-center justify-center transition-all ${ active ? 'bg-white border-white text-black shadow-[0_0_0_1px_rgba(255,255,255,0.1)]' : 'bg-white/[0.03] border-white/5 text-white/50 hover:border-white/15 hover:text-white' }`}
                >
                  <span className="text-lg font-semibold font-mono leading-none">{opt.value}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Access Control */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold tracking-tight text-white/40">Access Control</label>
          <div className="rounded-lg border border-white/5 bg-white/[0.015] divide-y divide-white/[0.04] overflow-hidden">
            {audiencePermissionOptions.map((opt) => {
              const active = ttsAllowedRoles.includes(opt.value)
              const everyoneOn = ttsAllowedRoles.includes('everyone') && opt.value !== 'everyone'
              return (
                <button
                  key={opt.value}
                  onClick={() => onToggleAudiencePermission(opt.value)}
                  aria-pressed={active}
                  className={`w-full flex items-center justify-between gap-4 px-5 py-4 text-left transition-colors ${ active ? 'bg-white/[0.06] text-white' : everyoneOn ? 'text-white/25 hover:bg-white/[0.02]' : 'text-white/70 hover:bg-white/[0.03] hover:text-white' }`}
                >
                  <span className="text-sm font-semibold">{opt.label}</span>
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${ active ? 'bg-white border-white text-black' : 'border-white/20 bg-transparent' }`}
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

function appendTemplateToken(template: string, token: string): string {
  const trimmed = template.trimEnd()
  return trimmed ? `${trimmed} ${token}` : token
}

function formatProvider(provider?: string): string {
  if (provider === 'elevenlabs') return 'ElevenLabs'
  if (provider === 'kokoro') return 'Kokoro'
  return 'System'
}
