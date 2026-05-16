import React, { useState } from 'react'
import {IconCpu, IconRadio, IconDeviceDesktop, IconBulb, IconKeyboard, IconPlus, IconRefresh, IconExternalLink} from '@tabler/icons-react'
import { motion } from 'framer-motion'
import { ElgatoIcon } from '../../components/ui/ElgatoIcon'

function Metric({ icon, label, value, sub, accent = 'text-accent' }: { icon: any; label: string; value: string; sub: string; accent?: string }) {
  return (
    <div className="app-section-card glass !p-6 hover:border-white/10 transition-all group">
      <div className={`mb-3 transform group-hover:scale-110 transition-transform duration-300 ${accent}`}>{icon}</div>
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20 mb-1">{label}</div>
      <div className="text-xl font-black text-white tabular-nums leading-none mb-1">{value}</div>
      <div className="text-[9px] font-black text-white/10 uppercase tracking-wider">{sub}</div>
    </div>
  )
}

interface ElgatoDevice {
  id: string
  name: string
  type: 'light' | 'deck' | 'display' | 'other'
  status: 'connected' | 'offline'
  ip?: string
}

export default function ElgatoPage() {
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [devices, setDevices] = useState<ElgatoDevice[]>([])

  const handleDiscover = () => {
    setIsDiscovering(true)
    setTimeout(() => setIsDiscovering(false), 2000)
  }

  return (
    <div className="app-page">
      <header className="app-page-header">
        <div className="flex items-center gap-6">
          <div className="flex items-center justify-center">
            <ElgatoIcon size={48} />
          </div>
          <div>
            <h1>Elgato Ecosystem</h1>
            <p className="app-page-intro">
              Manage your Stream Deck, Key Lights, and Prompter.
              Create unified studio scenes and automate your production hardware.
            </p>
          </div>
        </div>
      </header>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <Metric icon={<IconRadio size={20} />} label="Control Center" value="OFFLINE" sub="Searching..." accent="text-danger" />
        <Metric icon={<IconBulb size={20} />} label="Lights Found" value="0" sub="No lights detected" />
        <Metric icon={<IconDeviceDesktop size={20} />} label="Controllers" value="0" sub="No Stream Deck detected" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Device IconList */}
        <div className="lg:col-span-8 space-y-8">
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-3">
                Discovered Hardware
                <span className="px-2 py-0.5 rounded-md bg-white/5 text-[10px] font-bold text-white/40">
                  {devices.length}
                </span>
              </h2>
              <button
                onClick={handleDiscover}
                disabled={isDiscovering}
                className="flex items-center gap-2 !h-10 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
              >
                <IconRefresh size={14} className={isDiscovering ? 'animate-spin' : ''} />
                {isDiscovering ? 'Scanning...' : 'Scan for Devices'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {devices.length > 0 ? (
                devices.map(device => (
                  <div key={device.id} className="bg-white/[0.02] border border-white/5 p-5 rounded-2xl hover:border-white/10 transition-all group">
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-12 h-12 flex items-center justify-center text-white/20 group-hover:text-white transition-colors">
                        {device.type === 'light' && <IconBulb size={32} />}
                        {device.type === 'deck' && <IconKeyboard size={32} />}
                        {device.type === 'display' && <IconDeviceDesktop size={32} />}
                      </div>
                      <div className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                        device.status === 'connected' ? 'bg-success/10 text-success' : 'bg-white/5 text-white/20'
                      }`}>
                        {device.status}
                      </div>
                    </div>
                    <div>
                      <h3 className="font-bold text-sm mb-1">{device.name}</h3>
                      <p className="text-[10px] text-white/30 font-medium">
                        {device.ip || 'USB Connection'}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-2 border border-dashed border-white/5 rounded-2xl p-10 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-white/10 mb-4">
                    <IconCpu size={32} />
                  </div>
                  <h3 className="font-bold text-white/40 mb-1">No Hardware Found</h3>
                  <p className="text-xs text-white/20 max-w-[240px]">
                    Ensure your Elgato software is running and devices are on the same network.
                  </p>
                </div>
              )}
              <button className="border-2 border-dashed border-white/5 rounded-2xl p-5 flex flex-col items-center justify-center gap-2 hover:border-accent/30 hover:bg-accent/5 transition-all text-white/20 hover:text-accent">
                <IconPlus size={24} />
                <span className="text-[10px] font-black uppercase tracking-widest">Add Manual IP</span>
              </button>
            </div>
          </section>
        </div>

        {/* Sidebar Actions */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-gradient-to-br from-accent/20 to-transparent border border-accent/20 p-6 rounded-3xl relative overflow-hidden group">
            <div className="relative z-10">
              <h3 className="text-lg font-bold mb-2">Production Scenes</h3>
              <p className="text-xs text-white/60 mb-6 leading-relaxed">
                Create macros that control multiple Elgato devices at once. Sync your Key Lights with your Prompter script.
              </p>
              <button className="w-full py-3 rounded-2xl bg-brand-gradient text-white font-black text-xs uppercase tracking-widest hover:scale-[1.02] transition-all shadow-glow">
                Configure Scenes
              </button>
            </div>
            <ElgatoIcon size={120} className="absolute -right-10 -bottom-10 text-accent/10 rotate-12 group-hover:rotate-0 transition-transform duration-500" />
          </div>

          <div className="bg-white/[0.03] border border-white/5 p-6 rounded-3xl">
            <h3 className="text-sm font-bold mb-4">Advanced Settings</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/40 font-medium">Auto-Discovery</span>
                <div className="w-8 h-4 bg-accent rounded-full relative">
                  <div className="absolute right-0.5 top-0.5 w-3 h-3 bg-black rounded-full" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/40 font-medium">Brightness Link</span>
                <div className="w-8 h-4 bg-white/10 rounded-full relative">
                  <div className="absolute left-0.5 top-0.5 w-3 h-3 bg-white/20 rounded-full" />
                </div>
              </div>
            </div>
            <div className="mt-8 pt-6 border-t border-white/5">
              <button className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/20 hover:text-white transition-colors">
                <IconExternalLink size={12} />
                Elgato Support
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
