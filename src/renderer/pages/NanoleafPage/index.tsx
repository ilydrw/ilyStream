import React from 'react'
import { Cpu, Radio, Activity, LayoutGrid, RefreshCw } from 'lucide-react'
import { NanoleafIcon } from '../../components/ui/NanoleafIcon'

export default function NanoleafPage() {
  return (
    <div className="app-page">
      <header className="app-page-header">
        <div className="flex items-center gap-6">
          <NanoleafIcon size={48} branded />
          <div>
            <div className="app-header-eyebrow">
              <Cpu size={14} className="text-accent" />
              <span>Service Integration</span>
            </div>
            <h1>Nanoleaf Panels</h1>
            <p className="app-page-intro">
              Synchronize your Nanoleaf Shapes, Lines, and Canvas with your stream. 
              Create immersive atmospheric lighting that reacts to gifts, subs, and raids.
            </p>
          </div>
        </div>
      </header>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <Metric 
          icon={<Radio size={20} />} 
          label="Local API" 
          value="SEARCHING" 
          sub="Discovery Ongoing"
          accent="text-muted"
        />
        <Metric 
          icon={<NanoleafIcon size={26} />} 
          label="Panels Detected" 
          value="0" 
          sub="Discovered Hardware"
        />
        <Metric 
          icon={<Activity size={20} />} 
          label="Sync Engine" 
          value="IDLE" 
          sub="Awaiting Signal"
          accent="text-orange-400"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-8">
          <section className="app-section-card glass h-full flex flex-col min-h-[400px]">
            <div className="app-section-head">
              <div className="flex items-center gap-4">
                <h2>Layout Discovery</h2>
                <p>Detecting physical panel arrangements.</p>
              </div>
              <button className="text-[10px] font-bold text-accent/60 hover:text-accent tracking-widest transition-colors flex items-center gap-2">
                <RefreshCw size={10} />
                Refresh
              </button>
            </div>

            <div className="flex-1 p-8 bg-white/[0.01] flex flex-col items-center justify-center text-center text-white/10 border border-dashed border-white/5 m-8 rounded-3xl">
              <LayoutGrid size={64} className="mb-4 opacity-10" />
              <p className="text-sm font-medium">No Nanoleaf controllers found on your network.</p>
              <p className="text-xs text-white/5 mt-2">Ensure 'External Control' is enabled in the Nanoleaf App.</p>
            </div>
          </section>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <section className="app-section-card glass p-8">
            <h3 className="text-sm font-bold mb-4">Pairing Mode</h3>
            <p className="text-xs text-white/40 leading-relaxed mb-6">
              To pair a new controller, hold the power button on the Nanoleaf controller for 5-7 seconds until the LED flashes.
            </p>
            <button className="app-button-primary w-full !h-12 text-xs font-black uppercase tracking-widest">
              Start Pairing
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}

function Metric({ icon, label, value, sub, accent = 'text-accent' }: { icon: any; label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="app-section-card glass !p-6 hover:border-white/10 transition-all group">
      <div className={`mb-3 transform group-hover:scale-110 transition-transform duration-300 ${accent}`}>{icon}</div>
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20 mb-1">{label}</div>
      <div className="text-xl font-black text-white tabular-nums leading-none mb-1">{value}</div>
      {sub && <div className="text-[9px] font-black text-white/10 uppercase tracking-wider">{sub}</div>}
    </div>
  )
}
