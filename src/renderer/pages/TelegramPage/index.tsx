import React from 'react'
import {IconWorld, IconSend, IconActivity, IconLock, IconExternalLink} from '@tabler/icons-react'
import { TelegramIcon } from '../../components/ui/TelegramIcon'

export default function TelegramPage() {
  return (
    <div className="app-page">
      <header className="app-page-header">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <TelegramIcon size={48} className="text-[#24A1DE]" />
            <h1>Telegram Live</h1>
          </div>
          <p className="app-page-intro">
            Stream to your Telegram Channels and Groups. Reach your core community with secure, high-quality video broadcasts.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <Metric 
          icon={<IconSend size={20} className="text-white/20" />} 
          label="RTMP Status" 
          value="Ready" 
        />
        <Metric 
          icon={<TelegramIcon size={32} className="opacity-20" />} 
          label="Active Groups" 
          value="0" 
        />
        <Metric 
          icon={<IconLock size={20} className="text-green-400" />} 
          label="Encryption" 
          value="Active" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-8">
          <section className="app-section-card glass p-10 h-full">
            <h2 className="text-xl font-bold mb-6">Channel Configuration</h2>
            <div className="space-y-6">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Server URL</label>
                <div className="app-input bg-white/5 border-transparent text-white/40">rtmps://dc1-1.rtmp.t.me/s/</div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Stream Key</label>
                <input type="password" placeholder="Paste your Telegram Stream Key..." className="app-input" />
              </div>
              <button className="app-button-primary w-full !h-14 text-xs font-black uppercase tracking-widest">
                IconDeviceFloppy Stream Details
              </button>
            </div>
          </section>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <section className="app-section-card glass p-8 bg-blue-500/5 border-blue-500/20">
            <h3 className="text-sm font-bold mb-4">How to go Live</h3>
            <ol className="text-xs text-white/40 space-y-4 list-decimal list-inside leading-relaxed">
              <li>Open your Channel or Group on Telegram.</li>
              <li>Tap the three dots and select 'Stream With...'.</li>
              <li>IconCopy the Server URL and Stream Key into the fields on the left.</li>
              <li>Press 'Start Streaming' in IlyStream.</li>
            </ol>
          </section>
        </div>
      </div>
    </div>
  )
}

function Metric({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) {
  return (
    <div className="app-section-card glass !p-10 flex flex-col items-center justify-center text-center gap-4">
      <div className="mb-2">
        {icon}
      </div>
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-white/30 mb-2">{label}</p>
        <p className="text-4xl font-bold font-mono text-white">{value}</p>
      </div>
    </div>
  )
}
