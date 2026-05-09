import React from 'react'
import { Globe, Rocket, Activity, Zap, ExternalLink } from 'lucide-react'
import { RestreamIcon } from '../../components/ui/RestreamIcon'

export default function RestreamPage() {
  return (
    <div className="app-page">
      <header className="app-page-header">
        <div>
          <div className="app-header-eyebrow">
            <Globe size={14} className="text-accent" />
            <span>Platform Integration</span>
          </div>
          <div className="flex items-center gap-4 mb-2">
            <RestreamIcon size={48} className="text-[#FF4C2F]" />
            <h1>ReStream</h1>
          </div>
          <p className="app-page-intro">
            The ultimate multi-streaming hub. Broadcast to 30+ platforms simultaneously and manage your cross-platform chat and alerts from a single dashboard.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <Metric 
          icon={<Rocket size={20} className="text-white/20" />} 
          label="Multi-Stream" 
          value="Disconnected" 
        />
        <Metric 
          icon={<RestreamIcon size={32} className="opacity-20" />} 
          label="Linked Targets" 
          value="0" 
        />
        <Metric 
          icon={<Activity size={20} className="text-orange-500" />} 
          label="Relay Status" 
          value="Idle" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-7">
          <section className="app-section-card glass p-10 h-full">
            <h2 className="text-xl font-bold mb-6">Connect ReStream API</h2>
            <div className="space-y-6">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">API Access Token</label>
                <input type="password" placeholder="Paste your ReStream Access Token..." className="app-input" />
              </div>
              <button className="app-button-primary w-full !h-14 text-xs font-black uppercase tracking-widest">
                Verify Connection
              </button>
              <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                <span className="text-xs text-white/20">Don't have a token?</span>
                <a href="#" className="text-xs font-bold text-accent flex items-center gap-2">
                  Get Token <ExternalLink size={12} />
                </a>
              </div>
            </div>
          </section>
        </div>

        <div className="lg:col-span-5">
          <section className="app-section-card glass p-10 bg-accent/5 border-accent/20">
            <Zap size={32} className="text-accent mb-4" />
            <h3 className="text-lg font-bold mb-2">Unified Analytics</h3>
            <p className="text-xs text-white/40 leading-relaxed">
              Once linked, IlyStream will pull combined viewer counts and chat metrics from all your ReStream destinations automatically.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

function Metric({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) {
  return (
    <div className="app-section-card glass !p-10 flex flex-col items-center justify-center text-center gap-4">
      <div className="mb-2 transform group-hover:scale-110 transition-transform duration-300">
        {icon}
      </div>
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-white/30 mb-2">{label}</p>
        <p className="text-4xl font-bold font-mono text-white">{value}</p>
      </div>
    </div>
  )
}
