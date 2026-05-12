import React from 'react'
import {IconCpu, IconRadio, IconActivity, IconMouse, IconRefresh} from '@tabler/icons-react'
import { LogitechIcon } from '../../components/ui/LogitechIcon'

export default function LogitechPage() {
  return (
    <div className="app-page">
      <header className="app-page-header">
        <div className="flex items-center gap-6">
          <div className="flex items-center justify-center">
            <LogitechIcon size={48} />
          </div>
          <div>
            <h1>Logitech G-Series</h1>
            <p className="app-page-intro">
              Integrate your Logitech G peripherals. Synchronize LIGHTSYNC RGB with your stream highlights, 
              cooldowns, and viewer interactions via Logitech G-Hub.
            </p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <Metric 
          icon={<IconRadio size={20} />} 
          label="G-Hub Service" 
          value="INACTIVE" 
          sub="Service Standby"
          accent="text-danger"
        />
        <Metric 
          icon={<LogitechIcon size={26} />} 
          label="Synced Devices" 
          value="0" 
          sub="Hardware Units Found"
        />
        <Metric 
          icon={<IconActivity size={20} />} 
          label="LIGHTSYNC" 
          value="DISABLED" 
          sub="RGB Engine State"
          accent="text-blue-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-12">
          <section className="app-section-card glass flex flex-col min-h-[400px]">
            <div className="app-section-head">
              <div className="flex items-center gap-4">
                <h2>Device Discovery</h2>
                <p>Establishing communication with Logitech G-Hub.</p>
              </div>
              <button className="text-[10px] font-bold text-accent/60 hover:text-accent tracking-widest transition-colors flex items-center gap-2">
                <IconRefresh size={10} />
                Refresh
              </button>
            </div>

            <div className="flex-1 p-8 bg-white/[0.01] flex flex-col items-center justify-center text-center text-white/10 border border-dashed border-white/5 m-8 rounded-3xl">
              <IconMouse size={64} className="mb-4 opacity-10" />
              <p className="text-sm font-medium">No Logitech G devices detected.</p>
              <p className="text-xs text-white/5 mt-2">Make sure Logitech G-Hub is running and 'Allow games to control illumination' is enabled.</p>
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
