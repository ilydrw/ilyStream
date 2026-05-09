import React from 'react'
import { Cpu, Radio, Activity, Lightbulb, RefreshCw } from 'lucide-react'
import { LifxIcon } from '../../components/ui/LifxIcon'

export default function LifxPage() {
  return (
    <div className="app-page">
      <header className="app-page-header">
        <div className="flex items-center gap-6">
          <div className="flex items-center justify-center">
            <LifxIcon size={48} branded />
          </div>
          <div>
            <div className="app-header-eyebrow">
              <Cpu size={14} className="text-accent" />
              <span>Service Integration</span>
            </div>
            <h1>LIFX Smart Lighting</h1>
            <p className="app-page-intro">
              Connect your high-performance LIFX bulbs and strips. 
              Leverage ultra-low latency local control for synchronized stream alerts.
            </p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <Metric 
          icon={<Radio size={20} />} 
          label="Cloud Connection" 
          value="OFFLINE" 
          sub="No active session"
          accent="text-danger"
        />
        <Metric 
          icon={<LifxIcon size={26} />} 
          label="Detected Bulbs" 
          value="0" 
          sub="Discovered Hardware"
        />
        <Metric 
          icon={<Activity size={20} />} 
          label="Latency" 
          value="--" 
          sub="LAN Performance"
          accent="text-purple-400"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-12">
          <section className="app-section-card glass flex flex-col min-h-[400px]">
            <div className="app-section-head">
              <div className="flex items-center gap-4">
                <h2>LIFX LAN Discovery</h2>
                <p>Scanning local network for LIFX devices.</p>
              </div>
              <button className="text-[10px] font-bold text-accent/60 hover:text-accent tracking-widest transition-colors flex items-center gap-2">
                <RefreshCw size={10} />
                Rescan
              </button>
            </div>

            <div className="flex-1 p-8 bg-white/[0.01] flex flex-col items-center justify-center text-center text-white/10 border border-dashed border-white/5 m-8 rounded-3xl">
              <Lightbulb size={64} className="mb-4 opacity-10" />
              <p className="text-sm font-medium">No LIFX devices found.</p>
              <p className="text-xs text-white/5 mt-2">Ensure your bulbs are powered on and on the same Wi-Fi network.</p>
            </div>
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
