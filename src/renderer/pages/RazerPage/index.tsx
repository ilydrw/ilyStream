import React from 'react'
import {IconCpu, IconRadio, IconActivity, IconBolt, IconRefresh} from '@tabler/icons-react'
import { RazerIcon } from '../../components/ui/RazerIcon'

export default function RazerPage() {
  return (
    <div className="app-page">
      <header className="app-page-header">
        <div className="flex items-center gap-6">
          <div className="flex items-center justify-center">
            <RazerIcon size={48} branded />
          </div>
          <div>
            <h1>Razer Chroma</h1>
            <p className="app-page-intro">
              Unify your battlestation. Synchronize your Razer peripherals with stream events using the Chroma SDK. 
              Make your keyboard, mouse, and chair react to the hype.
            </p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <Metric 
          icon={<IconRadio size={20} />} 
          label="Chroma SDK" 
          value="DISCONNECTED" 
          sub="Service Link Failed"
          accent="text-danger"
        />
        <Metric 
          icon={<RazerIcon size={26} />} 
          label="Synced Peripherals" 
          value="0" 
          sub="Detected Hardware"
        />
        <Metric 
          icon={<IconActivity size={20} />} 
          label="Visualizer" 
          value="OFF" 
          sub="Audio Sync Engine"
          accent="text-green-400"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-12">
          <section className="app-section-card glass flex flex-col min-h-[400px]">
            <div className="app-section-head">
              <div className="flex items-center gap-4">
                <h2>Peripheral Discovery</h2>
                <p>Initializing Chroma broadcast session.</p>
              </div>
              <button className="text-[10px] font-bold text-accent/60 hover:text-accent tracking-widest transition-colors flex items-center gap-2">
                <IconRefresh size={10} />
                Restart SDK
              </button>
            </div>

            <div className="flex-1 p-8 bg-white/[0.01] flex flex-col items-center justify-center text-center text-white/10 border border-dashed border-white/5 m-8 rounded-3xl">
              <IconBolt size={64} className="mb-4 opacity-10" />
              <p className="text-sm font-medium">Razer Synapse not detected.</p>
              <p className="text-xs text-white/5 mt-2">Please ensure Razer Synapse is installed and Chroma Connect is enabled.</p>
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
