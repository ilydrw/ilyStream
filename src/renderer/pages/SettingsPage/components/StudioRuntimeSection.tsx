import { Database, MessageSquareText, RadioTower } from 'lucide-react'
import { Toggle } from '../../../components/ui/Inputs'
import type { RelayTagMode } from '../../../../shared/chat-relay'
import type { AppSettings } from '../../../../shared/app-settings'
import { NumberInput, SettingRow } from './SettingsShared'

interface StudioRuntimeSectionProps {
  settings: AppSettings
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
}

const relayModes: Array<{ value: RelayTagMode; label: string }> = [
  { value: 'platform-and-user', label: 'Platform + User' },
  { value: 'platform', label: 'Platform Only' },
  { value: 'none', label: 'Clean Relay' }
]

export function StudioRuntimeSection({ settings, onUpdate }: StudioRuntimeSectionProps) {
  return (
    <section className="app-section-card glass">
      <div className="app-section-head">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center text-accent">
            <Database size={32} />
          </div>
          <div>
            <h2>Runtime & Data</h2>
            <p>Chat retention and cross-platform relay behavior.</p>
          </div>
        </div>
      </div>

      <div className="app-section-content !p-0">
        <div className="p-8">
          <SettingRow label="Message Buffer" hint="How many chat events the renderer keeps hot before old entries roll off.">
            <NumberInput
              value={settings.chatMaxMessages}
              onChange={(value) => onUpdate('chatMaxMessages', value)}
              min={100}
              max={5000}
            />
          </SettingRow>

          <SettingRow label="Auto Relay" hint="Mirror eligible chat messages into connected platforms when relay is enabled.">
            <Toggle value={settings.chatAutoRelayEnabled} onChange={(value) => onUpdate('chatAutoRelayEnabled', value)} />
          </SettingRow>

          <SettingRow label="Relay Attribution" hint="Controls how relayed messages identify their source platform and sender.">
            <select
              value={settings.chatRelayTagMode}
              onChange={(event) => onUpdate('chatRelayTagMode', event.target.value as RelayTagMode)}
              className="h-11 w-56 rounded-xl border border-white/10 bg-black/40 px-4 text-sm font-medium transition-all hover:bg-black/60 focus:border-accent focus:outline-none"
            >
              {relayModes.map((mode) => (
                <option key={mode.value} value={mode.value}>{mode.label}</option>
              ))}
            </select>
          </SettingRow>

          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
              <MessageSquareText size={18} className="text-accent" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-white/25">Buffer</p>
                <p className="text-sm font-bold text-white">{settings.chatMaxMessages.toLocaleString()} events</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
              <RadioTower size={18} className="text-accent" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-white/25">Relay</p>
                <p className="text-sm font-bold text-white">{settings.chatAutoRelayEnabled ? 'Enabled' : 'Manual'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
