import { Bell, Layout, MessageSquare, Send, ShieldCheck, Wifi } from 'lucide-react'
import { useState } from 'react'
import { 
  PlatformPageHeader, 
  Metric, 
  StatusBadge, 
  DiagnosticLine 
} from '../../components/platforms/PlatformPageLayout'

const PLATFORM_ID = 'discord'
const FIELDS = [
  { key: 'webhookUrl', label: 'Webhook URL', type: 'text', placeholder: 'https://discord.com/api/webhooks/...' },
  { key: 'botToken', label: 'Bot Token', type: 'password', placeholder: 'Discord Bot Token' },
  { key: 'clientId', label: 'Client ID', type: 'text', placeholder: 'Discord Application ID' }
]

export default function DiscordPage() {
  const [config, setConfig] = useState<Record<string, string>>({})
  const [status, setStatus] = useState('disconnected')

  return (
    <div className="app-page">
      <PlatformPageHeader 
        platformId={PLATFORM_ID as any}
        title="Discord Integration"
        description="Bridge your stream community to your Discord server. Send automated alerts, sync chat messages, and manage roles based on viewer activity."
        icon={<MessageSquare size={14} />}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-20">
        <Metric 
          icon={<Bell size={20} className="text-indigo-400" />} 
          label="Active Webhooks" 
          value="0" 
        />
        <Metric 
          icon={<ShieldCheck size={20} className="text-success" />} 
          label="Bot Status" 
          value="Standby" 
        />
        <Metric 
          icon={<Layout size={20} className="text-accent" />} 
          label="Presence Sync" 
          value="Off" 
        />
      </div>

      <div className="grid gap-16 xl:grid-cols-[1fr_450px]">
        <div className="flex flex-col gap-16">
          <section className="app-section-card glass">
            <div className="app-section-head">
              <div>
                <h2>Integration Core</h2>
                <p>Connect your Discord Application or Webhooks.</p>
              </div>
              <StatusBadge status={status} />
            </div>

            <div className="grid gap-10 p-12 md:grid-cols-1 bg-white/[0.01]">
              {FIELDS.map((field) => (
                <div key={field.key} className="flex flex-col gap-2">
                  <label className="text-xs font-black uppercase tracking-widest text-white/30">{field.label}</label>
                  <input
                    type={field.type}
                    placeholder={field.placeholder}
                    value={config[field.key] || ''}
                    onChange={(e) => setConfig(prev => ({ ...prev, [field.key]: e.target.value }))}
                    className="app-input"
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-6 p-10 border-t border-white/5 mt-auto">
              <button className="app-button-primary !h-12 !px-10 text-sm font-bold shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)]">
                Connect Discord
              </button>
            </div>
          </section>

          <section className="app-section-card glass overflow-hidden">
            <div className="app-section-head">
              <div>
                <h2>Bridge Status</h2>
                <p>Diagnostic telemetry for Discord connectivity.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-12">
              <DiagnosticLine
                icon={<Wifi size={16} />}
                label="Gateway Socket"
                value="Offline"
                tone="muted"
              />
              <DiagnosticLine
                icon={<Send size={16} />}
                label="Webhook Delivery"
                value="Standby"
                tone="muted"
              />
            </div>
          </section>
        </div>

        <section className="app-section-card glass flex flex-col">
          <div className="flex items-center justify-between px-8 py-5 border-b border-white/5 bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <MessageSquare size={18} className="text-indigo-400" />
              <h2 className="!text-lg">Relay Log</h2>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar min-h-[500px]">
            <div className="flex flex-col items-center justify-center h-full text-white/10 p-12 text-center">
              <MessageSquare size={48} className="mb-6 opacity-10" />
              <p className="text-sm font-medium">Waiting for Discord bridge activity...</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
