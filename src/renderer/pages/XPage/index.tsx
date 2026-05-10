import {IconMessage2, IconRadio, IconSend, IconBrandTwitter, IconWifi, IconBolt} from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { 
  PlatformPageHeader, 
  Metric, 
  StatusBadge, 
  DiagnosticLine 
} from '../../components/platforms/PlatformPageLayout'

const PLATFORM_ID = 'x'
const FIELDS = [
  { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'X Developer API Key' },
  { key: 'apiSecret', label: 'API Secret', type: 'password', placeholder: 'X Developer API Secret' },
  { key: 'bearerToken', label: 'Bearer Token', type: 'password', placeholder: 'X Bearer Token' },
  { key: 'username', label: 'Handle', type: 'text', placeholder: '@yourhandle' }
]

export default function XPage() {
  const [config, setConfig] = useState<Record<string, string>>({})
  const [status, setStatus] = useState('disconnected')

  return (
    <div className="app-page">
      <PlatformPageHeader 
        platformId={PLATFORM_ID as any}
        title="X (Twitter) Integration"
        description="Connect your X account to monitor real-time mentions, sentiment, and trending topics. Feed your AI Co-Host with the pulse of the internet."
        icon={<IconBrandTwitter size={14} />}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-20">
        <Metric 
          icon={<IconBolt size={20} className="text-accent" />} 
          label="Sentiment Pulse" 
          value="Neutral" 
        />
        <Metric 
          icon={<IconBrandTwitter size={20} className="text-info" />} 
          label="Active Mentions" 
          value="0" 
        />
        <Metric 
          icon={<IconWifi size={20} className="text-white/20" />} 
          label="Stream Health" 
          value="Standby" 
        />
      </div>

      <div className="grid gap-16 xl:grid-cols-[1fr_450px]">
        <div className="flex flex-col gap-16">
          <section className="app-section-card glass">
            <div className="app-section-head">
              <div>
                <h2>Developer Settings</h2>
                <p>Configure X Developer Portal credentials.</p>
              </div>
              <StatusBadge status={status} />
            </div>

            <div className="grid gap-10 p-12 md:grid-cols-2 bg-white/[0.01]">
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
              <button className="app-button-primary !h-12 !px-10 text-sm font-bold">
                Authorize Service
              </button>
            </div>
          </section>

          <section className="app-section-card glass overflow-hidden">
            <div className="app-section-head">
              <div>
                <h2>Intelligence Feed</h2>
                <p>Status of the X real-time filtering engine.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-12">
              <DiagnosticLine
                icon={<IconRadio size={16} />}
                label="Stream API"
                value="Disconnected"
                tone="muted"
              />
              <DiagnosticLine
                icon={<IconSend size={16} />}
                label="Automated Replies"
                value="Restricted"
                tone="muted"
              />
            </div>
          </section>
        </div>

        <section className="app-section-card glass flex flex-col">
          <div className="flex items-center justify-between px-8 py-5 border-b border-white/5 bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <IconMessage2 size={18} className="text-info" />
              <h2 className="!text-lg">Mention Feed</h2>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar min-h-[500px]">
            <div className="flex flex-col items-center justify-center h-full text-white/10 p-12 text-center">
              <IconBrandTwitter size={48} className="mb-6 opacity-10" />
              <p className="text-sm font-medium">Waiting for X stream initialization...</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
